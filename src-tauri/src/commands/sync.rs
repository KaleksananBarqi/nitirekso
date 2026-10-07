use crate::db::repositories::sync::{get_all_sync_states, SyncState};
use crate::db::DbState;
use crate::models::{AccountBalance, MutationResult};
use crate::sync::{sync_all, sync_balances_all, SyncRunResult};
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
pub async fn run_sync(state: State<'_, DbState>, app: AppHandle) -> Result<MutationResult<SyncRunResult>, ()> {
    match sync_all(&state, Some(&app)).await {
        Ok(res) => Ok(MutationResult::success(res)),
        Err(e) => Ok(MutationResult::fail(e)),
    }
}

#[tauri::command]
pub async fn sync_balances(state: State<'_, DbState>) -> Result<MutationResult<Vec<AccountBalance>>, ()> {
    match sync_balances_all(&state).await {
        Ok(balances) => Ok(MutationResult::success(balances)),
        Err(e) => Ok(MutationResult::fail(e)),
    }
}
