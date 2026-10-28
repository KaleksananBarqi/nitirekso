use crate::exchanges::types::{RawClosedPosition, RawFill, RawFundingFee, SyncCursor};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
#[cfg(not(test))]
use std::sync::atomic::{AtomicI8, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// Status dan kursor sinkronisasi untuk masing-masing bursa
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncState {
    pub exchange: String,
    pub last_exit_time: Option<i64>,
    pub last_external_id: Option<String>,
    #[serde(default)]
    pub last_fill_time: Option<i64>,
    #[serde(default)]
    pub last_fill_id: Option<String>,
    #[serde(default)]
    pub last_funding_time: Option<i64>,
    pub last_sync_at: Option<i64>,
    pub last_status: Option<String>,
    pub last_error: Option<String>,
    pub positions_synced: i64,
    pub fills_synced: i64,
    pub funding_synced: i64,
}

impl SyncState {
    /// Membuat objek SyncState kosong untuk bursa tertentu
    pub fn empty(exchange: &str) -> Self {
        Self {
            exchange: exchange.to_string(),
            last_exit_time: None,
            last_external_id: None,
            last_fill_time: None,
            last_fill_id: None,
            last_funding_time: None,
            last_sync_at: None,
            last_status: None,
            last_error: None,
            positions_synced: 0,
            fills_synced: 0,
            funding_synced: 0,
        }
    }

    /// Mengekstrak objek SyncCursor independen per-stream dari state saat ini
    pub fn cursor(&self) -> SyncCursor {
        SyncCursor {
            last_exit_time: self.last_exit_time,
            last_external_id: self.last_external_id.clone(),
            last_fill_time: self.last_fill_time,
            last_fill_id: self.last_fill_id.clone(),
            last_funding_time: self.last_funding_time,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertResult {
    pub inserted: usize,
    pub updated: usize,
    pub unchanged: usize,
}

#[cfg(not(test))]
static SYNC_STATE_HAS_STREAM_CURSORS: AtomicI8 = AtomicI8::new(-1);

/// Memeriksa keberadaan kolom kursor stream pada tabel sync_state dengan optimasi cache
fn has_sync_state_stream_cursors(conn: &Connection) -> bool {
    #[cfg(not(test))]
    {
        let cached = SYNC_STATE_HAS_STREAM_CURSORS.load(Ordering::Relaxed);
        if cached == 1 {
            return true;
        } else if cached == 0 {
            return false;
        }
    }

    let exists = conn
        .query_row(
            "SELECT 1 FROM pragma_table_info('sync_state') WHERE name = 'last_fill_time'",
            [],
            |_| Ok(()),
        )
        .is_ok();

    #[cfg(not(test))]
    SYNC_STATE_HAS_STREAM_CURSORS.store(if exists { 1 } else { 0 }, Ordering::Relaxed);

    exists
}

pub fn get_sync_state_with_flag(
    conn: &Connection,
    exchange: &str,
    has_stream_cursors: bool,
) -> rusqlite::Result<SyncState> {
    let row_opt = if has_stream_cursors {
        let mut stmt = conn.prepare(
            "SELECT exchange, last_exit_time, last_external_id, last_sync_at, last_status, last_error,
                    last_fill_time, last_fill_id, last_funding_time
             FROM sync_state WHERE exchange = ?1",
        )?;
        stmt.query_row(params![exchange], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<i64>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<i64>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<i64>>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<i64>>(8)?,
            ))
        })
        .optional()?
    } else {
        let mut stmt = conn.prepare(
            "SELECT exchange, last_exit_time, last_external_id, last_sync_at, last_status, last_error
             FROM sync_state WHERE exchange = ?1",
        )?;
        stmt.query_row(params![exchange], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<i64>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<i64>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                None,
                None,
                None,
            ))
        })
        .optional()?
    };

    let positions_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM trades WHERE exchange = ?1",
            params![exchange],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let fills_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM trade_fills WHERE exchange = ?1",
            params![exchange],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let funding_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM funding_fees WHERE exchange = ?1",
            params![exchange],
            |r| r.get(0),
        )
        .unwrap_or(0);

    if let Some((ex, exit_time, ext_id, sync_at, status, err, fill_time, fill_id, funding_time)) = row_opt {
        Ok(SyncState {
            exchange: ex,
            last_exit_time: exit_time,
            last_external_id: ext_id,
            last_fill_time: fill_time,
            last_fill_id: fill_id,
            last_funding_time: funding_time,
            last_sync_at: sync_at,
            last_status: status,
            last_error: err,
            positions_synced: positions_count,
            fills_synced: fills_count,
            funding_synced: funding_count,
        })
    } else {
        Ok(SyncState {
            exchange: exchange.to_string(),
            last_exit_time: None,
            last_external_id: None,
            last_fill_time: None,
            last_fill_id: None,
            last_funding_time: None,
            last_sync_at: None,
            last_status: None,
            last_error: None,
            positions_synced: positions_count,
            fills_synced: fills_count,
            funding_synced: funding_count,
        })
    }
}

