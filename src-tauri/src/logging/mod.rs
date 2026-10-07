use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub message: String,
    pub details: Option<String>,
    pub raw: String,
}

static LOG_MUTEX: Mutex<()> = Mutex::new(());

pub fn get_log_dir() -> PathBuf {
    let base = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("nitirekso")
        .join("logs");

    if !base.exists() {
        let _ = fs::create_dir_all(&base);
    }
    base
}

pub fn get_log_file_path() -> PathBuf {
    get_log_dir().join("app.log")
}

pub fn append_log(level: &str, message: &str) {
    let _guard = LOG_MUTEX.lock().unwrap();
    let now = chrono_free_timestamp();
    let line = format!("[{}] [{}] {}\n", now, level, message);

    let path = get_log_file_path();
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = file.write_all(line.as_bytes());
    }
}

fn chrono_free_timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    let millis = now.subsec_millis();

    let days = secs / 86400;
    let z = days + 719468;
    let era = z / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64) + (era as i64) * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let final_y = if m <= 2 { y + 1 } else { y };

    let rem_secs = secs % 86400;
    let hours = rem_secs / 3600;
    let mins = (rem_secs % 3600) / 60;
    let s = rem_secs % 60;

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        final_y, m, d, hours, mins, s, millis
    )
}

pub fn read_logs(limit: Option<usize>) -> Vec<LogEntry> {
    let _guard = LOG_MUTEX.lock().unwrap();
    let path = get_log_file_path();
    if !path.exists() {
        return Vec::new();
    }

    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    let mut entries: Vec<LogEntry> = Vec::new();
    let max_count = limit.unwrap_or(500);

    for line in content.lines().rev() {
        if line.trim().is_empty() {
            continue;
        }

        // Contoh format: [2026-10-07T14:30:00.000Z] [INFO] message
        if line.starts_with('[') {
            if let Some(close_ts) = line.find(']') {
                let ts = &line[1..close_ts];
                let rest = line[close_ts + 1..].trim_start();
                if rest.starts_with('[') {
                    if let Some(close_lvl) = rest.find(']') {
                        let lvl = &rest[1..close_lvl];
                        let msg = rest[close_lvl + 1..].trim_start();

                        entries.push(LogEntry {
                            timestamp: ts.to_string(),
                            level: lvl.to_string(),
                            message: msg.to_string(),
                            details: None,
                            raw: line.to_string(),
                        });

                        if entries.len() >= max_count {
                            break;
                        }
                        continue;
                    }
                }
            }
        }

        // Baris tanpa header baku dimasukkan sebagai raw/info
        entries.push(LogEntry {
            timestamp: "".to_string(),
            level: "INFO".to_string(),
            message: line.to_string(),
            details: None,
            raw: line.to_string(),
        });

        if entries.len() >= max_count {
            break;
        }
    }

    // Urutkan kembali kronologis
    entries.reverse();
    entries
}

pub fn clear_logs() -> Result<(), String> {
    let _guard = LOG_MUTEX.lock().unwrap();
    let path = get_log_file_path();
    if path.exists() {
        fs::write(&path, b"").map_err(|e| format!("Gagal mengosongkan file log: {}", e))?;
    }
    Ok(())
}

pub fn open_log_folder() -> Result<(), String> {
    let dir = get_log_dir();
    opener::open(&dir).map_err(|e| format!("Gagal membuka folder log: {}", e))?;
    Ok(())
}
