use crate::db::DbState;
use crate::models::MutationResult;
#[cfg(target_os = "android")]
use crate::vault::saf_storage::SafVaultStorage;
use crate::vault::storage::{is_content_uri, FsVaultStorage, VaultStorage};
use crate::vault::watcher::start_watcher;
use crate::vault::{
    DeviceSyncConnectPayload, DeviceSyncRunResult, DeviceSyncStatusPayload, VaultState,
};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub fn get_device_sync_status(vault: State<'_, VaultState>) -> DeviceSyncStatusPayload {
    vault.get_status()
}

#[tauri::command]
pub fn select_sync_vault_folder(app: AppHandle) -> MutationResult<Option<String>> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let _ = app;
        let dialog = rfd::FileDialog::new()
            .set_title("Pilih Folder Sync Vault nitirekso (Syncthing)");
        if let Some(folder) = dialog.pick_folder() {
            MutationResult::success(Some(folder.to_string_lossy().to_string()))
        } else {
            MutationResult::success(None)
        }
    }

    #[cfg(target_os = "android")]
    {
        match crate::android_bridge::pick_directory_tree(&app) {
            Ok(picked) => MutationResult::success(picked.uri),
            Err(e) => MutationResult::fail(e),
        }
    }

    #[cfg(target_os = "ios")]
    {
        let _ = app;
        MutationResult::success(None)
    }
}

#[tauri::command]
pub fn connect_sync_vault(
    app: AppHandle,
    db: State<'_, DbState>,
    vault: State<'_, VaultState>,
    payload: DeviceSyncConnectPayload,
) -> MutationResult<DeviceSyncRunResult> {
    let trimmed_path = payload.folder_path.trim();
    if trimmed_path.is_empty() {
        return MutationResult::fail("Folder Sync Vault belum dipilih.");
    }

    let vault_path = PathBuf::from(trimmed_path);
    let storage: Arc<dyn VaultStorage> = if is_content_uri(trimmed_path) {
        #[cfg(target_os = "android")]
        {
            Arc::new(SafVaultStorage::new(app.clone(), trimmed_path.to_string()))
        }
        #[cfg(not(target_os = "android"))]
        {
            return MutationResult::fail(
                "URI content:// SAF hanya didukung di perangkat Android.".to_string(),
            );
        }
    } else {
        Arc::new(FsVaultStorage::new(vault_path.clone()))
    };
    let db_path = db.db_path.clone();

    let res = {
        let mut conn = db.conn.lock().unwrap();
        vault.connect_with_storage(
            &mut conn,
            &db_path,
            storage.as_ref(),
            trimmed_path,
            &payload.passphrase,
        )
    };

    match res {
        Ok(run_res) => {
            if !is_content_uri(trimmed_path) {
                let device_id = vault.runtime.lock().unwrap().device_id.clone();
                let handle = start_watcher(app.clone(), vault_path, device_id);
                *vault.watcher.lock().unwrap() = handle;
            }
            let _ = app.emit("device-sync:updated", ());
            MutationResult::success(run_res)
        }
        Err(e) => MutationResult::fail(e),
    }
}

#[tauri::command]
pub fn disconnect_sync_vault(
    db: State<'_, DbState>,
    vault: State<'_, VaultState>,
) -> MutationResult<()> {
    let conn = db.conn.lock().unwrap();
    match vault.disconnect(&conn) {
        Ok(_) => MutationResult::ok_unit(),
        Err(e) => MutationResult::fail(e),
    }
}

#[tauri::command]
pub fn run_device_sync(
    app: AppHandle,
    db: State<'_, DbState>,
    vault: State<'_, VaultState>,
) -> MutationResult<DeviceSyncRunResult> {
    let db_path = db.db_path.clone();
    let res = {
        let mut conn = db.conn.lock().unwrap();
        vault.run_device_sync_now(&mut conn, &db_path)
    };

    match res {
        Ok(r) => {
            if r.applied_ops > 0 || r.media_synced > 0 || r.credentials_synced > 0 {
                let _ = app.emit("device-sync:updated", ());
            }
            MutationResult::success(r)
        }
        Err(e) => MutationResult::fail(e),
    }
}