pub fn get_sync_state(conn: &Connection, exchange: &str) -> rusqlite::Result<SyncState> {
    let has_stream_cursors = has_sync_state_stream_cursors(conn);
    get_sync_state_with_flag(conn, exchange, has_stream_cursors)
}

pub fn get_all_sync_states(conn: &Connection) -> rusqlite::Result<Vec<SyncState>> {
    let has_stream_cursors = has_sync_state_stream_cursors(conn);
    let exchanges = ["mexc", "bitunix", "bybit", "binance", "bingx"];
    let mut states = Vec::new();
    for ex in exchanges {
        states.push(get_sync_state_with_flag(conn, ex, has_stream_cursors)?);
    }
    Ok(states)
}

/// Memperbarui state sinkronisasi lengkap beserta kursor independen per-stream
pub fn update_sync_state_full(
    conn: &Connection,
    exchange: &str,
    last_exit_time: Option<i64>,
    last_external_id: Option<&str>,
    last_fill_time: Option<i64>,
    last_fill_id: Option<&str>,
    last_funding_time: Option<i64>,
    last_status: Option<&str>,
    last_error: Option<&str>,
) -> rusqlite::Result<()> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let has_stream_cursors = has_sync_state_stream_cursors(conn);

    if has_stream_cursors {
        conn.execute(
            "INSERT INTO sync_state (
                exchange,
                last_exit_time,
                last_external_id,
                last_fill_time,
                last_fill_id,
                last_funding_time,
                last_sync_at,
                last_status,
                last_error
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(exchange) DO UPDATE SET
               last_exit_time    = COALESCE(excluded.last_exit_time, sync_state.last_exit_time),
               last_external_id  = COALESCE(excluded.last_external_id, sync_state.last_external_id),
               last_fill_time    = COALESCE(excluded.last_fill_time, sync_state.last_fill_time),
               last_fill_id      = COALESCE(excluded.last_fill_id, sync_state.last_fill_id),
               last_funding_time = COALESCE(excluded.last_funding_time, sync_state.last_funding_time),
               last_sync_at      = excluded.last_sync_at,
               last_status       = excluded.last_status,
               last_error        = excluded.last_error",
            params![
                exchange,
                last_exit_time,
                last_external_id,
                last_fill_time,
                last_fill_id,
                last_funding_time,
                now,
                last_status,
                last_error
            ],
        )?;
    } else {
        conn.execute(
            "INSERT INTO sync_state (exchange, last_exit_time, last_external_id, last_sync_at, last_status, last_error)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(exchange) DO UPDATE SET
               last_exit_time   = COALESCE(excluded.last_exit_time, sync_state.last_exit_time),
               last_external_id = COALESCE(excluded.last_external_id, sync_state.last_external_id),
               last_sync_at     = excluded.last_sync_at,
               last_status      = excluded.last_status,
               last_error       = excluded.last_error",
            params![exchange, last_exit_time, last_external_id, now, last_status, last_error],
        )?;
    }

    Ok(())
}

/// Memperbarui state sinkronisasi menggunakan referensi objek SyncCursor
pub fn update_sync_state_cursor(
    conn: &Connection,
    exchange: &str,
    cursor: &SyncCursor,
    last_status: Option<&str>,
    last_error: Option<&str>,
) -> rusqlite::Result<()> {
    update_sync_state_full(
        conn,
        exchange,
        cursor.last_exit_time,
        cursor.last_external_id.as_deref(),
        cursor.last_fill_time,
        cursor.last_fill_id.as_deref(),
        cursor.last_funding_time,
        last_status,
        last_error,
    )
}

/// Memperbarui state sinkronisasi (kompatibilitas mundur dengan tanda tangan fungsi lama)
pub fn update_sync_state(
    conn: &Connection,
    exchange: &str,
    last_exit_time: Option<i64>,
    last_external_id: Option<&str>,
    last_status: Option<&str>,
    last_error: Option<&str>,
) -> rusqlite::Result<()> {
    update_sync_state_full(
        conn,
        exchange,
        last_exit_time,
        last_external_id,
        None,
        None,
        None,
        last_status,
        last_error,
    )
}

