#[cfg(target_os = "android")]
use crate::android_bridge;
#[cfg(target_os = "android")]
use crate::vault::storage::{MAX_OPLOG_FILE_BYTES, OpFileInfo, VaultStorage};
#[cfg(target_os = "android")]
use tauri::AppHandle;

/// Implementasi `VaultStorage` untuk Android berbasis Storage Access Framework (SAF).
/// Seluruh operasi berkas (`vault.json`, `ops/<device_id>/`, dan `media/`) didelegasikan ke
/// plugin Kotlin melalui `android_bridge` agar patuh terhadap Scoped Storage Android 10+.
#[cfg(target_os = "android")]
#[derive(Clone)]
pub struct SafVaultStorage {
    pub app: AppHandle,
    pub tree_uri: String,
}

#[cfg(target_os = "android")]
impl SafVaultStorage {
    pub fn new(app: AppHandle, tree_uri: String) -> Self {
        Self { app, tree_uri }
    }
}

#[cfg(target_os = "android")]
impl VaultStorage for SafVaultStorage {
    fn ensure_layout(&self, device_id: &str) -> Result<(), String> {
        android_bridge::saf_ensure_layout(&self.app, &self.tree_uri, device_id)
    }

    fn read_meta(&self) -> Result<Option<Vec<u8>>, String> {
        android_bridge::saf_read_meta(&self.app, &self.tree_uri)
    }

    fn write_meta(&self, data: &[u8]) -> Result<(), String> {
        android_bridge::saf_write_meta(&self.app, &self.tree_uri, data)
    }

    fn list_remote_op_files(&self, local_device_id: &str) -> Result<Vec<OpFileInfo>, String> {
        let mut results: Vec<OpFileInfo> =
            android_bridge::saf_list_remote_op_files(&self.app, &self.tree_uri, local_device_id)?
                .into_iter()
                .map(|item| OpFileInfo {
                    device_id: item.device_id,
                    file_name: item.file_name,
                })
                .collect();

        results.sort_by(|a, b| {
            a.device_id
                .cmp(&b.device_id)
                .then_with(|| a.file_name.cmp(&b.file_name))
        });

        Ok(results)
    }

    fn read_op_lines(
        &self,
        device_id: &str,
        file_name: &str,
        from_line: usize,
    ) -> Result<(Vec<(usize, String)>, usize), String> {
        android_bridge::saf_read_op_lines(&self.app, &self.tree_uri, device_id, file_name, from_line)
    }

    fn append_op_lines(&self, device_id: &str, lines: &[String]) -> Result<(), String> {
        if lines.is_empty() {
            return Ok(());
        }
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        let date_str = crate::backup::format_date_ymd(now_ms);
        android_bridge::saf_append_op_lines(
            &self.app,
            &self.tree_uri,
            device_id,
            &date_str,
            MAX_OPLOG_FILE_BYTES,
            lines,
        )
    }

    fn has_media(&self, file_name: &str) -> bool {
        android_bridge::saf_has_media(&self.app, &self.tree_uri, file_name)
    }

    fn write_media(&self, file_name: &str, bytes: &[u8]) -> Result<(), String> {
        android_bridge::saf_write_media(&self.app, &self.tree_uri, file_name, bytes)
    }

    fn read_media(&self, file_name: &str) -> Result<Option<Vec<u8>>, String> {
        android_bridge::saf_read_media(&self.app, &self.tree_uri, file_name)
    }
}
