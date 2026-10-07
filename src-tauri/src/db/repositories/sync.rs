use crate::exchanges::types::{RawClosedPosition, RawFill, RawFundingFee};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncState {
    pub exchange: String,
    pub last_exit_time: Option<i64>,
    pub last_external_id: Option<String>,
    pub last_sync_at: Option<i64>,
    pub last_status: Option<String>,
    pub last_error: Option<String>,
    pub positions_synced: i64,
    pub fills_synced: i64,
    pub funding_synced: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertResult {
    pub inserted: usize,
    pub updated: usize,
    pub unchanged: usize,
}

pub fn get_sync_state(conn: &Connection, exchange: &str) -> rusqlite::Result<SyncState> {
    let mut stmt = conn.prepare(
        "SELECT exchange, last_exit_time, last_external_id, last_sync_at, last_status, last_error
         FROM sync_state WHERE exchange = ?1",
    )?;

    let row_opt = stmt
        .query_row(params![exchange], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<i64>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<i64>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        })
        .optional()?;

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

    if let Some((ex, exit_time, ext_id, sync_at, status, err)) = row_opt {
        Ok(SyncState {
            exchange: ex,
            last_exit_time: exit_time,
            last_external_id: ext_id,
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
            last_sync_at: None,
            last_status: None,
            last_error: None,
            positions_synced: positions_count,
            fills_synced: fills_count,
            funding_synced: funding_count,
        })
    }
}

pub fn get_all_sync_states(conn: &Connection) -> rusqlite::Result<Vec<SyncState>> {
    let exchanges = ["mexc", "bitunix", "bybit", "binance", "bingx"];
    let mut states = Vec::new();
    for ex in exchanges {
        states.push(get_sync_state(conn, ex)?);
    }
    Ok(states)
}

pub fn update_sync_state(
    conn: &Connection,
    exchange: &str,
    last_exit_time: Option<i64>,
    last_external_id: Option<&str>,
    last_status: Option<&str>,
    last_error: Option<&str>,
) -> rusqlite::Result<()> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

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

    Ok(())
}

/// Upsert posisi tertutup dari exchange.
/// HANYA menulis kolom teknis exchange di `trades`. DILARANG menyentuh `trade_journal`,
/// `journal_checklist`, atau `planned_risk`.
pub fn upsert_positions(
    conn: &mut Connection,
    exchange: &str,
    positions: &[RawClosedPosition],
) -> rusqlite::Result<UpsertResult> {
    let mut result = UpsertResult::default();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let tx = conn.transaction()?;

    {
        let mut find_stmt = tx.prepare(
            "SELECT id, realized_pnl, exit_price, size, fee_close
             FROM trades WHERE exchange = ?1 AND external_id = ?2",
        )?;

        let mut insert_stmt = tx.prepare(
            "INSERT INTO trades
             (exchange, external_id, symbol, direction, entry_price, exit_price,
              entry_time, exit_time, size, leverage, margin_mode, realized_pnl,
              pnl_source, fee_open, fee_close, fee_open_maker, fee_close_maker,
              funding_fee, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'exchange_reported',
                     ?13, ?14, NULL, NULL, ?15, ?16, ?17)",
        )?;

        let mut update_stmt = tx.prepare(
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
    }

    tx.commit()?;
    Ok(result)
}

pub fn upsert_fills(
    conn: &mut Connection,
    exchange: &str,
    fills: &[RawFill],
) -> rusqlite::Result<UpsertResult> {
    let mut result = UpsertResult::default();
    let tx = conn.transaction()?;

    {
        let mut insert_stmt = tx.prepare(
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
    }

    tx.commit()?;
    Ok(result)
}

pub fn upsert_funding_fees(
    conn: &mut Connection,
    exchange: &str,
    fees: &[RawFundingFee],
) -> rusqlite::Result<UpsertResult> {
    let mut result = UpsertResult::default();
    let tx = conn.transaction()?;

    {
        let mut insert_stmt = tx.prepare(
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
    }

    tx.commit()?;
    Ok(result)
}

pub fn apply_funding_to_trades(conn: &Connection, exchange: &str) -> rusqlite::Result<usize> {
    let changes = conn.execute(
        "UPDATE trades SET
           funding_fee = COALESCE((
             SELECT SUM(f.amount) FROM funding_fees f
             WHERE f.exchange = trades.exchange
               AND f.symbol = trades.symbol
               AND f.charged_at >= trades.entry_time
               AND f.charged_at <= trades.exit_time
           ), 0)
         WHERE exchange = ?1",
        params![exchange],
    )?;
    Ok(changes)
}

pub fn link_fills_to_trades(conn: &Connection, exchange: &str) -> rusqlite::Result<usize> {
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
           AND EXISTS (
             SELECT 1 FROM trades t
             WHERE t.exchange = trade_fills.exchange
               AND t.symbol = trade_fills.symbol
               AND trade_fills.filled_at >= t.entry_time
               AND trade_fills.filled_at <= t.exit_time
           )",
        params![exchange],
    )?;
    Ok(changes)
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