/// Operasi batch upsert posisi tertutup pada koneksi atau transaksi SQLite aktif.
/// HANYA menulis kolom teknis exchange di `trades`. DILARANG menyentuh `trade_journal`,
/// `journal_checklist`, atau `planned_risk`.
pub fn upsert_positions_tx(
    conn: &Connection,
    exchange: &str,
    positions: &[RawClosedPosition],
) -> rusqlite::Result<UpsertResult> {
    let mut result = UpsertResult::default();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let mut find_stmt = conn.prepare(
        "SELECT id, realized_pnl, exit_price, size, fee_close
         FROM trades WHERE exchange = ?1 AND external_id = ?2",
    )?;

    let mut insert_stmt = conn.prepare(
        "INSERT INTO trades
         (exchange, external_id, symbol, direction, entry_price, exit_price,
          entry_time, exit_time, size, leverage, margin_mode, realized_pnl,
          pnl_source, fee_open, fee_close, fee_open_maker, fee_close_maker,
          funding_fee, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'exchange_reported',
                 ?13, ?14, NULL, NULL, ?15, ?16, ?17)",
    )?;

    let mut update_stmt = conn.prepare(
        "UPDATE trades SET
           symbol = ?1, direction = ?2, entry_price = ?3, exit_price = ?4,
           entry_time = ?5, exit_time = ?6, size = ?7, leverage = ?8, margin_mode = ?9,
           realized_pnl = ?10, fee_open = ?11, fee_close = ?12, updated_at = ?13
         WHERE id = ?14",
    )?;

    for pos in positions {
        let existing = find_stmt
            .query_row(params![exchange, &pos.external_id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, f64>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, f64>(3)?,
                    row.get::<_, f64>(4)?,
                ))
            })
            .optional()?;

        if let Some((id, old_pnl, old_exit, old_size, old_fee)) = existing {
            let changed = (old_pnl - pos.realized_pnl).abs() > 1e-6
                || (old_exit - pos.exit_price).abs() > 1e-6
                || (old_size - pos.size).abs() > 1e-6
                || (old_fee - pos.fee_close).abs() > 1e-6;

            if !changed {
                result.unchanged += 1;
                continue;
            }

            update_stmt.execute(params![
                pos.symbol,
                pos.direction,
                pos.entry_price,
                pos.exit_price,
                pos.entry_time,
                pos.exit_time,
                pos.size,
                pos.leverage,
                pos.margin_mode,
                pos.realized_pnl,
                pos.fee_open,
                pos.fee_close,
                now,
                id
            ])?;
            result.updated += 1;
        } else {
            insert_stmt.execute(params![
                exchange,
                pos.external_id,
                pos.symbol,
                pos.direction,
                pos.entry_price,
                pos.exit_price,
                pos.entry_time,
                pos.exit_time,
                pos.size,
                pos.leverage,
                pos.margin_mode,
                pos.realized_pnl,
                pos.fee_open,
                pos.fee_close,
                pos.funding_fee,
                now,
                now
            ])?;
            result.inserted += 1;
        }
    }

    Ok(result)
}

/// Upsert posisi tertutup dari exchange (membuka transaksi mandiri jika dipanggil tersendiri).
pub fn upsert_positions(
    conn: &mut Connection,
    exchange: &str,
    positions: &[RawClosedPosition],
) -> rusqlite::Result<UpsertResult> {
    let tx = conn.transaction()?;
    let result = upsert_positions_tx(&tx, exchange, positions)?;
    tx.commit()?;
    Ok(result)
}

