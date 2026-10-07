use crate::credentials::{load_credentials, SUPPORTED_EXCHANGES};
use crate::db::repositories::balances::upsert_balances;
use crate::db::repositories::sync::{
    apply_funding_to_trades, get_sync_state, link_fills_to_trades, update_sync_state,
    upsert_fills, upsert_funding_fees, upsert_positions,
};
use crate::db::DbState;
use crate::exchanges::bitunix::BitunixClient;
use crate::exchanges::mexc::MexcClient;
use crate::exchanges::types::SyncCursor;
use crate::exchanges::AnyExchangeAdapter;
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

pub async fn sync_exchange(
    db_state: &DbState,
    adapter: &AnyExchangeAdapter,
    app: Option<&AppHandle>,
) -> SyncExchangeResult {
    let exchange = adapter.id();
    let started_state = {
        let conn = db_state.conn.lock().unwrap();
        get_sync_state(&conn, exchange).unwrap_or_else(|_| crate::db::repositories::sync::SyncState {
            exchange: exchange.to_string(),
            last_exit_time: None,
            last_external_id: None,
            last_sync_at: None,
            last_status: None,
            last_error: None,
            positions_synced: 0,
            fills_synced: 0,
            funding_synced: 0,
        })
    };

    let cursor = SyncCursor {
        last_exit_time: started_state.last_exit_time,
        last_external_id: started_state.last_external_id.clone(),
    };
    let was_full_backfill = cursor.last_exit_time.is_none();

    let positions_result;
    let mut partial_errors = Vec::new();

    // Tahap 1: Posisi (Data Utama)
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

    emit_progress(
        app,
        exchange,
        "positions",
        &format!("Menyimpan {} posisi…", raw_positions.len()),
    );

    let mut max_exit_time = cursor.last_exit_time;
    let mut max_external_id = cursor.last_external_id.clone();

    for pos in &raw_positions {
        if max_exit_time.is_none() || Some(pos.exit_time) > max_exit_time {
            max_exit_time = Some(pos.exit_time);
            max_external_id = Some(pos.external_id.clone());
        }
    }

    {
        let mut conn = db_state.conn.lock().unwrap();
        match upsert_positions(&mut conn, exchange, &raw_positions) {
            Ok(res) => {
                positions_result = res;
            }
            Err(e) => {
                log::error!("[sync:{}] Gagal upsert posisi ke DB: {}", exchange, e);
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
        }

        // Segera simpan cursor agar posisi terproteksi
        let _ = update_sync_state(
            &conn,
            exchange,
            max_exit_time,
            max_external_id.as_deref(),
            Some("ok"),
            None,
        );
    }

    // Tahap 2: Fills (Bukti Audit Granular)
    emit_progress(app, exchange, "fills", "Menarik riwayat eksekusi…");
    match adapter.fetch_fills(&cursor).await {
        Ok(fills) => {
            let mut conn = db_state.conn.lock().unwrap();
            if let Err(e) = upsert_fills(&mut conn, exchange, &fills) {
                log::warn!("[sync:{}] Upsert fills gagal: {}", exchange, e);
                partial_errors.push(format!("Fills gagal: {}", e));
            }
        }
        Err(e) => {
            log::warn!("[sync:{}] Fetch fills gagal: {}", exchange, e);
            partial_errors.push(format!("Fills gagal: {}", e));
        }
    }

    // Tahap 3: Funding Fees
    emit_progress(app, exchange, "funding", "Menarik catatan funding…");
    match adapter.fetch_funding_fees(&cursor).await {
        Ok(fees) => {
            let mut conn = db_state.conn.lock().unwrap();
            if let Err(e) = upsert_funding_fees(&mut conn, exchange, &fees) {
                log::warn!("[sync:{}] Upsert funding gagal: {}", exchange, e);
                partial_errors.push(format!("Funding gagal: {}", e));
            }
        }
        Err(e) => {
            log::warn!("[sync:{}] Fetch funding gagal: {}", exchange, e);
            partial_errors.push(format!("Funding gagal: {}", e));
        }
    }

    // Tahap 4: Rekonsiliasi (Funding & Link Fills)
    emit_progress(app, exchange, "reconcile", "Menghitung ulang funding per posisi…");
    {
        let conn = db_state.conn.lock().unwrap();
        if let Err(e) = apply_funding_to_trades(&conn, exchange) {
            log::warn!("[sync:{}] Apply funding gagal: {}", exchange, e);
            partial_errors.push(format!("Reconcile funding gagal: {}", e));
        }

        emit_progress(app, exchange, "reconcile", "Menautkan fill ke posisi…");
        if let Err(e) = link_fills_to_trades(&conn, exchange) {
            log::warn!("[sync:{}] Link fills gagal: {}", exchange, e);
            partial_errors.push(format!("Link fills gagal: {}", e));
        }
    }

    // Tahap 5: Saldo Akun
    match adapter.fetch_balances().await {
        Ok(raw_balances) => {
            let balances: Vec<AccountBalance> = raw_balances.into_iter().map(AccountBalance::from).collect();
            let mut conn = db_state.conn.lock().unwrap();
            if let Err(e) = upsert_balances(&mut conn, &balances) {
                log::warn!("[sync:{}] Upsert balances gagal: {}", exchange, e);
            }
        }
        Err(e) => {
            log::warn!("[sync:{}] Fetch balances gagal: {}", exchange, e);
        }
    }

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

    {
        let conn = db_state.conn.lock().unwrap();
        let _ = update_sync_state(
            &conn,
            exchange,
            max_exit_time,
            max_external_id.as_deref(),
            Some(status),
            error_msg.as_deref(),
        );
    }

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
