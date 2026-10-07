use crate::db::DbState;
use crate::models::AppHealth;
use tauri::State;

#[tauri::command]
pub fn get_app_health(state: State<'_, DbState>) -> Result<AppHealth, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut details = Vec::new();
    let val: Result<i64, _> = conn.query_row("SELECT 1", [], |r| r.get(0));
    match val {
        Ok(v) => details.push(format!("[ok] SQLite native Rust (SELECT 1 = {})", v)),
        Err(e) => details.push(format!("[gagal] SQLite error: {}", e)),
    }

    let fk: Result<i64, _> = conn.pragma_query_value(None, "foreign_keys", |r| r.get(0));
    match fk {
        Ok(1) => details.push("[ok] PRAGMA foreign_keys = ON".to_string()),
        _ => details.push("[warn] PRAGMA foreign_keys tidak aktif".to_string()),
    }

    let jm: Result<String, _> = conn.pragma_query_value(None, "journal_mode", |r| r.get(0));
    match jm {
        Ok(mode) => details.push(format!("[ok] PRAGMA journal_mode = {}", mode.to_uppercase())),
        _ => details.push("[warn] Gagal membaca journal_mode".to_string()),
    }

    Ok(AppHealth {
        ok: true,
        details,
        db_path: state.db_path.to_string_lossy().to_string(),
    })
}
