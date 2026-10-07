use crate::models::AccountBalance;
use rusqlite::{params, Connection, Result};

pub fn get_all_balances(conn: &Connection) -> Result<Vec<AccountBalance>> {
    let mut stmt = conn.prepare(
        "SELECT exchange, asset, total, available, unrealized_pnl, updated_at
         FROM account_balances ORDER BY exchange ASC, asset ASC",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(AccountBalance {
            exchange: row.get(0)?,
            asset: row.get(1)?,
            total: row.get(2)?,
            available: row.get(3)?,
            unrealized_pnl: row.get(4)?,
            updated_at: row.get(5)?,
        })
    })?;

    let mut result = Vec::new();
    for r in rows {
        result.push(r?);
    }
    Ok(result)
}

pub fn upsert_balances(conn: &mut Connection, balances: &[AccountBalance]) -> Result<()> {
    if balances.is_empty() {
        return Ok(());
    }

    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO account_balances (exchange, asset, total, available, unrealized_pnl, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(exchange, asset) DO UPDATE SET
                 total          = excluded.total,
                 available      = excluded.available,
                 unrealized_pnl = excluded.unrealized_pnl,
                 updated_at     = excluded.updated_at",
        )?;

        for b in balances {
            stmt.execute(params![
                b.exchange,
                b.asset,
                b.total,
                b.available,
                b.unrealized_pnl,
                b.updated_at
            ])?;
        }
    }
    tx.commit()?;
    Ok(())
}
