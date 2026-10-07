use crate::db::repositories::balances;
use crate::db::DbState;
use crate::models::AccountBalance;
use tauri::State;

#[tauri::command]
pub fn get_balances(state: State<'_, DbState>) -> Result<Vec<AccountBalance>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    balances::get_all_balances(&conn).map_err(|e| e.to_string())
}
