use crate::db::DbState;
use crate::media::{media_file_name, read_media_bytes_for_sync, save_media_asset, MediaUploadPayload};
use crate::models::MutationResult;
use crate::screenshots::{read_screenshot_data_url, ScreenshotUploadPayload};
use crate::vault::VaultState;
use tauri::State;

#[tauri::command]
pub fn upload_screenshot(
    db: State<'_, DbState>,
    vault: State<'_, VaultState>,
    payload: ScreenshotUploadPayload,
) -> MutationResult<String> {
    let media_payload = MediaUploadPayload {
        kind: "screenshot".to_string(),
        file_name: payload.file_name,
        data: payload.data,
    };

    let conn = db.conn.lock().unwrap();
    match save_media_asset(&conn, &db.db_path, &media_payload) {
        Ok(info) => {
            if let Ok(Some(bytes)) =
                read_media_bytes_for_sync(&db.db_path, &info.sha256, &info.ext)
            {
                let _ = vault.emit_media_upsert(&conn, &info.sha256, Some(&bytes));
            }
            MutationResult::success(media_file_name(&info.sha256, &info.ext))
        }
        Err(e) => MutationResult::fail(e),
    }
}

#[tauri::command]
pub fn get_screenshot(db: State<'_, DbState>, rel_path: String) -> MutationResult<String> {
    match read_screenshot_data_url(&db.db_path, &rel_path) {
        Ok(data_url) => MutationResult::success(data_url),
        Err(e) => MutationResult::fail(e),
    }
}
