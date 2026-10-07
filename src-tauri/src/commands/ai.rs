use crate::ai::{
    delete_ai_config as ai_delete, execute_analysis, get_ai_config as ai_get,
    prepare_analysis, save_ai_config as ai_save, AiConfigPayload, AiConfigStatus,
    JournalAnalysisResult,
};
use crate::db::DbState;
use crate::models::{MutationResult, TradeFilter};
use tauri::State;

#[tauri::command]
pub fn get_ai_config(db: State<'_, DbState>) -> AiConfigStatus {
    let conn = db.conn.lock().unwrap();
    ai_get(&conn)
}

#[tauri::command]
pub fn save_ai_config(db: State<'_, DbState>, payload: AiConfigPayload) -> MutationResult<()> {
    let conn = db.conn.lock().unwrap();
    match ai_save(&conn, &payload) {
        Ok(_) => MutationResult::ok_unit(),
        Err(e) => MutationResult::fail(e),
    }
}

#[tauri::command]
pub fn delete_ai_config() -> MutationResult<()> {
    match ai_delete() {
        Ok(_) => MutationResult::ok_unit(),
        Err(e) => MutationResult::fail(e),
    }
}

#[tauri::command]
pub async fn analyze_journal(
    db: State<'_, DbState>,
    filter: Option<TradeFilter>,
) -> Result<MutationResult<JournalAnalysisResult>, ()> {
    // 1. Ambil data trade & settings secara synchronous, lepaskan mutex lock segera
    let ctx = {
        let conn = db.conn.lock().unwrap();
        match prepare_analysis(&conn, filter.as_ref()) {
            Ok(c) => c,
            Err(e) => return Ok(MutationResult::fail(e)),
        }
    };

    // 2. Jalankan pemanggilan OpenAI secara async tanpa menahan database lock
    match execute_analysis(ctx).await {
        Ok(res) => Ok(MutationResult::success(res)),
        Err(err) => Ok(MutationResult::fail(err)),
    }
}
