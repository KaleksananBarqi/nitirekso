use crate::db::DbState;
use crate::export::export_journal_to_file;
use crate::models::{MutationResult, TradeFilter};
use tauri::State;

#[tauri::command]
pub fn export_journal(
    db: State<'_, DbState>,
    format: String,
    filter: Option<TradeFilter>,
) -> MutationResult<String> {
    let conn = db.conn.lock().unwrap();
    match export_journal_to_file(&conn, &format, filter.as_ref()) {
        Ok(path) => MutationResult::success(path),
        Err(e) => MutationResult::fail(e),
    }
}
