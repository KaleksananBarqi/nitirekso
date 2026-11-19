pub mod ai;
pub mod app_utils;
pub mod backup;
pub mod commands;
pub mod credentials;
pub mod db;
pub mod exchanges;
pub mod export;
pub mod logging;
pub mod models;
pub mod screenshots;
pub mod sync;
pub mod updater;
pub mod video;

use commands::{
    ai::*, app_utils::*, backup::*, balances::*, credentials::*, export::*, health::*, logging::*,
    screenshots::*, settings::*, sync::*, trades::*, video::*,
};
use db::{get_db_path, initialize_db, DbState};
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let db_path = get_db_path();
            log::info!("[db:init] Membuka database di: {:?}", db_path);
            let conn = initialize_db(&db_path)
                .map_err(|e| Box::<dyn std::error::Error>::from(e.to_string()))?;

            app.manage(DbState {
                conn: Mutex::new(conn),
                db_path,
            });

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
            start_backup_oauth,
            select_backup_folder,
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
            save_video_file
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
