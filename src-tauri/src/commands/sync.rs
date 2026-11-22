use crate::db::DbState;
use crate::db::repositories::balances::get_all_balances;
use crate::db::repositories::sync::{SyncState, get_all_sync_states};
use crate::models::{AccountBalance, MutationResult};
use crate::sync::{SyncRunResult, sync_all, sync_balances_all};
use crate::vault::VaultState;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn get_sync_states(state: State<DbState>) -> MutationResult<Vec<SyncState>> {
    let conn = state.conn.lock().unwrap();
    match get_all_sync_states(&conn) {
        Ok(states) => MutationResult::success(states),
        Err(e) => MutationResult::fail(e.to_string()),
    }
}

#[tauri::command]
pub async fn run_sync(
    state: State<'_, DbState>,
    vault: State<'_, VaultState>,
    app: AppHandle,
) -> Result<MutationResult<SyncRunResult>, ()> {
    let started_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    match sync_all(&state, Some(&app)).await {
        Ok(res) => {
            if vault.active_storage().is_some() {
                let conn = state.conn.lock().unwrap();
                for ex_res in &res.exchanges {
                    let _ = vault.emit_sync_state_if_connected(&conn, &ex_res.exchange);
                    if let Ok(mut stmt) = conn.prepare(
                        "SELECT id FROM trades WHERE exchange = ?1 AND (hlc IS NULL OR updated_at >= ?2)",
                    ) {
                        if let Ok(rows) =
                            stmt.query_map(rusqlite::params![ex_res.exchange, started_ms], |r| {
                                r.get::<_, i64>(0)
                            })
                        {
                            for tid in rows.flatten() {
                                let _ = vault.emit_trade_only_if_connected(&conn, tid);
                            }
                        }
                    }
                }
                if let Ok(balances) = get_all_balances(&conn) {
                    let _ = vault.emit_balances_if_connected(&conn, &balances);
                }
            }
            Ok(MutationResult::success(res))
        }
        Err(e) => Ok(MutationResult::fail(e)),
    }
}

#[tauri::command]
pub async fn sync_balances(
    state: State<'_, DbState>,
    vault: State<'_, VaultState>,
) -> Result<MutationResult<Vec<AccountBalance>>, ()> {
    match sync_balances_all(&state).await {
        Ok(balances) => {
            if vault.active_storage().is_some() {
                let conn = state.conn.lock().unwrap();
                let _ = vault.emit_balances_if_connected(&conn, &balances);
            }
            Ok(MutationResult::success(balances))
        }
        Err(e) => Ok(MutationResult::fail(e)),
    }
}
