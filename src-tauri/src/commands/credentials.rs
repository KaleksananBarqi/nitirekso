use crate::credentials::{
    delete_credentials as delete_creds, get_all_statuses, save_credentials as save_creds,
    CredentialStatus,
};
use crate::models::MutationResult;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialSavePayload {
    pub exchange: String,
    pub api_key: String,
    pub api_secret: String,
}

#[tauri::command]
pub fn get_credential_statuses() -> MutationResult<Vec<CredentialStatus>> {
    MutationResult::success(get_all_statuses())
}

#[tauri::command]
pub fn save_credentials(payload: CredentialSavePayload) -> MutationResult<()> {
    match save_creds(&payload.exchange, &payload.api_key, &payload.api_secret) {
        Ok(_) => MutationResult::ok_unit(),
        Err(e) => MutationResult::fail(e),
    }
}

#[tauri::command]
pub fn delete_credentials(exchange: String) -> MutationResult<()> {
    match delete_creds(&exchange) {
        Ok(_) => MutationResult::ok_unit(),
        Err(e) => MutationResult::fail(e),
    }
}
