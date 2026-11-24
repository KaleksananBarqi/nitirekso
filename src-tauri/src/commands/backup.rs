#[cfg(target_os = "android")]
use crate::backup::execute_backup_to_dir;
use crate::backup::{
    disconnect_backup as bk_disconnect, execute_backup,
    get_backup_status as bk_get_status, prepare_backup_context, record_last_snapshot_at,
    restore_backup_from_path, save_local_snapshot_folder, BackupRestoreResult, BackupRunResult,
    BackupStatusPayload,
};
use crate::db::DbState;
use crate::models::MutationResult;
use crate::vault::storage::is_content_uri;
use tauri::{AppHandle, State};

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
pub fn select_backup_folder(app: AppHandle, db: State<'_, DbState>) -> MutationResult<Option<String>> {
    // Dialog pemilih folder dijalankan di luar kunci mutex database
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let picked: Option<String> = {
        let _ = app;
        rfd::FileDialog::new()
            .set_title("Pilih Folder Local Snapshot nitirekso")
            .pick_folder()
            .map(|p| p.to_string_lossy().to_string())
    };

    #[cfg(target_os = "android")]
    let picked: Option<String> = match crate::android_bridge::pick_directory_tree(&app) {
        Ok(res) => res.uri,
        Err(e) => return MutationResult::fail(e),
    };

    #[cfg(target_os = "ios")]
    let picked: Option<String> = {
        let _ = app;
        None
    };

    if let Some(chosen) = picked {
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
    app: AppHandle,
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
    let run_result = if is_content_uri(&ctx.local_folder) {
        #[cfg(target_os = "android")]
        {
            let staging_dir = crate::app_paths::get_app_cache_dir()
                .join("snapshot-staging")
                .join(format!("{}-{}", ctx.date_str, ctx.now_ms));
            let staged = execute_backup_to_dir(&ctx, &staging_dir).await;
            let res = match staged {
                Ok(mut r) => {
                    let folder_name = format!("nitirekso-snapshot-{}", ctx.date_str);
                    match crate::android_bridge::saf_write_snapshot_dir(
                        &app,
                        &ctx.local_folder,
                        &folder_name,
                        &staging_dir,
                    ) {
                        Ok(written) => {
                            r.files_uploaded = written.files_written;
                            r.bytes_uploaded = written.bytes_written;
                            Ok(r)
                        }
                        Err(e) => Err(e),
                    }
                }
                Err(e) => Err(e),
            };
            let _ = std::fs::remove_dir_all(&staging_dir);
            match res {
                Ok(r) => r,
                Err(e) => return Ok(MutationResult::fail(e)),
            }
        }
        #[cfg(not(target_os = "android"))]
        {
            let _ = app;
            return Ok(MutationResult::fail(
                "URI content:// SAF hanya didukung di perangkat Android.".to_string(),
            ));
        }
    } else {
        let _ = app;
        match execute_backup(ctx).await {
            Ok(res) => res,
            Err(e) => return Ok(MutationResult::fail(e)),
        }
    };

    {
        let conn = db.conn.lock().unwrap();
        let _ = record_last_snapshot_at(&conn, now_ms);
    }

    Ok(MutationResult::success(run_result))
}

#[tauri::command]
pub fn restore_backup(
    app: AppHandle,
    db: State<'_, DbState>,
    folder_path: Option<String>,
) -> MutationResult<BackupRestoreResult> {
    let chosen_raw = match folder_path {
        Some(s) if !s.trim().is_empty() => s.trim().to_string(),
        _ => {
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                let _ = app;
                let dialog =
                    rfd::FileDialog::new().set_title("Pilih Folder Local Snapshot nitirekso");
                match dialog.pick_folder() {
                    Some(p) => p.to_string_lossy().to_string(),
                    None => {
                        return MutationResult::fail(
                            "Pemilihan folder cadangan dibatalkan oleh pengguna.".to_string(),
                        )
                    }
                }
            }
            #[cfg(target_os = "android")]
            {
                match crate::android_bridge::pick_directory_tree(&app) {
                    Ok(picked) => match picked.uri {
                        Some(uri) => uri,
                        None => {
                            return MutationResult::fail(
                                "Pemilihan folder cadangan dibatalkan oleh pengguna.".to_string(),
                            )
                        }
                    },
                    Err(e) => return MutationResult::fail(e),
                }
            }
            #[cfg(target_os = "ios")]
            {
                let _ = app;
                return MutationResult::fail(
                    "Path folder cadangan harus disediakan pada platform mobile.".to_string(),
                );
            }
        }
    };

    if is_content_uri(&chosen_raw) {
        #[cfg(target_os = "android")]
        {
            let staging_dir = crate::app_paths::get_app_cache_dir()
                .join("restore-staging")
                .join(format!("{}", rand::random::<u32>()));
            let _ = std::fs::create_dir_all(&staging_dir);
            let copy_res = crate::android_bridge::saf_copy_tree_to_dir(&app, &chosen_raw, &staging_dir);
            let restore_res = match copy_res {
                Ok(_) => {
                    let dest_db_path = db.db_path.clone();
                    let mut conn = db.conn.lock().unwrap();
                    restore_backup_from_path(&mut conn, &dest_db_path, Some(&staging_dir))
                }
                Err(e) => Err(e),
            };
            let _ = std::fs::remove_dir_all(&staging_dir);
            return match restore_res {
                Ok(mut res) => {
                    res.source_path = chosen_raw;
                    MutationResult::success(res)
                }
                Err(e) => MutationResult::fail(e),
            };
        }
        #[cfg(not(target_os = "android"))]
        {
            return MutationResult::fail(
                "URI content:// SAF hanya didukung di perangkat Android.".to_string(),
            );
        }
    }

    let chosen_path = std::path::PathBuf::from(chosen_raw);
    let dest_db_path = db.db_path.clone();
    let mut conn = db.conn.lock().unwrap();
    match restore_backup_from_path(&mut conn, &dest_db_path, Some(&chosen_path)) {
        Ok(res) => MutationResult::success(res),
        Err(e) => MutationResult::fail(e),
    }
}
