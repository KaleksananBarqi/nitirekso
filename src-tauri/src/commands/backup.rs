use crate::backup::{
    disconnect_backup as bk_disconnect, execute_backup, get_backup_status as bk_get_status,
    prepare_backup_context, restore_backup_from_path, select_local_folder,
    start_backup_oauth as bk_start_oauth, BackupRestoreResult, BackupRunResult, BackupStatusPayload,
};
use crate::db::repositories::settings::set_setting;
use crate::db::DbState;
use crate::models::MutationResult;
use serde_json::json;
use tauri::State;

#[tauri::command]
pub fn get_backup_status(db: State<'_, DbState>) -> BackupStatusPayload {
    let conn = db.conn.lock().unwrap();
    bk_get_status(&conn)
}

#[tauri::command]
pub fn disconnect_backup(db: State<'_, DbState>) -> MutationResult<()> {
    let conn = db.conn.lock().unwrap();
    match bk_disconnect(&conn) {
        Ok(_) => MutationResult::ok_unit(),
        Err(e) => MutationResult::fail(e),
    }
}

#[tauri::command]
pub fn select_backup_folder(db: State<'_, DbState>) -> MutationResult<Option<String>> {
    let conn = db.conn.lock().unwrap();
    match select_local_folder(&conn) {
        Ok(opt) => MutationResult::success(opt),
        Err(e) => MutationResult::fail(e),
    }
}

#[tauri::command]
pub async fn start_backup_oauth(
    db: State<'_, DbState>,
    client_id: Option<String>,
) -> Result<MutationResult<()>, ()> {
    let db_path = db.db_path.clone();
    match bk_start_oauth(db_path, client_id).await {
        Ok(_) => Ok(MutationResult::ok_unit()),
        Err(e) => Ok(MutationResult::fail(e)),
    }
}

#[tauri::command]
pub async fn run_backup(
    db: State<'_, DbState>,
) -> Result<MutationResult<BackupRunResult>, ()> {
    // 1. Ekstrak snapshot & kredensial secara synchronous tanpa menahan database lock lama-lama
    let ctx = {
        let conn = db.conn.lock().unwrap();
        match prepare_backup_context(&conn, &db.db_path) {
            Ok(c) => c,
            Err(e) => return Ok(MutationResult::fail(e)),
        }
    };

    let now_ms = ctx.now_ms;

    // 2. Jalankan proses upload file / Google Drive secara async
    let (run_result, cloud_folder_id) = match execute_backup(ctx).await {
        Ok(res) => res,
        Err(e) => return Ok(MutationResult::fail(e)),
    };

    // 3. Simpan timestamp backup terakhir dan folder ID ke database
    {
        let conn = db.conn.lock().unwrap();
        let _ = set_setting(&conn, "gdriveLastBackupAt", &json!(now_ms));
        if let Some(folder_id) = cloud_folder_id {
            let _ = set_setting(&conn, "gdriveFolderId", &json!(folder_id));
        }
    }

    Ok(MutationResult::success(run_result))
}

#[tauri::command]
pub fn restore_backup(
    db: State<'_, DbState>,
    folder_path: Option<String>,
) -> MutationResult<BackupRestoreResult> {
    let chosen_path = match folder_path {
        Some(s) if !s.trim().is_empty() => std::path::PathBuf::from(s.trim()),
        _ => {
            let dialog = rfd::FileDialog::new().set_title("Pilih Folder Cadangan nitirekso");
            match dialog.pick_folder() {
                Some(p) => p,
                None => return MutationResult::fail("Pemilihan folder cadangan dibatalkan oleh pengguna.".to_string()),
            }
        }
    };

    let dest_db_path = db.db_path.clone();
    let mut conn = db.conn.lock().unwrap();
    match restore_backup_from_path(&mut conn, &dest_db_path, Some(&chosen_path)) {
        Ok(res) => MutationResult::success(res),
        Err(e) => MutationResult::fail(e),
    }
}
