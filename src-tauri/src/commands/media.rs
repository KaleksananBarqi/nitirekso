use crate::db::DbState;
use crate::media::{
    get_media_record, read_media_bytes_for_sync, read_media_data_url,
    save_media_asset as media_save, soft_delete_media_asset, MediaAssetInfo, MediaUploadPayload,
};
use crate::models::MutationResult;
use crate::vault::VaultState;
use tauri::State;

#[tauri::command]
pub fn save_media_asset(
    db: State<'_, DbState>,
    vault: State<'_, VaultState>,
    payload: MediaUploadPayload,
) -> MutationResult<MediaAssetInfo> {
    let conn = db.conn.lock().unwrap();
    match media_save(&conn, &db.db_path, &payload) {
        Ok(info) => {
            if let Ok(Some(bytes)) = read_media_bytes_for_sync(&db.db_path, &info.sha256, &info.ext) {
                let _ = vault.emit_media_upsert(&conn, &info.sha256, Some(&bytes));
            }
            MutationResult::success(info)
        }
        Err(e) => MutationResult::fail(e),
    }
}

#[tauri::command]
pub fn get_media_asset(db: State<'_, DbState>, sha256: String) -> MutationResult<String> {
    let conn = db.conn.lock().unwrap();
    match read_media_data_url(&conn, &db.db_path, &sha256) {
        Ok(data_url) => MutationResult::success(data_url),
        Err(e) => MutationResult::fail(e),
    }
}

#[tauri::command]
pub fn delete_media_asset(
    db: State<'_, DbState>,
    vault: State<'_, VaultState>,
    sha256: String,
) -> MutationResult<()> {
    let conn = db.conn.lock().unwrap();
    match soft_delete_media_asset(&conn, &sha256) {
        Ok(changed) => {
            if changed {
                if get_media_record(&conn, &sha256).is_some() {
                    let _ = vault.emit_media_upsert(&conn, &sha256, None);
                }
            }
            MutationResult::ok_unit()
        }
        Err(e) => MutationResult::fail(e),
    }
}
