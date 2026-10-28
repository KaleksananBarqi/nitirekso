use crate::credentials::{load_credentials, SUPPORTED_EXCHANGES};
use crate::db::repositories::balances::{upsert_balances, upsert_balances_tx};
use crate::db::repositories::sync::{
    apply_funding_to_trades_window, get_sync_state, link_fills_to_trades_window, update_sync_state,
    update_sync_state_full, upsert_fills_tx, upsert_funding_fees_tx, upsert_positions_tx,
};
use crate::db::DbState;
use crate::exchanges::bitunix::BitunixClient;
use crate::exchanges::mexc::MexcClient;
use crate::exchanges::{AnyExchangeAdapter, ExchangeAdapter};
use crate::models::AccountBalance;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProgressPayload {
    pub exchange: String,
    pub stage: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncExchangeResult {
    pub exchange: String,
    pub status: String, // "ok", "partial", "error"
    pub inserted: usize,
    pub updated: usize,
    pub was_full_backfill: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncRunResult {
    pub status: String, // "ok", "partial", "error"
    pub exchanges: Vec<SyncExchangeResult>,
    pub duration_ms: i64,
}

fn emit_progress(app: Option<&AppHandle>, exchange: &str, stage: &str, message: &str) {
    if let Some(app_handle) = app {
        let _ = app_handle.emit(
            "sync:progress",
            SyncProgressPayload {
                exchange: exchange.to_string(),
                stage: stage.to_string(),
                message: message.to_string(),
            },
        );
    }
}

pub async fn sync_exchange<A: ExchangeAdapter>(
    db_state: &DbState,
    adapter: &A,
    app: Option<&AppHandle>,
) -> SyncExchangeResult {
    let exchange = adapter.id();

    // Baca state sinkronisasi awal sebelum fetching tanpa menahan lock database
    let started_state = {
        let conn = db_state.conn.lock().unwrap();
        get_sync_state(&conn, exchange)
            .unwrap_or_else(|_| crate::db::repositories::sync::SyncState::empty(exchange))
    };

    let cursor = started_state.cursor();
    let was_full_backfill = cursor.last_exit_time.is_none();

    // =========================================================================
    // Fase 1: Network Ingestion (Zero Lock)
    // Menarik seluruh data dari exchange secara murni asinkron tanpa menahan
    // mutex lock database pada setiap .await
    // =========================================================================

    // Tahap 1.1: Posisi Tertutup (Data Pokok)
    emit_progress(
        app,
        exchange,
        "positions",
        if was_full_backfill {
            "Menarik seluruh histori posisi (sync pertama)…"
        } else {
            "Menarik posisi baru…"
        },
    );

    let raw_positions = match adapter.fetch_closed_positions(&cursor).await {
        Ok(pos) => pos,
        Err(e) => {
            log::error!("[sync:{}] Gagal fetch posisi: {}", exchange, e);
            let conn = db_state.conn.lock().unwrap();
            let _ = update_sync_state(&conn, exchange, None, None, Some("error"), Some(&e));
            return SyncExchangeResult {
                exchange: exchange.to_string(),
                status: "error".to_string(),
                inserted: 0,
                updated: 0,
                was_full_backfill,
                error: Some(e),
            };
        }
    };

    let mut new_exit_time = cursor.last_exit_time;
    let mut new_external_id = cursor.last_external_id.clone();
    for pos in &raw_positions {
        if new_exit_time.is_none() || Some(pos.exit_time) > new_exit_time {
            new_exit_time = Some(pos.exit_time);
            new_external_id = Some(pos.external_id.clone());
        }
    }

    let mut partial_errors = Vec::new();

    // Tahap 1.2: Eksekusi Pesanan / Fills (Bukti Audit Granular)
    emit_progress(app, exchange, "fills", "Menarik riwayat eksekusi…");
    let mut fetched_fills = None;
    let mut new_fill_time = cursor.last_fill_time;
    let mut new_fill_id = cursor.last_fill_id.clone();

    match adapter.fetch_fills(&cursor).await {
        Ok(fills) => {
            for fill in &fills {
                if new_fill_time.is_none() || Some(fill.filled_at) > new_fill_time {
                    new_fill_time = Some(fill.filled_at);
                    new_fill_id = Some(fill.external_id.clone());
                }
            }
            fetched_fills = Some(fills);
        }
        Err(e) => {
            log::warn!("[sync:{}] Fetch fills gagal: {}", exchange, e);
            partial_errors.push(format!("Fills gagal: {}", e));
        }
    }

    // Tahap 1.3: Biaya Pendanaan / Funding Fees
    emit_progress(app, exchange, "funding", "Menarik catatan funding…");
    let mut fetched_fees = None;
    let mut new_funding_time = cursor.last_funding_time;

    match adapter.fetch_funding_fees(&cursor).await {
        Ok(fees) => {
            for fee in &fees {
                if new_funding_time.is_none() || Some(fee.charged_at) > new_funding_time {
                    new_funding_time = Some(fee.charged_at);
                }
            }
            fetched_fees = Some(fees);
        }
        Err(e) => {
            log::warn!("[sync:{}] Fetch funding gagal: {}", exchange, e);
            partial_errors.push(format!("Funding gagal: {}", e));
        }
    }

    // Tahap 1.4: Saldo Akun / Balances
    emit_progress(app, exchange, "balances", "Menarik saldo akun…");
    let mut fetched_balances = None;

    match adapter.fetch_balances().await {
        Ok(raw_balances) => {
            let balances: Vec<AccountBalance> =
                raw_balances.into_iter().map(AccountBalance::from).collect();
            fetched_balances = Some(balances);
        }
        Err(e) => {
            log::warn!("[sync:{}] Fetch balances gagal: {}", exchange, e);
            partial_errors.push(format!("Saldo gagal: {}", e));
        }
    }

    // =========================================================================
    // Fase 2: Atomic Database Ingestion
    // Mengunci db_state.conn SATU KALI dan menjalankan transaksi SQLite tunggal
    // (upsert posisi, fills, funding, rekonsiliasi inkremental, saldo, & kursor)
    // =========================================================================

    emit_progress(
        app,
        exchange,
        "reconcile",
        "Menyimpan data dan merekonsiliasi posisi…",
    );

    // Hitung jendela waktu rekonsiliasi inkremental berdasarkan batch saat ini
    let min_pos_entry = raw_positions.iter().map(|p| p.entry_time).min();
    let min_fee_time = fetched_fees
        .as_ref()
        .and_then(|fees| fees.iter().map(|f| f.charged_at).min());
    let min_fill_time = fetched_fills
        .as_ref()
        .and_then(|fills| fills.iter().map(|f| f.filled_at).min());

    let min_touched_time = if was_full_backfill {
        None
    } else {
        match (min_pos_entry, min_fee_time) {
            (Some(p), Some(f)) => Some(p.min(f)),
            (Some(p), None) => Some(p),
            (None, Some(f)) => Some(f),
            (None, None) => None,
        }
    };

    let min_filled_at = if was_full_backfill {
        None
    } else {
        match (min_pos_entry, min_fill_time) {
            (Some(p), Some(f)) => Some(p.min(f)),
            (Some(p), None) => Some(p),
            (None, Some(f)) => Some(f),
            (None, None) => None,
        }
    };

    let status = if partial_errors.is_empty() {
        "ok"
    } else {
        "partial"
    };
    let error_msg = if partial_errors.is_empty() {
        None
    } else {
        Some(partial_errors.join("; "))
    };

    let mut conn = db_state.conn.lock().unwrap();

    let tx_result = (|| -> rusqlite::Result<crate::db::repositories::sync::UpsertResult> {
        let tx = conn.transaction()?;

        // 1. Batch upsert posisi tertutup
        let positions_result = upsert_positions_tx(&tx, exchange, &raw_positions)?;

        // 2. Batch upsert fills (jika berhasil ditarik)
        if let Some(fills) = &fetched_fills {
            upsert_fills_tx(&tx, exchange, fills)?;
        }

        // 3. Batch upsert funding fees (jika berhasil ditarik)
        if let Some(fees) = &fetched_fees {
            upsert_funding_fees_tx(&tx, exchange, fees)?;
        }

        // 4. Rekonsiliasi inkremental terikat jendela waktu
        apply_funding_to_trades_window(&tx, exchange, min_touched_time)?;
        link_fills_to_trades_window(&tx, exchange, min_filled_at)?;

        // 5. Batch upsert saldo akun (jika berhasil ditarik)
        if let Some(balances) = &fetched_balances {
            upsert_balances_tx(&tx, balances)?;
        }

        // 6. Pembaruan state sinkronisasi dan kursor stream asimetris
        update_sync_state_full(
            &tx,
            exchange,
            new_exit_time,
            new_external_id.as_deref(),
            new_fill_time,
            new_fill_id.as_deref(),
            new_funding_time,
            Some(status),
            error_msg.as_deref(),
        )?;

        // 7. Commit transaksi atomik
        tx.commit()?;
        Ok(positions_result)
    })();

    let positions_result = match tx_result {
        Ok(res) => res,
        Err(e) => {
            log::error!(
                "[sync:{}] Gagal mengeksekusi commit transaksi database: {}",
                exchange,
                e
            );
            let _ = update_sync_state(
                &conn,
                exchange,
                None,
                None,
                Some("error"),
                Some(&e.to_string()),
            );
            return SyncExchangeResult {
                exchange: exchange.to_string(),
                status: "error".to_string(),
                inserted: 0,
                updated: 0,
                was_full_backfill,
                error: Some(e.to_string()),
            };
        }
    };

    emit_progress(app, exchange, "done", "Selesai");

    SyncExchangeResult {
        exchange: exchange.to_string(),
        status: status.to_string(),
        inserted: positions_result.inserted,
        updated: positions_result.updated,
        was_full_backfill,
        error: error_msg,
    }
}

pub async fn sync_all(
    db_state: &DbState,
    app: Option<&AppHandle>,
) -> Result<SyncRunResult, String> {
    let start_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let mut adapters = Vec::new();
    let mut skipped = Vec::new();

    for &ex in SUPPORTED_EXCHANGES {
        if let Some(creds) = load_credentials(ex) {
            match ex {
                "mexc" => adapters.push(AnyExchangeAdapter::Mexc(MexcClient::new(&creds))),
                "bitunix" => adapters.push(AnyExchangeAdapter::Bitunix(BitunixClient::new(&creds))),
                _ => skipped.push(ex),
            }
        } else {
            skipped.push(ex);
        }
    }

    if adapters.is_empty() {
        return Err(format!(
            "Belum ada kredensial exchange yang tersimpan (tersedia: {}). Harap simpan API Key di Settings.",
            SUPPORTED_EXCHANGES.join(", ")
        ));
    }

    let mut results = Vec::new();
    for adapter in &adapters {
        let res = sync_exchange(db_state, adapter, app).await;
        results.push(res);
    }

    let has_error = results.iter().any(|r| r.status == "error");
    let has_partial = results.iter().any(|r| r.status == "partial");
    let overall_status = if has_error {
        if results.iter().all(|r| r.status == "error") {
            "error"
        } else {
            "partial"
        }
    } else if has_partial {
        "partial"
    } else {
        "ok"
    };

    let duration_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
        - start_time;

    Ok(SyncRunResult {
        status: overall_status.to_string(),
        exchanges: results,
        duration_ms,
    })
}

pub async fn sync_balances_all(
    db_state: &DbState,
) -> Result<Vec<AccountBalance>, String> {
    let mut adapters = Vec::new();

    for &ex in SUPPORTED_EXCHANGES {
        if let Some(creds) = load_credentials(ex) {
            match ex {
                "mexc" => adapters.push(AnyExchangeAdapter::Mexc(MexcClient::new(&creds))),
                "bitunix" => adapters.push(AnyExchangeAdapter::Bitunix(BitunixClient::new(&creds))),
                _ => {}
            }
        }
    }

    if adapters.is_empty() {
        return Err("Tidak ada exchange yang terhubung dengan kredensial tersimpan".to_string());
    }

    let mut all_balances = Vec::new();
    let mut errors = Vec::new();

    for adapter in &adapters {
        match adapter.fetch_balances().await {
            Ok(raw) => {
                let balances: Vec<AccountBalance> = raw.into_iter().map(AccountBalance::from).collect();
                {
                    let mut conn = db_state.conn.lock().unwrap();
                    let _ = upsert_balances(&mut conn, &balances);
                }
                all_balances.extend(balances);
            }
            Err(e) => {
                errors.push(format!("{}: {}", adapter.display_name(), e));
            }
        }
    }

    if all_balances.is_empty() && !errors.is_empty() {
        return Err(format!("Gagal mengambil saldo: {}", errors.join(" | ")));
    }

    let conn = db_state.conn.lock().unwrap();
    crate::db::repositories::balances::get_all_balances(&conn).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::run_migrations;
    use crate::exchanges::mock::MockExchangeAdapter;
    use crate::exchanges::types::{RawAccountBalance, RawClosedPosition, RawFill, RawFundingFee};
    use rusqlite::Connection;
    use std::sync::Mutex;

    /// Inisialisasi DbState in-memory lengkap dengan seluruh migrasi database
    fn setup_test_db_state() -> DbState {
        let mut conn = Connection::open_in_memory().expect("Buka koneksi DB in-memory");
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        run_migrations(&mut conn).expect("Migrasi DB harus berhasil");
        DbState {
            conn: Mutex::new(conn),
            db_path: std::path::PathBuf::from(":memory:"),
        }
    }

    /// Helper membuat posisi tertutup untuk keperluan pengujian
    fn create_test_position(
        external_id: &str,
        symbol: &str,
        entry_time: i64,
        exit_time: i64,
        pnl: f64,
    ) -> RawClosedPosition {
        RawClosedPosition {
            external_id: external_id.to_string(),
            symbol: symbol.to_string(),
            direction: "long".to_string(),
            entry_price: 50_000.0,
            exit_price: 52_000.0,
            entry_time,
            exit_time,
            size: 1.0,
            leverage: 10.0,
            margin_mode: Some("isolated".to_string()),
            realized_pnl: pnl,
            fee_open: 5.0,
            fee_close: 5.0,
            funding_fee: 0.0,
            raw: None,
        }
    }

    #[tokio::test]
    async fn test_sync_exchange_complete_two_phase_pipeline_success() {
        let db_state = setup_test_db_state();
        let exchange = "mexc";

        // Tahap 1: Sinkronisasi pertama (Full Backfill)
        let pos1 = create_test_position("pos-1", "BTCUSDT", 1_000_000, 2_000_000, 200.0);
        let pos2 = create_test_position("pos-2", "BTCUSDT", 3_000_000, 4_000_000, 350.0);

        let fill1 = RawFill {
            external_id: "fill-1".to_string(),
            symbol: "BTCUSDT".to_string(),
            side: "buy".to_string(),
            price: 50_000.0,
            qty: 0.5,
            fee: 2.5,
            is_maker: Some(true),
            filled_at: 1_500_000,
        };
        let fill2 = RawFill {
            external_id: "fill-2".to_string(),
            symbol: "BTCUSDT".to_string(),
            side: "sell".to_string(),
            price: 52_000.0,
            qty: 0.5,
            fee: 2.5,
            is_maker: Some(false),
            filled_at: 3_500_000,
        };

        let fee1 = RawFundingFee {
            external_id: "fee-1".to_string(),
            symbol: "BTCUSDT".to_string(),
            amount: -2.50,
            rate: Some(0.0001),
            charged_at: 1_500_000,
        };
        let fee2 = RawFundingFee {
            external_id: "fee-2".to_string(),
            symbol: "BTCUSDT".to_string(),
            amount: -3.75,
            rate: Some(0.0001),
            charged_at: 3_500_000,
        };

        let balance = RawAccountBalance {
            exchange: exchange.to_string(),
            asset: "USDT".to_string(),
            total: 10_000.0,
            available: 8_500.0,
            unrealized_pnl: 150.0,
            updated_at: 4_000_000,
        };

        let adapter = MockExchangeAdapter::new(exchange)
            .with_positions(vec![pos1, pos2])
            .with_fills(vec![fill1, fill2])
            .with_funding_fees(vec![fee1, fee2])
            .with_balances(vec![balance]);

        let result = sync_exchange(&db_state, &adapter, None).await;

        assert_eq!(result.status, "ok");
        assert_eq!(result.inserted, 2);
        assert_eq!(result.updated, 0);
        assert!(result.was_full_backfill);
        assert!(result.error.is_none());

        // Verifikasi database pasca-sinkronisasi pertama
        {
            let conn = db_state.conn.lock().unwrap();

            // Verifikasi rekonsiliasi funding fee pada positions
            let get_funding = |ext_id: &str| -> f64 {
                conn.query_row(
                    "SELECT funding_fee FROM trades WHERE external_id = ?1",
                    rusqlite::params![ext_id],
                    |r| r.get(0),
                )
                .unwrap()
            };
            assert_eq!(get_funding("pos-1"), -2.50);
            assert_eq!(get_funding("pos-2"), -3.75);

            // Verifikasi penautan fills ke trades
            let count_unlinked_fills: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM trade_fills WHERE trade_id IS NULL",
                    [],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(count_unlinked_fills, 0, "Semua fills harus tertaut ke trade");

            // Verifikasi saldo
            let total_balance: f64 = conn
                .query_row(
                    "SELECT total FROM account_balances WHERE exchange = ?1 AND asset = 'USDT'",
                    rusqlite::params![exchange],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(total_balance, 10_000.0);

            // Verifikasi sync state dan asymmetric stream cursors
            let state = get_sync_state(&conn, exchange).unwrap();
            assert_eq!(state.last_status, Some("ok".to_string()));
            assert_eq!(state.last_exit_time, Some(4_000_000));
            assert_eq!(state.last_fill_time, Some(3_500_000));
            assert_eq!(state.last_funding_time, Some(3_500_000));
            assert_eq!(state.positions_synced, 2);
            assert_eq!(state.fills_synced, 2);
            assert_eq!(state.funding_synced, 2);
        }

        // Tahap 2: Sinkronisasi kedua (Inkremental)
        let pos3 = create_test_position("pos-3", "BTCUSDT", 5_000_000, 6_000_000, 120.0);
        let fill3 = RawFill {
            external_id: "fill-3".to_string(),
            symbol: "BTCUSDT".to_string(),
            side: "buy".to_string(),
            price: 51_000.0,
            qty: 0.2,
            fee: 1.0,
            is_maker: Some(true),
            filled_at: 5_500_000,
        };
        let fee3 = RawFundingFee {
            external_id: "fee-3".to_string(),
            symbol: "BTCUSDT".to_string(),
            amount: -1.20,
            rate: Some(0.0001),
            charged_at: 5_500_000,
        };

        let adapter2 = MockExchangeAdapter::new(exchange)
            .with_positions(vec![pos3])
            .with_fills(vec![fill3])
            .with_funding_fees(vec![fee3]);

        let result2 = sync_exchange(&db_state, &adapter2, None).await;

        assert_eq!(result2.status, "ok");
        assert_eq!(result2.inserted, 1);
        assert!(!result2.was_full_backfill);

        // Verifikasi kursor yang diterima adapter pada siklus 2
        let pos_cursors = adapter2.recorded_position_cursors();
        assert_eq!(pos_cursors.len(), 1);
        assert_eq!(pos_cursors[0].last_exit_time, Some(4_000_000));

        let fill_cursors = adapter2.recorded_fill_cursors();
        assert_eq!(fill_cursors.len(), 1);
        assert_eq!(fill_cursors[0].last_fill_time, Some(3_500_000));

        let funding_cursors = adapter2.recorded_funding_cursors();
        assert_eq!(funding_cursors.len(), 1);
        assert_eq!(funding_cursors[0].last_funding_time, Some(3_500_000));

        // Verifikasi database pasca-sinkronisasi inkremental
        {
            let conn = db_state.conn.lock().unwrap();
            let state2 = get_sync_state(&conn, exchange).unwrap();
            assert_eq!(state2.last_exit_time, Some(6_000_000));
            assert_eq!(state2.last_fill_time, Some(5_500_000));
            assert_eq!(state2.last_funding_time, Some(5_500_000));
            assert_eq!(state2.positions_synced, 3);
            assert_eq!(state2.fills_synced, 3);
            assert_eq!(state2.funding_synced, 3);
        }
    }

    #[tokio::test]
    async fn test_sync_exchange_partial_network_failure_fills_and_funding() {
        let db_state = setup_test_db_state();
        let exchange = "mexc";

        let pos1 = create_test_position("pos-1", "BTCUSDT", 1_000_000, 2_000_000, 100.0);
        let pos2 = create_test_position("pos-2", "BTCUSDT", 3_000_000, 4_000_000, 200.0);

        // Konfigurasi adapter dengan posisi valid, namun simulasi error jaringan pada fills dan funding
        let adapter = MockExchangeAdapter::new(exchange)
            .with_positions(vec![pos1, pos2])
            .with_fills_error("HTTP 429 Too Many Requests (Rate limit on fills)")
            .with_funding_error("Network Timeout on funding fees");

        let result = sync_exchange(&db_state, &adapter, None).await;

        assert_eq!(result.status, "partial");
        assert_eq!(result.inserted, 2);
        assert!(result.error.is_some());
        let err_text = result.error.unwrap();
        assert!(err_text.contains("Fills gagal"));
        assert!(err_text.contains("Funding gagal"));

        // Verifikasi database: positions sukses ter-commit, sementara stream yang gagal terisolasi
        let conn = db_state.conn.lock().unwrap();

        let count_trades: i64 = conn
            .query_row("SELECT COUNT(*) FROM trades WHERE exchange = ?1", rusqlite::params![exchange], |r| r.get(0))
            .unwrap();
        assert_eq!(count_trades, 2, "Posisi tetap sukses ter-commit pada database");

        let count_fills: i64 = conn
            .query_row("SELECT COUNT(*) FROM trade_fills WHERE exchange = ?1", rusqlite::params![exchange], |r| r.get(0))
            .unwrap();
        assert_eq!(count_fills, 0, "Data fills kosong karena gagal ditarik dari jaringan");

        let count_funding: i64 = conn
            .query_row("SELECT COUNT(*) FROM funding_fees WHERE exchange = ?1", rusqlite::params![exchange], |r| r.get(0))
            .unwrap();
        assert_eq!(count_funding, 0, "Data funding kosong karena gagal ditarik dari jaringan");

        // Verifikasi isolasi kursor stream
        let state = get_sync_state(&conn, exchange).unwrap();
        assert_eq!(state.last_status, Some("partial".to_string()));
        assert_eq!(state.last_exit_time, Some(4_000_000), "Kursor posisi berhasil maju");
        assert_eq!(state.last_fill_time, None, "Kursor fills terisolasi dan tidak dimajukan");
        assert_eq!(state.last_funding_time, None, "Kursor funding terisolasi dan tidak dimajukan");
    }

    #[tokio::test]
    async fn test_sync_exchange_network_error_on_positions_zero_mutations() {
        let db_state = setup_test_db_state();
        let exchange = "mexc";

        let fill = RawFill {
            external_id: "fill-1".to_string(),
            symbol: "BTCUSDT".to_string(),
            side: "buy".to_string(),
            price: 50_000.0,
            qty: 1.0,
            fee: 2.0,
            is_maker: Some(true),
            filled_at: 1_000_000,
        };

        // Adapter disimulasikan gagal autentikasi / jaringan pada penarikan posisi
        let adapter = MockExchangeAdapter::new(exchange)
            .with_positions_error("HTTP 401 Unauthorized API Key")
            .with_fills(vec![fill]);

        let result = sync_exchange(&db_state, &adapter, None).await;

        assert_eq!(result.status, "error");
        assert_eq!(result.inserted, 0);
        assert_eq!(result.updated, 0);
        assert!(result.error.unwrap().contains("401 Unauthorized"));

        // Verifikasi ZERO MUTATION pada seluruh tabel data
        let conn = db_state.conn.lock().unwrap();

        let count_trades: i64 = conn.query_row("SELECT COUNT(*) FROM trades", [], |r| r.get(0)).unwrap();
        assert_eq!(count_trades, 0, "Tabel trades harus steril tanpa mutasi");

        let count_fills: i64 = conn.query_row("SELECT COUNT(*) FROM trade_fills", [], |r| r.get(0)).unwrap();
        assert_eq!(count_fills, 0, "Tabel trade_fills harus steril tanpa mutasi");

        let count_fees: i64 = conn.query_row("SELECT COUNT(*) FROM funding_fees", [], |r| r.get(0)).unwrap();
        assert_eq!(count_fees, 0, "Tabel funding_fees harus steril tanpa mutasi");

        let count_balances: i64 = conn.query_row("SELECT COUNT(*) FROM account_balances", [], |r| r.get(0)).unwrap();
        assert_eq!(count_balances, 0, "Tabel account_balances harus steril tanpa mutasi");

        // SyncState mencatat status error
        let state = get_sync_state(&conn, exchange).unwrap();
        assert_eq!(state.last_status, Some("error".to_string()));
        assert_eq!(state.last_exit_time, None);
    }

    #[tokio::test]
    async fn test_sync_exchange_rollback_upon_database_error() {
        let db_state = setup_test_db_state();
        let exchange = "mexc";

        let pos = create_test_position("pos-rollback", "BTCUSDT", 1_000_000, 2_000_000, 150.0);
        let fill = RawFill {
            external_id: "fill-rollback".to_string(),
            symbol: "BTCUSDT".to_string(),
            side: "buy".to_string(),
            price: 50_000.0,
            qty: 1.0,
            fee: 2.0,
            is_maker: Some(true),
            filled_at: 1_500_000,
        };

        let adapter = MockExchangeAdapter::new(exchange)
            .with_positions(vec![pos])
            .with_fills(vec![fill]);

        // Pasang trigger SQLite yang memicu ABORT saat insert trade_fills
        // Ini mensimulasikan kegagalan database di tengah transaksi Fase 2 setelah upsert posisi
        {
            let conn = db_state.conn.lock().unwrap();
            conn.execute(
                "CREATE TRIGGER simulate_db_failure BEFORE INSERT ON trade_fills
                 BEGIN
                     SELECT RAISE(ABORT, 'Simulasi kegagalan database pada batch fills');
                 END;",
                [],
            )
            .unwrap();
        }

        let result = sync_exchange(&db_state, &adapter, None).await;

        assert_eq!(result.status, "error");
        assert_eq!(result.inserted, 0);
        assert!(result.error.unwrap().contains("Simulasi kegagalan database"));

        // Verifikasi atomisitas: Seluruh transaksi dibatalkan (rollback)
        // Posisi 'pos-rollback' yang tadinya diproses sebelum fills TIDAK BOLEH tersimpan!
        let conn = db_state.conn.lock().unwrap();

        let count_trades: i64 = conn
            .query_row("SELECT COUNT(*) FROM trades WHERE external_id = 'pos-rollback'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count_trades, 0, "Transaksi harus di-rollback penuh: Posisi tidak boleh tertinggal");

        let count_fills: i64 = conn.query_row("SELECT COUNT(*) FROM trade_fills", [], |r| r.get(0)).unwrap();
        assert_eq!(count_fills, 0, "Tabel trade_fills harus tetap kosong");

        let state = get_sync_state(&conn, exchange).unwrap();
        assert_eq!(state.last_status, Some("error".to_string()));
        assert_eq!(state.last_exit_time, None);
    }
}
