use crate::backup::{
    disconnect_backup as bk_disconnect, execute_backup, get_backup_status as bk_get_status,
    prepare_backup_context, record_last_snapshot_at, restore_backup_from_path,
    save_local_snapshot_folder, BackupRestoreResult, BackupRunResult, BackupStatusPayload,
};
use crate::db::DbState;
use crate::models::MutationResult;
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
    // Dialog pemilih folder dijalankan di luar kunci mutex database
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let picked = rfd::FileDialog::new()
        .set_title("Pilih Folder Local Snapshot nitirekso")
        .pick_folder();

    #[cfg(any(target_os = "android", target_os = "ios"))]
    let picked: Option<std::path::PathBuf> = None;

    if let Some(folder_path) = picked {
        let chosen = folder_path.to_string_lossy().to_string();
        let conn = db.conn.lock().unwrap();
        match save_local_snapshot_folder(&conn, &chosen) {
            Ok(_) => MutationResult::success(Some(chosen)),
            Err(e) => MutationResult::fail(e),
        }
    } else {
        MutationResult::success(None)
    }
}

#[tauri::command]
pub async fn run_backup(
    db: State<'_, DbState>,
) -> Result<MutationResult<BackupRunResult>, ()> {
    let ctx = {
        let conn = db.conn.lock().unwrap();
        match prepare_backup_context(&conn, &db.db_path) {
            Ok(c) => c,
            Err(e) => return Ok(MutationResult::fail(e)),
        }
    };

    let now_ms = ctx.now_ms;
    let run_result = match execute_backup(ctx).await {
        Ok(res) => res,
        Err(e) => return Ok(MutationResult::fail(e)),
    };

    {
        let conn = db.conn.lock().unwrap();
        let _ = record_last_snapshot_at(&conn, now_ms);
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
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                let dialog =
                    rfd::FileDialog::new().set_title("Pilih Folder Local Snapshot nitirekso");
                match dialog.pick_folder() {
                    Some(p) => p,
                    None => {
                        return MutationResult::fail(
                            "Pemilihan folder cadangan dibatalkan oleh pengguna.".to_string(),
                        )
                    }
                }
            }
            #[cfg(any(target_os = "android", target_os = "ios"))]
            {
                return MutationResult::fail(
                    "Path folder cadangan harus disediakan pada platform mobile.".to_string(),
                );
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
