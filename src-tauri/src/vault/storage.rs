use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

/// Batas ukuran berkas operation log sebelum rotasi otomatis (~1 MB)
pub const MAX_OPLOG_FILE_BYTES: u64 = 1024 * 1024;

/// Memeriksa apakah path/URI menunjuk ke Storage Access Framework Android (`content://`).
pub fn is_content_uri(path_or_uri: &str) -> bool {
    path_or_uri.trim().starts_with("content://")
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpFileInfo {
    pub device_id: String,
    pub file_name: String,
}

/// Abstraksi sistem berkas Sync Vault agar implementasi Desktop (FsVaultStorage)
/// dan Android Scoped Storage / SAF nantinya dapat berbagi engine merge yang sama.
pub trait VaultStorage: Send + Sync {
    fn ensure_layout(&self, device_id: &str) -> Result<(), String>;
    fn read_meta(&self) -> Result<Option<Vec<u8>>, String>;
    fn write_meta(&self, data: &[u8]) -> Result<(), String>;
    fn list_remote_op_files(&self, local_device_id: &str) -> Result<Vec<OpFileInfo>, String>;
    fn read_op_lines(
        &self,
        device_id: &str,
        file_name: &str,
        from_line: usize,
    ) -> Result<(Vec<(usize, String)>, usize), String>;
    fn append_op_lines(&self, device_id: &str, lines: &[String]) -> Result<(), String>;
    fn has_media(&self, file_name: &str) -> bool;
    fn write_media(&self, file_name: &str, bytes: &[u8]) -> Result<(), String>;
    fn read_media(&self, file_name: &str) -> Result<Option<Vec<u8>>, String>;
}

/// Implementasi VaultStorage berbasis sistem berkas lokal standar (Desktop & folder mounted).
#[derive(Debug, Clone)]
pub struct FsVaultStorage {
    pub root: PathBuf,
}

impl FsVaultStorage {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn is_ignored_sync_temp_name(name: &str) -> bool {
        name.starts_with(".syncthing.")
            || name.starts_with("~syncthing~")
            || name.ends_with(".tmp")
            || name.starts_with('.')
    }

    fn ops_root(&self) -> PathBuf {
        self.root.join("ops")
    }

    fn media_root(&self) -> PathBuf {
        self.root.join("media")
    }

    fn meta_path(&self) -> PathBuf {
        self.root.join("vault.json")
    }

    fn active_oplog_file(&self, device_dir: &Path, date_str: &str) -> Result<PathBuf, String> {
        let mut max_seq: u32 = 1;
        let prefix = format!("{}-", date_str);

        if let Ok(entries) = fs::read_dir(device_dir) {
            for entry in entries.flatten() {
                let fname = entry.file_name().to_string_lossy().to_string();
                if Self::is_ignored_sync_temp_name(&fname) || !fname.ends_with(".jsonl") {
                    continue;
                }
                if let Some(rest) = fname.strip_prefix(&prefix) {
                    if let Some(seq_str) = rest.strip_suffix(".jsonl") {
                        if let Ok(seq) = seq_str.parse::<u32>() {
                            if seq > max_seq {
                                max_seq = seq;
                            }
                        }
                    }
                }
            }
        }

        let candidate = device_dir.join(format!("{}-{:03}.jsonl", date_str, max_seq));
        if candidate.exists() {
            if let Ok(meta) = fs::metadata(&candidate) {
                if meta.len() >= MAX_OPLOG_FILE_BYTES {
                    return Ok(device_dir.join(format!("{}-{:03}.jsonl", date_str, max_seq + 1)));
                }
            }
        }

        Ok(candidate)
    }
}

impl VaultStorage for FsVaultStorage {
    fn ensure_layout(&self, device_id: &str) -> Result<(), String> {
        fs::create_dir_all(&self.root)
            .map_err(|e| format!("Gagal membuat folder Sync Vault: {}", e))?;
        fs::create_dir_all(self.ops_root().join(device_id))
            .map_err(|e| format!("Gagal membuat folder ops perangkat: {}", e))?;
        fs::create_dir_all(self.media_root())
            .map_err(|e| format!("Gagal membuat folder media Sync Vault: {}", e))?;
        Ok(())
    }

    fn read_meta(&self) -> Result<Option<Vec<u8>>, String> {
        let path = self.meta_path();
        if !path.exists() {
            return Ok(None);
        }
        let bytes = fs::read(&path)
            .map_err(|e| format!("Gagal membaca vault.json dari Sync Vault: {}", e))?;
        Ok(Some(bytes))
    }

    fn write_meta(&self, data: &[u8]) -> Result<(), String> {
        fs::create_dir_all(&self.root)
            .map_err(|e| format!("Gagal membuat folder Sync Vault: {}", e))?;
        let tmp = self.root.join(format!(".tmp-vault-{}.json", rand::random::<u32>()));
        fs::write(&tmp, data).map_err(|e| format!("Gagal menulis vault.json sementara: {}", e))?;
        if let Err(e) = fs::rename(&tmp, self.meta_path()) {
            let _ = fs::remove_file(&tmp);
            return Err(format!("Gagal memfinalisasi vault.json: {}", e));
        }
        Ok(())
    }

    fn list_remote_op_files(&self, local_device_id: &str) -> Result<Vec<OpFileInfo>, String> {
        let ops_dir = self.ops_root();
        if !ops_dir.exists() {
            return Ok(Vec::new());
        }

        let mut results = Vec::new();
        let device_entries = fs::read_dir(&ops_dir)
            .map_err(|e| format!("Gagal membaca direktori ops Sync Vault: {}", e))?;

        for dev_entry in device_entries.flatten() {
            let dev_path = dev_entry.path();
            if !dev_path.is_dir() {
                continue;
            }
            let dev_name = dev_entry.file_name().to_string_lossy().to_string();
            if Self::is_ignored_sync_temp_name(&dev_name) || dev_name == local_device_id {
                continue;
            }

            if let Ok(files) = fs::read_dir(&dev_path) {
                for f_entry in files.flatten() {
                    let f_path = f_entry.path();
                    if !f_path.is_file() {
                        continue;
                    }
                    let fname = f_entry.file_name().to_string_lossy().to_string();
                    if Self::is_ignored_sync_temp_name(&fname) || !fname.ends_with(".jsonl") {
                        continue;
                    }
                    results.push(OpFileInfo {
                        device_id: dev_name.clone(),
                        file_name: fname,
                    });
                }
            }
        }

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
        if Self::is_ignored_sync_temp_name(file_name) {
            return Ok((Vec::new(), from_line));
        }
        let path = self.ops_root().join(device_id).join(file_name);
        if !path.exists() {
            return Ok((Vec::new(), from_line));
        }

        let file = fs::File::open(&path)
            .map_err(|e| format!("Gagal membuka file op-log {}: {}", path.display(), e))?;
        let reader = BufReader::new(file);

        let mut new_lines = Vec::new();
        let mut total_seen = 0;

        for line_res in reader.lines() {
            let line = match line_res {
                Ok(l) => l,
                Err(_) => break,
            };
            if total_seen >= from_line {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    new_lines.push((total_seen, trimmed.to_string()));
                }
            }
            total_seen += 1;
        }

        Ok((new_lines, total_seen))
    }

    fn append_op_lines(&self, device_id: &str, lines: &[String]) -> Result<(), String> {
        if lines.is_empty() {
            return Ok(());
        }
        self.ensure_layout(device_id)?;
        let device_dir = self.ops_root().join(device_id);
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        let date_str = crate::backup::format_date_ymd(now_ms);

        let target = self.active_oplog_file(&device_dir, &date_str)?;
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&target)
            .map_err(|e| format!("Gagal membuka op-log {}: {}", target.display(), e))?;

        for line in lines {
            writeln!(file, "{}", line)
                .map_err(|e| format!("Gagal menulis baris op-log: {}", e))?;
        }
        file.flush()
            .map_err(|e| format!("Gagal flush op-log: {}", e))?;
        Ok(())
    }

    fn has_media(&self, file_name: &str) -> bool {
        !Self::is_ignored_sync_temp_name(file_name) && self.media_root().join(file_name).exists()
    }

    fn write_media(&self, file_name: &str, bytes: &[u8]) -> Result<(), String> {
        if Self::is_ignored_sync_temp_name(file_name) {
            return Err("Nama berkas media tidak valid.".to_string());
        }
        fs::create_dir_all(self.media_root())
            .map_err(|e| format!("Gagal membuat folder media Sync Vault: {}", e))?;
        let dest = self.media_root().join(file_name);
        if dest.exists() {
            return Ok(());
        }
        let tmp = self
            .media_root()
            .join(format!(".tmp-{}-{}", rand::random::<u32>(), file_name));
        fs::write(&tmp, bytes).map_err(|e| format!("Gagal menulis media sementara: {}", e))?;
        if let Err(e) = fs::rename(&tmp, &dest) {
            let _ = fs::remove_file(&tmp);
            return Err(format!("Gagal memfinalisasi media Sync Vault: {}", e));
        }
        Ok(())
    }

    fn read_media(&self, file_name: &str) -> Result<Option<Vec<u8>>, String> {
        if Self::is_ignored_sync_temp_name(file_name) {
            return Ok(None);
        }
        let path = self.media_root().join(file_name);
        if !path.exists() {
            return Ok(None);
        }
        let bytes =
            fs::read(&path).map_err(|e| format!("Gagal membaca media dari Sync Vault: {}", e))?;
        Ok(Some(bytes))
    }
}