/// Operasi batch upsert data eksekusi (trade fills) pada koneksi atau transaksi SQLite aktif.
pub fn upsert_fills_tx(
    conn: &Connection,
    exchange: &str,
    fills: &[RawFill],
) -> rusqlite::Result<UpsertResult> {
    let mut result = UpsertResult::default();
    let mut insert_stmt = conn.prepare(
        "INSERT INTO trade_fills
         (trade_id, exchange, external_id, symbol, side, price, qty, fee, is_maker, filled_at)
         VALUES (NULL, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(exchange, external_id) DO UPDATE SET
           symbol   = excluded.symbol,
           side     = excluded.side,
           price    = excluded.price,
           qty      = excluded.qty,
           fee      = excluded.fee,
           is_maker = excluded.is_maker",
    )?;

    for fill in fills {
        let maker_val = fill.is_maker.map(|m| if m { 1 } else { 0 });
        let changes = insert_stmt.execute(params![
            exchange,
            fill.external_id,
            fill.symbol,
            fill.side,
            fill.price,
            fill.qty,
            fill.fee,
            maker_val,
            fill.filled_at
        ])?;

        if changes > 0 {
            result.inserted += 1;
        } else {
            result.unchanged += 1;
        }
    }

    Ok(result)
}

/// Upsert fills dari exchange (membuka transaksi mandiri jika dipanggil tersendiri).
pub fn upsert_fills(
    conn: &mut Connection,
    exchange: &str,
    fills: &[RawFill],
) -> rusqlite::Result<UpsertResult> {
    let tx = conn.transaction()?;
    let result = upsert_fills_tx(&tx, exchange, fills)?;
    tx.commit()?;
    Ok(result)
}

/// Operasi batch upsert data biaya pendanaan (funding fees) pada koneksi atau transaksi SQLite aktif.
pub fn upsert_funding_fees_tx(
    conn: &Connection,
    exchange: &str,
    fees: &[RawFundingFee],
) -> rusqlite::Result<UpsertResult> {
    let mut result = UpsertResult::default();
    let mut insert_stmt = conn.prepare(
        "INSERT INTO funding_fees (exchange, external_id, symbol, amount, rate, charged_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(exchange, external_id) DO UPDATE SET
           amount = excluded.amount,
           rate   = excluded.rate",
    )?;

    for fee in fees {
        let changes = insert_stmt.execute(params![
            exchange,
            fee.external_id,
            fee.symbol,
            fee.amount,
            fee.rate,
            fee.charged_at
        ])?;

        if changes > 0 {
            result.inserted += 1;
        } else {
            result.unchanged += 1;
        }
    }

    Ok(result)
}

/// Upsert biaya funding dari exchange (membuka transaksi mandiri jika dipanggil tersendiri).
pub fn upsert_funding_fees(
    conn: &mut Connection,
    exchange: &str,
    fees: &[RawFundingFee],
) -> rusqlite::Result<UpsertResult> {
    let tx = conn.transaction()?;
    let result = upsert_funding_fees_tx(&tx, exchange, fees)?;
    tx.commit()?;
    Ok(result)
}

/// Merekonsiliasi dan menghitung ulang akumulasi biaya funding per posisi perdagangan terikat jendela waktu.
/// Jika `min_touched_time` diberikan (`Some(t)`), hanya posisi dengan `exit_time >= t` yang diperbarui.
/// Jika bernilai `None`, rekonsiliasi mencakup seluruh posisi pada bursa bersangkutan.
pub fn apply_funding_to_trades_window(
    conn: &Connection,
    exchange: &str,
    min_touched_time: Option<i64>,
) -> rusqlite::Result<usize> {
    let changes = conn.execute(
        "UPDATE trades SET
           funding_fee = COALESCE((
             SELECT SUM(f.amount) FROM funding_fees f
             WHERE f.exchange = trades.exchange
               AND f.symbol = trades.symbol
               AND f.charged_at >= trades.entry_time
               AND f.charged_at <= trades.exit_time
           ), 0)
         WHERE exchange = ?1 AND (?2 IS NULL OR exit_time >= ?2)",
        params![exchange, min_touched_time],
    )?;
    Ok(changes)
}

/// Delegasi kompatibilitas mundur untuk menghitung ulang biaya funding seluruh trade pada bursa tertentu.
pub fn apply_funding_to_trades(conn: &Connection, exchange: &str) -> rusqlite::Result<usize> {
    apply_funding_to_trades_window(conn, exchange, None)
}

/// Menautkan eksekusi order (trade fills) yang belum tertaut ke posisi trade yang sesuai terikat jendela waktu.
/// Jika `min_filled_at` diberikan (`Some(t)`), hanya fills dengan `filled_at >= t` yang diproses.
/// Jika bernilai `None`, seluruh fills yang belum tertaut (`trade_id IS NULL`) pada bursa bersangkutan akan diproses.
pub fn link_fills_to_trades_window(
    conn: &Connection,
    exchange: &str,
    min_filled_at: Option<i64>,
) -> rusqlite::Result<usize> {
    let changes = conn.execute(
        "UPDATE trade_fills SET trade_id = (
           SELECT t.id FROM trades t
           WHERE t.exchange = trade_fills.exchange
             AND t.symbol = trade_fills.symbol
             AND trade_fills.filled_at >= t.entry_time
             AND trade_fills.filled_at <= t.exit_time
           ORDER BY t.entry_time DESC
           LIMIT 1
         )
         WHERE exchange = ?1
           AND trade_id IS NULL
           AND (?2 IS NULL OR filled_at >= ?2)
           AND EXISTS (
             SELECT 1 FROM trades t
             WHERE t.exchange = trade_fills.exchange
               AND t.symbol = trade_fills.symbol
               AND trade_fills.filled_at >= t.entry_time
               AND trade_fills.filled_at <= t.exit_time
           )",
        params![exchange, min_filled_at],
    )?;
    Ok(changes)
}

