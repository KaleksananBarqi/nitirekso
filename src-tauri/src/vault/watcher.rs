use std::path::PathBuf;
use tauri::AppHandle;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod desktop {
    use super::*;
    use crate::db::DbState;
    use crate::vault::storage::FsVaultStorage;
    use crate::vault::VaultState;
    use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
    use std::sync::mpsc;
    use std::time::{Duration, Instant};
    use tauri::{Emitter, Manager};

    pub struct WatcherHandle {
        stop_tx: mpsc::Sender<()>,
    }

    impl Drop for WatcherHandle {
        fn drop(&mut self) {
            let _ = self.stop_tx.send(());
        }
    }

    pub fn start_watcher(
        app: AppHandle,
        vault_path: PathBuf,
        local_device_id: String,
    ) -> Option<WatcherHandle> {
        let ops_dir = vault_path.join("ops");
        if let Err(e) = std::fs::create_dir_all(&ops_dir) {
            log::warn!("[vault:watcher] Gagal memastikan folder ops: {}", e);
            return None;
        }

        let (tx, rx) = mpsc::channel::<notify::Result<Event>>();
        let (stop_tx, stop_rx) = mpsc::channel::<()>();

        let mut watcher = match RecommendedWatcher::new(
            move |res| {
                let _ = tx.send(res);
            },
            Config::default(),
        ) {
            Ok(w) => w,
            Err(e) => {
                log::warn!("[vault:watcher] Gagal membuat file watcher: {}", e);
                return None;
            }
        };

        if let Err(e) = watcher.watch(&ops_dir, RecursiveMode::Recursive) {
            log::warn!("[vault:watcher] Gagal memantau folder ops: {}", e);
            return None;
        }

        std::thread::spawn(move || {
            let _keep_watcher_alive = watcher;
            let mut pending_since: Option<Instant> = None;

            loop {
                if stop_rx.try_recv().is_ok() {
                    break;
                }

                match rx.recv_timeout(Duration::from_millis(200)) {
                    Ok(Ok(event)) => {
                        let is_relevant_remote = event.paths.iter().any(|p| {
                            let s = p.to_string_lossy();
                            let fname = p
                                .file_name()
                                .and_then(|n| n.to_str())
                                .unwrap_or("");
                            !FsVaultStorage::is_ignored_sync_temp_name(fname)
                                && !s.contains(&format!(
                                    "{}{}{}",
                                    std::path::MAIN_SEPARATOR,
                                    local_device_id,
                                    std::path::MAIN_SEPARATOR
                                ))
                                && fname.ends_with(".jsonl")
                        });
                        if is_relevant_remote {
                            pending_since = Some(Instant::now());
                        }
                    }
                    Ok(Err(e)) => {
                        log::warn!("[vault:watcher] Error event watcher: {}", e);
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }

                if let Some(since) = pending_since {
                    if since.elapsed() >= Duration::from_millis(500) {
                        pending_since = None;
                        let db_state = app.state::<DbState>();
                        let vault_state = app.state::<VaultState>();
                        let db_path = db_state.db_path.clone();

                        let pull_res = {
                            let mut conn = db_state.conn.lock().unwrap();
                            vault_state.run_device_sync_now(&mut conn, &db_path)
                        };

                        match pull_res {
                            Ok(res)
                                if res.applied_ops > 0
                                    || res.media_synced > 0
                                    || res.credentials_synced > 0 =>
                            {
                                log::info!(
                                    "[vault:watcher] Menerapkan {} op remote ({} media, {} kredensial)",
                                    res.applied_ops,
                                    res.media_synced,
                                    res.credentials_synced
                                );
                                let _ = app.emit("device-sync:updated", ());
                            }
                            Err(err) => {
                                log::warn!("[vault:watcher] Gagal menarik op remote: {}", err);
                            }
                            _ => {}
                        }
                    }
                }
            }
        });

        log::info!("[vault:watcher] Memantau Sync Vault di: {}", ops_dir.display());
        Some(WatcherHandle { stop_tx })
    }
}

#[cfg(any(target_os = "android", target_os = "ios"))]
mod mobile_stub {
    use super::*;
    pub struct WatcherHandle;

    pub fn start_watcher(
        _app: AppHandle,
        _vault_path: PathBuf,
        _local_device_id: String,
    ) -> Option<WatcherHandle> {
        None
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub use desktop::{start_watcher, WatcherHandle};

#[cfg(any(target_os = "android", target_os = "ios"))]
pub use mobile_stub::{start_watcher, WatcherHandle};
