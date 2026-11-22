use crate::credentials::{
    delete_credentials as delete_creds, get_all_statuses, make_key_hint,
    save_credentials as save_creds, CredentialStatus, ExchangeCredentials,
};
use crate::db::DbState;
use crate::models::MutationResult;
use crate::vault::VaultState;
use serde::Deserialize;
use tauri::State;

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
pub fn save_credentials(
    db: State<'_, DbState>,
    vault: State<'_, VaultState>,
    payload: CredentialSavePayload,
) -> MutationResult<()> {
    match save_creds(&payload.exchange, &payload.api_key, &payload.api_secret) {
        Ok(_) => {
            let creds = ExchangeCredentials {
                api_key: payload.api_key.trim().to_string(),
                api_secret: payload.api_secret.trim().to_string(),
            };
            if let Ok(bytes) = serde_json::to_vec(&creds) {
                let conn = db.conn.lock().unwrap();
                let hint = make_key_hint(&payload.api_key);
                let _ = vault.emit_credential_if_connected(
                    &conn,
                    &format!("exchange:{}", payload.exchange),
                    Some(&bytes),
                    Some(&hint),
                );
            }
            MutationResult::ok_unit()
        }
        Err(e) => MutationResult::fail(e),
    }
}

#[tauri::command]
pub fn delete_credentials(
    db: State<'_, DbState>,
    vault: State<'_, VaultState>,
    exchange: String,
) -> MutationResult<()> {
    match delete_creds(&exchange) {
        Ok(_) => {
            let conn = db.conn.lock().unwrap();
            let _ = vault.emit_credential_if_connected(
                &conn,
                &format!("exchange:{}", exchange),
                None,
                None,
            );
            MutationResult::ok_unit()
        }
        Err(e) => MutationResult::fail(e),
    }
}
