use crate::ai::{
    delete_ai_config as ai_delete, execute_analysis, get_ai_config as ai_get,
    prepare_analysis, save_ai_config as ai_save, AiConfigPayload, AiConfigStatus,
    JournalAnalysisResult,
};
use crate::credentials::make_key_hint;
use crate::db::DbState;
use crate::models::{MutationResult, TradeFilter};
use crate::vault::VaultState;
use serde_json::json;
use tauri::State;

#[tauri::command]
pub fn get_ai_config(db: State<'_, DbState>) -> AiConfigStatus {
    let conn = db.conn.lock().unwrap();
    ai_get(&conn)
}

#[tauri::command]
pub fn save_ai_config(
    db: State<'_, DbState>,
    vault: State<'_, VaultState>,
    payload: AiConfigPayload,
) -> MutationResult<()> {
    let conn = db.conn.lock().unwrap();
    match ai_save(&conn, &payload) {
        Ok(_) => {
            let trimmed = payload.api_key.trim();
            let hint = make_key_hint(trimmed);
            let _ = vault.emit_credential_if_connected(
                &conn,
                "ai_openai",
                Some(trimmed.as_bytes()),
                Some(&hint),
            );
            if !payload.model.trim().is_empty() {
                let _ = vault.emit_setting_if_connected(
                    &conn,
                    "aiModel",
                    &json!(payload.model.trim()),
                );
            }
            if let Some(ref base) = payload.base_url {
                if !base.trim().is_empty() {
                    let _ = vault.emit_setting_if_connected(
                        &conn,
                        "aiBaseUrl",
                        &json!(base.trim()),
                    );
                }
            }
            MutationResult::ok_unit()
        }
        Err(e) => MutationResult::fail(e),
    }
}

#[tauri::command]
pub fn delete_ai_config(
    db: State<'_, DbState>,
    vault: State<'_, VaultState>,
) -> MutationResult<()> {
    match ai_delete() {
        Ok(_) => {
            let conn = db.conn.lock().unwrap();
            let _ = vault.emit_credential_if_connected(&conn, "ai_openai", None, None);
            MutationResult::ok_unit()
        }
        Err(e) => MutationResult::fail(e),
    }
}

#[tauri::command]
pub async fn analyze_journal(
    db: State<'_, DbState>,
    filter: Option<TradeFilter>,
) -> Result<MutationResult<JournalAnalysisResult>, ()> {
    let ctx = {
        let conn = db.conn.lock().unwrap();
        match prepare_analysis(&conn, filter.as_ref()) {
            Ok(c) => c,
            Err(e) => return Ok(MutationResult::fail(e)),
        }
    };

    match execute_analysis(ctx).await {
        Ok(res) => Ok(MutationResult::success(res)),
        Err(err) => Ok(MutationResult::fail(err)),
    }
}
