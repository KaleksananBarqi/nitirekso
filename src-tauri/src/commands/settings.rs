use crate::db::repositories::settings;
use crate::db::DbState;
use crate::models::MutationResult;
use tauri::State;

#[tauri::command]
pub fn get_settings(
    state: State<'_, DbState>,
) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    settings::get_all_settings(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_settings(
    state: State<'_, DbState>,
    payload: serde_json::Value,
) -> Result<MutationResult<()>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    match settings::set_settings(&conn, &payload) {
        Ok(_) => Ok(MutationResult::ok_unit()),
        Err(e) => Ok(MutationResult::fail(format!(
            "Gagal menyimpan pengaturan: {}",
            e
        ))),
    }
}