/// Delegasi kompatibilitas mundur untuk menautkan semua fill yang belum terhubung ke trade.
pub fn link_fills_to_trades(conn: &Connection, exchange: &str) -> rusqlite::Result<usize> {
    link_fills_to_trades_window(conn, exchange, None)
}

pub fn clear_exchange_data(conn: &mut Connection, exchange: &str) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM funding_fees WHERE exchange = ?1", params![exchange])?;
    tx.execute("DELETE FROM trade_fills WHERE exchange = ?1", params![exchange])?;
    tx.execute("DELETE FROM trades WHERE exchange = ?1", params![exchange])?;
    tx.execute("DELETE FROM sync_state WHERE exchange = ?1", params![exchange])?;
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    /// Inisialisasi basis data SQLite in-memory beserta seluruh skema migrasi
    fn setup_test_db() -> Connection {
        let mut conn = Connection::open_in_memory().expect("Buka koneksi DB in-memory");
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        crate::db::migrations::run_migrations(&mut conn).expect("Migrasi DB harus berhasil");
        conn
    }

    /// Helper membuat objek posisi perdagangan tiruan
    fn create_test_trade(
        external_id: &str,
        symbol: &str,
        entry_time: i64,
        exit_time: i64,
        initial_funding: f64,
    ) -> RawClosedPosition {
        RawClosedPosition {
            external_id: external_id.to_string(),
            symbol: symbol.to_string(),
            direction: "long".to_string(),
            entry_price: 50000.0,
            exit_price: 52000.0,
            entry_time,
            exit_time,
            size: 1.0,
            leverage: 10.0,
            margin_mode: Some("isolated".to_string()),
            realized_pnl: 2000.0,
            fee_open: 10.0,
            fee_close: 10.0,
            funding_fee: initial_funding,
            raw: None,
        }
    }

    #[test]
    fn test_apply_funding_to_trades_window_incremental_boundary() {
        let mut conn = setup_test_db();
        let exchange = "mexc";

        // Buat 3 posisi trade: masa lalu (lama), tengah, dan baru
        let trades = vec![
            create_test_trade("trade-old", "BTCUSDT", 1_000_000, 2_000_000, 0.0),
            create_test_trade("trade-mid", "BTCUSDT", 3_000_000, 4_000_000, 0.0),
            create_test_trade("trade-new", "BTCUSDT", 5_000_000, 6_000_000, 0.0),
        ];
        upsert_positions(&mut conn, exchange, &trades).expect("Upsert trades berhasil");

        // Masukkan funding fee untuk masing-masing trade
        let fees = vec![
            RawFundingFee {
                external_id: "fee-old".to_string(),
                symbol: "BTCUSDT".to_string(),
                amount: -1.5,
                rate: Some(0.0001),
                charged_at: 1_500_000,
            },
            RawFundingFee {
                external_id: "fee-mid".to_string(),
                symbol: "BTCUSDT".to_string(),
                amount: -2.75,
                rate: Some(0.0001),
                charged_at: 3_500_000,
            },
            RawFundingFee {
                external_id: "fee-new".to_string(),
                symbol: "BTCUSDT".to_string(),
                amount: -4.25,
                rate: Some(0.0001),
                charged_at: 5_500_000,
            },
        ];
        upsert_funding_fees(&mut conn, exchange, &fees).expect("Upsert fees berhasil");

        // Rekonsiliasi inkremental: batasi min_touched_time = 3_500_000 (hanya trade dengan exit_time >= 3_500_000)
        // Posisi 'trade-mid' (exit 4_000_000) dan 'trade-new' (exit 6_000_000) harus terbarui.
        // Posisi 'trade-old' (exit 2_000_000) tidak boleh tersentuh dan funding_fee tetap 0.0.
        let changed = apply_funding_to_trades_window(&conn, exchange, Some(3_500_000)).unwrap();
        assert_eq!(changed, 2, "Hanya 2 trade di dalam jendela waktu yang diperbarui");

        let get_funding = |id: &str| -> f64 {
            conn.query_row(
                "SELECT funding_fee FROM trades WHERE external_id = ?1",
                params![id],
                |r| r.get(0),
            )
            .unwrap()
        };

        assert_eq!(get_funding("trade-old"), 0.0, "Trade lama di luar jendela tidak boleh berubah");
        assert_eq!(get_funding("trade-mid"), -2.75, "Trade tengah harus diperbarui sesuai fee");
        assert_eq!(get_funding("trade-new"), -4.25, "Trade baru harus diperbarui sesuai fee");

        // Jalankan rekonsiliasi global (None) melalui delegasi apply_funding_to_trades
        let changed_all = apply_funding_to_trades(&conn, exchange).unwrap();
        assert_eq!(changed_all, 3, "Semua 3 trade diperbarui pada rekonsiliasi global");
        assert_eq!(get_funding("trade-old"), -1.5, "Trade lama kini menerima fee setelah rekonsiliasi penuh");
    }

    #[test]
    fn test_apply_funding_incremental_mathematically_identical_to_global() {
        let mut conn_global = setup_test_db();
        let mut conn_incremental = setup_test_db();
        let exchange = "mexc";

        // Siapkan 4 trade dengan variasi kondisi waktu dan simbol
        let initial_trades = vec![
            create_test_trade("t1", "BTCUSDT", 10_000, 20_000, 0.0),
            create_test_trade("t2", "BTCUSDT", 25_000, 40_000, 0.0),
            create_test_trade("t3", "BTCUSDT", 50_000, 70_000, 0.0),
            create_test_trade("t4", "BTCUSDT", 80_000, 100_000, 0.0),
        ];

        // Sejumlah funding fee dengan nilai negatif, positif, dan edge case tepat pada batas entry/exit
        let fees = vec![
            RawFundingFee {
                external_id: "f1-entry".to_string(),
                symbol: "BTCUSDT".to_string(),
                amount: -1.25,
                rate: Some(0.0001),
                charged_at: 10_000, // Tepat pada entry_time t1
            },
            RawFundingFee {
                external_id: "f1-exit".to_string(),
                symbol: "BTCUSDT".to_string(),
                amount: 0.75,
                rate: Some(0.00005),
                charged_at: 20_000, // Tepat pada exit_time t1
            },
            RawFundingFee {
                external_id: "f2-mid".to_string(),
                symbol: "BTCUSDT".to_string(),
                amount: -3.50,
                rate: Some(0.0002),
                charged_at: 30_000,
            },
            RawFundingFee {
                external_id: "f3-mid1".to_string(),
                symbol: "BTCUSDT".to_string(),
                amount: -5.10,
                rate: Some(0.0002),
                charged_at: 55_000,
            },
            RawFundingFee {
                external_id: "f3-mid2".to_string(),
                symbol: "BTCUSDT".to_string(),
                amount: 2.10,
                rate: Some(0.0001),
                charged_at: 65_000,
            },
            RawFundingFee {
                external_id: "f4-mid".to_string(),
                symbol: "BTCUSDT".to_string(),
                amount: -8.80,
                rate: Some(0.0003),
                charged_at: 90_000,
            },
        ];

        // 1. Database Global: Masukkan semua data dan jalankan rekonsiliasi global (None)
        upsert_positions(&mut conn_global, exchange, &initial_trades).unwrap();
        upsert_funding_fees(&mut conn_global, exchange, &fees).unwrap();
        apply_funding_to_trades_window(&conn_global, exchange, None).unwrap();

        // 2. Database Inkremental: Simulasikan sinkronisasi bertahap
        // Tahap awal: trade t1 & t2 sudah ada dan direkonsiliasi sebelumnya
        upsert_positions(&mut conn_incremental, exchange, &initial_trades[0..2]).unwrap();
        upsert_funding_fees(&mut conn_incremental, exchange, &fees[0..3]).unwrap();
        apply_funding_to_trades_window(&conn_incremental, exchange, None).unwrap();

        // Tahap inkremental: trade t3 & t4 serta sisa funding fee baru tiba
        upsert_positions(&mut conn_incremental, exchange, &initial_trades[2..4]).unwrap();
        upsert_funding_fees(&mut conn_incremental, exchange, &fees[3..6]).unwrap();

        // Rekonsiliasi inkremental dengan jendela waktu min_touched_time = t3.entry_time (50_000)
        // exit_time >= 50_000 mencakup t3 (70_000) dan t4 (100_000)
        apply_funding_to_trades_window(&conn_incremental, exchange, Some(50_000)).unwrap();

        // 3. Verifikasi: Nilai funding fee di kedua database harus 100% identik secara matematis
        let read_all_funding = |conn: &Connection| -> Vec<(String, f64)> {
            let mut stmt = conn
                .prepare("SELECT external_id, funding_fee FROM trades WHERE exchange = ?1 ORDER BY entry_time ASC")
                .unwrap();
            let rows = stmt
                .query_map(params![exchange], |r| Ok((r.get(0)?, r.get(1)?)))
                .unwrap();
            rows.map(|r| r.unwrap()).collect()
        };

        let global_results = read_all_funding(&conn_global);
        let inc_results = read_all_funding(&conn_incremental);

        assert_eq!(global_results.len(), 4);
        assert_eq!(inc_results.len(), 4);

        for (g, i) in global_results.iter().zip(inc_results.iter()) {
            assert_eq!(g.0, i.0, "Urutan ID trade harus sama");
            assert!(
                (g.1 - i.1).abs() < 1e-9,
                "Funding fee untuk {} harus identik: global={}, inc={}",
                g.0,
                g.1,
                i.1
            );
        }

        // Validasi nilai kalkulasi spesifik
        // t1: -1.25 + 0.75 = -0.50
        assert!((global_results[0].1 - (-0.50)).abs() < 1e-9);
        // t2: -3.50
        assert!((global_results[1].1 - (-3.50)).abs() < 1e-9);
        // t3: -5.10 + 2.10 = -3.00
        assert!((global_results[2].1 - (-3.00)).abs() < 1e-9);
        // t4: -8.80
        assert!((global_results[3].1 - (-8.80)).abs() < 1e-9);
    }

    #[test]
    fn test_link_fills_to_trades_window_incremental_boundary() {
        let mut conn = setup_test_db();
        let exchange = "mexc";

        // Buat 3 posisi trade
        let trades = vec![
            create_test_trade("t-early", "BTCUSDT", 1_000_000, 2_000_000, 0.0),
            create_test_trade("t-mid", "BTCUSDT", 3_000_000, 4_000_000, 0.0),
            create_test_trade("t-late", "BTCUSDT", 5_000_000, 6_000_000, 0.0),
        ];
        upsert_positions(&mut conn, exchange, &trades).unwrap();

        // Dapatkan trade id
        let get_trade_id = |ext_id: &str| -> i64 {
            conn.query_row(
                "SELECT id FROM trades WHERE external_id = ?1",
                params![ext_id],
                |r| r.get(0),
            )
            .unwrap()
        };
        let id_early = get_trade_id("t-early");
        let id_mid = get_trade_id("t-mid");
        let id_late = get_trade_id("t-late");

        // Masukkan beberapa trade fills
        let fills = vec![
            RawFill {
                external_id: "fill-early".to_string(),
                symbol: "BTCUSDT".to_string(),
                side: "buy".to_string(),
                price: 50000.0,
                qty: 0.5,
                fee: 1.0,
                is_maker: Some(true),
                filled_at: 1_200_000, // Di dalam rentang t-early
            },
            RawFill {
                external_id: "fill-mid-1".to_string(),
                symbol: "BTCUSDT".to_string(),
                side: "buy".to_string(),
                price: 50100.0,
                qty: 0.5,
                fee: 1.0,
                is_maker: Some(false),
                filled_at: 3_200_000, // Di dalam rentang t-mid
            },
            RawFill {
                external_id: "fill-mid-2".to_string(),
                symbol: "BTCUSDT".to_string(),
                side: "sell".to_string(),
                price: 52000.0,
                qty: 0.5,
                fee: 1.0,
                is_maker: Some(true),
                filled_at: 3_900_000, // Di dalam rentang t-mid
            },
            RawFill {
                external_id: "fill-late".to_string(),
                symbol: "BTCUSDT".to_string(),
                side: "buy".to_string(),
                price: 50200.0,
                qty: 1.0,
                fee: 2.0,
                is_maker: Some(false),
                filled_at: 5_500_000, // Di dalam rentang t-late
            },
            RawFill {
                external_id: "fill-orphan".to_string(),
                symbol: "BTCUSDT".to_string(),
                side: "buy".to_string(),
                price: 50000.0,
                qty: 1.0,
                fee: 1.0,
                is_maker: Some(false),
                filled_at: 8_000_000, // Tidak ada trade yang cocok
            },
        ];
        upsert_fills(&mut conn, exchange, &fills).unwrap();

        // 1. Tautkan fills secara inkremental dengan jendela min_filled_at = 3_000_000
        // Hanya fills dengan filled_at >= 3_000_000 yang diproses (fill-mid-1, fill-mid-2, fill-late, fill-orphan)
        // Dari 4 fill tersebut, 3 memiliki trade yang cocok, sedangkan fill-orphan tidak memiliki trade.
        // fill-early (1_200_000) berada di luar batas waktu sehingga harus tetap NULL.
        let linked = link_fills_to_trades_window(&conn, exchange, Some(3_000_000)).unwrap();
        assert_eq!(linked, 3, "Tiga fill dalam jendela waktu berhasil ditautkan");

        let get_fill_trade_id = |ext_id: &str| -> Option<i64> {
            conn.query_row(
                "SELECT trade_id FROM trade_fills WHERE external_id = ?1",
                params![ext_id],
                |r| r.get(0),
            )
            .unwrap()
        };

        assert_eq!(get_fill_trade_id("fill-early"), None, "Fill sebelum jendela waktu harus tetap NULL");
        assert_eq!(get_fill_trade_id("fill-mid-1"), Some(id_mid));
        assert_eq!(get_fill_trade_id("fill-mid-2"), Some(id_mid));
        assert_eq!(get_fill_trade_id("fill-late"), Some(id_late));
        assert_eq!(get_fill_trade_id("fill-orphan"), None, "Fill yatim tanpa trade harus tetap NULL");

        // 2. Pemanggilan ulang dengan window yang sama tidak boleh mengubah baris yang sudah ditautkan
        let re_linked = link_fills_to_trades_window(&conn, exchange, Some(3_000_000)).unwrap();
        assert_eq!(re_linked, 0, "Tidak ada fill baru yang perlu ditautkan");

        // 3. Rekonsiliasi global (None) melalui link_fills_to_trades sekarang menautkan fill-early
        let global_linked = link_fills_to_trades(&conn, exchange).unwrap();
        assert_eq!(global_linked, 1, "Satu fill lama berhasil ditautkan");
        assert_eq!(get_fill_trade_id("fill-early"), Some(id_early));
    }

    #[test]
    fn test_reconciliation_isolation_by_exchange_and_symbol() {
        let mut conn = setup_test_db();

        // Trade di MEXC (BTCUSDT)
        let mexc_trades = vec![create_test_trade("mexc-t1", "BTCUSDT", 10_000, 20_000, 0.0)];
        upsert_positions(&mut conn, "mexc", &mexc_trades).unwrap();

        // Trade di BITUNIX (BTCUSDT) dan MEXC (ETHUSDT)
        let bitunix_trades = vec![create_test_trade("bitunix-t1", "BTCUSDT", 10_000, 20_000, 0.0)];
        upsert_positions(&mut conn, "bitunix", &bitunix_trades).unwrap();

        let mexc_eth_trades = vec![create_test_trade("mexc-eth1", "ETHUSDT", 10_000, 20_000, 0.0)];
        upsert_positions(&mut conn, "mexc", &mexc_eth_trades).unwrap();

        // Masukkan funding fees untuk berbagai bursa dan simbol
        let fees_mexc_btc = vec![RawFundingFee {
            external_id: "fee-mexc-btc".to_string(),
            symbol: "BTCUSDT".to_string(),
            amount: -5.0,
            rate: Some(0.0001),
            charged_at: 15_000,
        }];
        upsert_funding_fees(&mut conn, "mexc", &fees_mexc_btc).unwrap();

        let fees_bitunix_btc = vec![RawFundingFee {
            external_id: "fee-bitunix-btc".to_string(),
            symbol: "BTCUSDT".to_string(),
            amount: -99.0,
            rate: Some(0.0001),
            charged_at: 15_000,
        }];
        upsert_funding_fees(&mut conn, "bitunix", &fees_bitunix_btc).unwrap();

        let fees_mexc_eth = vec![RawFundingFee {
            external_id: "fee-mexc-eth".to_string(),
            symbol: "ETHUSDT".to_string(),
            amount: -12.0,
            rate: Some(0.0001),
            charged_at: 15_000,
        }];
        upsert_funding_fees(&mut conn, "mexc", &fees_mexc_eth).unwrap();

        // Rekonsiliasi hanya untuk exchange = "mexc"
        let updated = apply_funding_to_trades_window(&conn, "mexc", Some(10_000)).unwrap();
        assert_eq!(updated, 2, "Dua trade mexc (BTC dan ETH) diperbarui");

        let get_funding = |id: &str| -> f64 {
            conn.query_row(
                "SELECT funding_fee FROM trades WHERE external_id = ?1",
                params![id],
                |r| r.get(0),
            )
            .unwrap()
        };

        assert_eq!(get_funding("mexc-t1"), -5.0, "Trade MEXC BTC harus menerima fee MEXC BTC");
        assert_eq!(get_funding("mexc-eth1"), -12.0, "Trade MEXC ETH harus menerima fee MEXC ETH");
        assert_eq!(get_funding("bitunix-t1"), 0.0, "Trade BITUNIX tidak boleh terpengaruh rekonsiliasi MEXC");
    }
}
