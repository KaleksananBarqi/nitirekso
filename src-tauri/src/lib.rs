pub mod ai;
pub mod android_bridge;
pub mod app_paths;
pub mod app_utils;
pub mod backup;
pub mod commands;
pub mod credentials;
pub mod db;
pub mod exchanges;
pub mod export;
pub mod logging;
pub mod media;
pub mod models;
pub mod screenshots;
pub mod sync;
pub mod updater;
pub mod vault;
pub mod video;

use commands::{
    ai::*, app_utils::*, backup::*, balances::*, credentials::*, export::*, health::*, logging::*,
    media::*, screenshots::*, settings::*, sync::*, trades::*, vault::*, video::*,
};
use db::{get_db_path, initialize_db, DbState};
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use vault::watcher::start_watcher;
use vault::VaultState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }))
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }

    builder
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(android_bridge::init_plugin())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            app_paths::init_app_data_dir(app.handle());

            let db_path = get_db_path();
            log::info!("[db:init] Membuka database di: {:?}", db_path);
            let mut conn = initialize_db(&db_path)
                .map_err(|e| Box::<dyn std::error::Error>::from(e.to_string()))?;

            let vault_state = VaultState::from_db(&conn, &db_path);
            vault_state.set_app_handle(app.handle().clone());
            let vault_status = vault_state.get_status();
            if vault_status.connected {
                if let Err(err) = vault_state.run_device_sync_now(&mut conn, &db_path) {
                    log::warn!("[device-sync] Sinkronisasi startup gagal: {}", err);
                }
                if let Some(vp) = vault_status.vault_path.as_deref() {
                    if !vault::storage::is_content_uri(vp) {
                        let handle = start_watcher(
                            app.handle().clone(),
                            std::path::PathBuf::from(vp),
                            vault_status.device_id,
                        );
                        *vault_state.watcher.lock().unwrap() = handle;
                    }
                    let _ = app.handle().emit("device-sync:updated", ());
                }
            }

            app.manage(DbState {
                conn: Mutex::new(conn),
                db_path,
            });
            app.manage(vault_state);

            log::info!("[db:init] SQLite database terinisialisasi dan siap digunakan");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_health,
            list_trades,
            get_trade,
            create_trade,
            update_trade,
            delete_trade,
            get_trade_meta,
            get_settings,
            set_settings,
            get_balances,
            sync_balances,
            get_sync_states,
            run_sync,
            get_credential_statuses,
            save_credentials,
            delete_credentials,
            get_backup_status,
            run_backup,
            restore_backup,
            disconnect_backup,
            select_backup_folder,
            get_device_sync_status,
            select_sync_vault_folder,
            connect_sync_vault,
            disconnect_sync_vault,
            run_device_sync,
            save_media_asset,
            get_media_asset,
            delete_media_asset,
            get_ai_config,
            save_ai_config,
            delete_ai_config,
            analyze_journal,
            export_journal,
            upload_screenshot,
            get_screenshot,
            get_logs,
            clear_logs,
            open_log_folder,
            write_log,
            open_external_url,
            get_app_version,
            check_for_updates,
            detect_install_environment,
            fetch_release_update_metadata,
            download_and_verify_linux_package,
            install_linux_package_and_relaunch,
            open_local_installer_fallback,
            get_btc_klines,
            remux_video_mp4,
            save_video_file,
            save_media_export,
            share_media_export,
            copy_media_image
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
