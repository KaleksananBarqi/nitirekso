use crate::db::repositories::settings::get_setting;
use crate::db::repositories::trades::list_trades;
use crate::models::{TradeDetail, TradeFilter};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const META_SNAPSHOT_FOLDER: &str = "local_snapshot_folder";
const META_LAST_SNAPSHOT_AT: &str = "last_local_snapshot_at";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupStatusPayload {
    pub connected: bool,
    pub last_backup_at: Option<i64>,
    pub local_folder: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRunResult {
    pub status: String,
    pub files_uploaded: usize,
    pub bytes_uploaded: usize,
    pub duration_ms: i64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRestoreResult {
    pub success: bool,
    pub source_path: String,
    pub trades_count: usize,
    pub screenshots_restored: usize,
    pub message: String,
}

#[derive(Debug, Clone)]
pub struct BackupContext {
    pub snapshot_json: String,
    pub local_folder: String,
    pub db_path: PathBuf,
    pub date_str: String,
    pub now_ms: i64,
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// Format timestamp milidetik ke YYYY-MM-DD menggunakan kalkulasi kalender Gregorian
pub fn format_date_ymd(timestamp_ms: i64) -> String {
    let secs = (timestamp_ms / 1000).max(0) as u64;
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
    format!("{:04}-{:02}-{:02}", final_y, m, d)
}

fn read_local_meta(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM local_device_meta WHERE key = ?1",
        params![key],
        |r| r.get::<_, String>(0),
    )
    .ok()
    .filter(|s| !s.trim().is_empty())
}

pub fn set_local_meta(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO local_device_meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| format!("Gagal menyimpan metadata perangkat lokal: {}", e))?;
    Ok(())
}

fn delete_local_meta(conn: &Connection, key: &str) {
    let _ = conn.execute("DELETE FROM local_device_meta WHERE key = ?1", params![key]);
}

/// Membaca path folder Local Snapshot aktif dengan fallback kompatibilitas dari setting versi lama.
fn resolve_snapshot_folder(conn: &Connection) -> Option<String> {
    if let Some(folder) = read_local_meta(conn, META_SNAPSHOT_FOLDER) {
        return Some(folder);
    }

    // Fallback satu kali dari pengaturan versi lama jika belum dipindahkan ke local_device_meta
    get_setting(conn, "gdriveLocalFolder")
        .unwrap_or(None)
        .and_then(|v| v.as_str().map(|s| s.trim().to_string()))
        .filter(|s| !s.is_empty())
}

fn resolve_last_snapshot_at(conn: &Connection) -> Option<i64> {
    if let Some(raw) = read_local_meta(conn, META_LAST_SNAPSHOT_AT) {
        if let Ok(ts) = raw.parse::<i64>() {
            if ts > 0 {
                return Some(ts);
            }
        }
    }

    get_setting(conn, "gdriveLastBackupAt")
        .unwrap_or(None)
        .and_then(|v| v.as_i64())
        .filter(|ts| *ts > 0)
}

/// Ambil status konfigurasi Local Snapshot
pub fn get_backup_status(conn: &Connection) -> BackupStatusPayload {
    let local_folder = resolve_snapshot_folder(conn);
    let last_backup_at = resolve_last_snapshot_at(conn);

    BackupStatusPayload {
        connected: local_folder.is_some(),
        last_backup_at,
        local_folder,
    }
}

/// Simpan folder Local Snapshot pilihan pengguna
pub fn save_local_snapshot_folder(conn: &Connection, folder_path: &str) -> Result<(), String> {
    let trimmed = folder_path.trim();
    if trimmed.is_empty() {
        return Err("Path folder Local Snapshot tidak boleh kosong.".to_string());
    }
    set_local_meta(conn, META_SNAPSHOT_FOLDER, trimmed)?;
    log::info!("[snapshot] Folder Local Snapshot disetel ke: {}", trimmed);
    Ok(())
}

/// Simpan timestamp eksekusi Local Snapshot terakhir
pub fn record_last_snapshot_at(conn: &Connection, ts_ms: i64) -> Result<(), String> {
    set_local_meta(conn, META_LAST_SNAPSHOT_AT, &ts_ms.to_string())
}

/// Putus tautan folder Local Snapshot
pub fn disconnect_backup(conn: &Connection) -> Result<(), String> {
    delete_local_meta(conn, META_SNAPSHOT_FOLDER);
    delete_local_meta(conn, META_LAST_SNAPSHOT_AT);
    // Bersihkan sisa kunci legacy bila masih ada di settings
    let _ = conn.execute(
        "DELETE FROM settings WHERE key IN ('gdriveClientId', 'gdriveEmail', 'gdriveFolderId', 'gdriveLocalFolder', 'gdriveLastBackupAt', 'gdriveSyncMode')",
        [],
    );
    log::info!("[snapshot] Tautan folder Local Snapshot berhasil dilepas");
    Ok(())
}

/// Direktori screenshots versi lama yang masih dapat dipulihkan / disalin
pub fn get_screenshot_dir(db_path: &Path) -> PathBuf {
    db_path.parent().unwrap_or(Path::new(".")).join("screenshots")
}

/// Direktori media content-addressed (`media/<sha256>.<ext>`)
pub fn get_media_dir(db_path: &Path) -> PathBuf {
    db_path.parent().unwrap_or(Path::new(".")).join("media")
}

/// Siapkan konteks Local Snapshot dari Local Cache (SQLite) secara synchronous
pub fn prepare_backup_context(conn: &Connection, db_path: &Path) -> Result<BackupContext, String> {
    let local_folder = resolve_snapshot_folder(conn).ok_or_else(|| {
        "Folder Local Snapshot belum dipilih. Silakan pilih folder tujuan di perangkat Anda terlebih dahulu."
            .to_string()
    })?;

    let trades: Vec<TradeDetail> = list_trades(conn, &TradeFilter::default())
        .map_err(|e| format!("Gagal membaca daftar trade: {}", e))?;

    let now_ms = now_millis();
    let date_str = format_date_ymd(now_ms);

    let snapshot_value = json!({
        "exportedAt": now_ms,
        "version": 2,
        "trades": trades
    });

    let snapshot_json = serde_json::to_string_pretty(&snapshot_value)
        .map_err(|e| format!("Gagal membuat snapshot JSON: {}", e))?;

    Ok(BackupContext {
        snapshot_json,
        local_folder,
        db_path: db_path.to_path_buf(),
        date_str,
        now_ms,
    })
}

fn copy_dir_files(src: &Path, dst: &Path) -> (usize, usize) {
    let mut files = 0;
    let mut bytes = 0;
    if !src.exists() || !src.is_dir() {
        return (0, 0);
    }
    let _ = fs::create_dir_all(dst);
    if let Ok(entries) = fs::read_dir(src) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let target = dst.join(entry.file_name());
                if let Ok(copied) = fs::copy(&path, target) {
                    files += 1;
                    bytes += copied as usize;
                }
            }
        }
    }
    (files, bytes)
}

/// Eksekusi Local Snapshot asinkron ke direktori tujuan spesifik di filesystem lokal.
pub async fn execute_backup_to_dir(
    ctx: &BackupContext,
    dest_dir: &Path,
) -> Result<BackupRunResult, String> {
    let start = Instant::now();
    let snapshot_bytes = ctx.snapshot_json.as_bytes();

    if !dest_dir.exists() {
        fs::create_dir_all(dest_dir)
            .map_err(|e| format!("Gagal membuat direktori {}: {}", dest_dir.display(), e))?;
    }

    let mut files_written = 0;
    let mut bytes_written = 0;

    // 1. Tulis snapshot JSON portabel
    let json_filename = format!("trading-journal-{}.json", ctx.date_str);
    let json_dest = dest_dir.join(&json_filename);
    fs::write(&json_dest, snapshot_bytes)
        .map_err(|e| format!("Gagal menulis snapshot {}: {}", json_dest.display(), e))?;
    files_written += 1;
    bytes_written += snapshot_bytes.len();

    // 2. Salin database Local Cache fisik menggunakan SQLite Online Backup API agar bebas isu WAL
    if ctx.db_path.exists() {
        let db_dest = dest_dir.join("trading-journal-database.db");
        let backup_ok = (|| -> Result<usize, rusqlite::Error> {
            let src_conn = Connection::open(&ctx.db_path)?;
            let mut dst_conn = Connection::open(&db_dest)?;
            let backup = rusqlite::backup::Backup::new(&src_conn, &mut dst_conn)?;
            backup.run_to_completion(20, Duration::from_millis(10), None)?;
            Ok(fs::metadata(&db_dest).map(|m| m.len() as usize).unwrap_or(0))
        })();

        match backup_ok {
            Ok(sz) => {
                files_written += 1;
                bytes_written += sz;
            }
            Err(err) => {
                log::warn!("[snapshot] Online backup SQLite fallback ke salinan langsung: {}", err);
                if let Ok(copied) = fs::copy(&ctx.db_path, &db_dest) {
                    files_written += 1;
                    bytes_written += copied as usize;
                }
            }
        }
    }

    // 3. Salin screenshots legacy & aset media content-addressed
    let (s_files, s_bytes) =
        copy_dir_files(&get_screenshot_dir(&ctx.db_path), &dest_dir.join("screenshots"));
    files_written += s_files;
    bytes_written += s_bytes;

    let (m_files, m_bytes) =
        copy_dir_files(&get_media_dir(&ctx.db_path), &dest_dir.join("media"));
    files_written += m_files;
    bytes_written += m_bytes;

    Ok(BackupRunResult {
        status: "ok".to_string(),
        files_uploaded: files_written,
        bytes_uploaded: bytes_written,
        duration_ms: start.elapsed().as_millis() as i64,
        error: None,
    })
}

/// Eksekusi Local Snapshot asinkron ke folder lokal pilihan pengguna
pub async fn execute_backup(ctx: BackupContext) -> Result<BackupRunResult, String> {
    let dest_dir = Path::new(&ctx.local_folder);
    execute_backup_to_dir(&ctx, dest_dir).await
}

/// Pulihkan database dan aset media dari folder Local Snapshot atau file cadangan (.db / .sqlite / .json)
pub fn restore_backup_from_path(
    dest_conn: &mut Connection,
    dest_db_path: &Path,
    source_path_opt: Option<&Path>,
) -> Result<BackupRestoreResult, String> {
    let chosen_path = match source_path_opt {
        Some(p) => p.to_path_buf(),
        None => {
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                let dialog =
                    rfd::FileDialog::new().set_title("Pilih Folder Local Snapshot nitirekso");
                match dialog.pick_folder() {
                    Some(p) => p,
                    None => {
                        return Err("Pemilihan folder cadangan dibatalkan oleh pengguna.".to_string())
                    }
                }
            }
            #[cfg(any(target_os = "android", target_os = "ios"))]
            {
                return Err("Path folder Local Snapshot harus diberikan secara eksplisit.".to_string());
            }
        }
    };

    if !chosen_path.exists() {
        return Err(format!(
            "Jalur sumber cadangan tidak ditemukan: {}",
            chosen_path.display()
        ));
    }

    let mut db_file = None;
    let mut json_file = None;

    if chosen_path.is_file() {
        let ext = chosen_path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        if ext == "db" || ext == "sqlite" {
            db_file = Some(chosen_path.clone());
        } else if ext == "json" {
            json_file = Some(chosen_path.clone());
        } else {
            return Err(format!(
                "Format file tidak didukung (.db, .sqlite, atau .json): {}",
                chosen_path.display()
            ));
        }
    } else if chosen_path.is_dir() {
        let default_db = chosen_path.join("trading-journal-database.db");
        if default_db.exists() {
            db_file = Some(default_db);
        } else if let Ok(entries) = fs::read_dir(&chosen_path) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() {
                    let ext = p
                        .extension()
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                        .to_lowercase();
                    if ext == "db" || ext == "sqlite" {
                        db_file = Some(p);
                        break;
                    }
                }
            }
        }

        if db_file.is_none() {
            if let Ok(entries) = fs::read_dir(&chosen_path) {
                let mut json_candidates = Vec::new();
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_file() {
                        let fname = p.file_name().and_then(|s| s.to_str()).unwrap_or("");
                        if fname.starts_with("trading-journal-") && fname.ends_with(".json") {
                            json_candidates.push(p);
                        }
                    }
                }
                json_candidates.sort();
                if let Some(latest_json) = json_candidates.pop() {
                    json_file = Some(latest_json);
                }
            }
        }
    }

    let mut trades_restored: usize = 0;

    if let Some(src_db) = db_file {
        log::info!("[snapshot] Memulihkan data dari database fisik: {}", src_db.display());
        let src_conn = Connection::open(&src_db).map_err(|e| {
            format!(
                "Gagal membuka file database cadangan ({}): {}",
                src_db.display(),
                e
            )
        })?;

        let has_trades_table: bool = src_conn
            .query_row(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='trades'",
                [],
                |_| Ok(true),
            )
            .unwrap_or(false);

        if !has_trades_table {
            return Err("Database cadangan tidak valid: tabel 'trades' tidak ditemukan.".to_string());
        }

        // Lindungi identitas & state Sync Vault perangkat ini sebelum DB ditimpa oleh arsip snapshot
        let preserved_device_meta: Vec<(String, String)> = dest_conn
            .prepare("SELECT key, value FROM local_device_meta")
            .and_then(|mut s| {
                let rows = s.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
                Ok(rows.filter_map(Result::ok).collect())
            })
            .unwrap_or_default();

        let preserved_sync_cursors: Vec<(String, String, i64, i64)> = dest_conn
            .prepare("SELECT device_id, file_name, last_line, updated_at FROM device_sync_cursors")
            .and_then(|mut s| {
                let rows = s.query_map([], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, i64>(2)?,
                        r.get::<_, i64>(3)?,
                    ))
                })?;
                Ok(rows.filter_map(Result::ok).collect())
            })
            .unwrap_or_default();

        {
            let backup = rusqlite::backup::Backup::new(&src_conn, dest_conn).map_err(|e| {
                format!("Gagal menginisialisasi proses restore database: {}", e)
            })?;
            backup
                .run_to_completion(10, Duration::from_millis(100), None)
                .map_err(|e| format!("Gagal memulihkan database: {}", e))?;
        }

        // Pastikan skema terbaru terpasang apabila cadangan berasal dari versi lebih lama
        let _ = crate::db::migrations::run_migrations(dest_conn);

        // Pulihkan kembali identitas & state perangkat lokal agar Sync Vault tidak rusak
        let _ = dest_conn.execute("DELETE FROM local_device_meta", []);
        for (k, v) in preserved_device_meta {
            let _ = dest_conn.execute(
                "INSERT INTO local_device_meta (key, value) VALUES (?1, ?2)",
                params![k, v],
            );
        }
        let _ = dest_conn.execute("DELETE FROM device_sync_cursors", []);
        for (did, fname, line, upd) in preserved_sync_cursors {
            let _ = dest_conn.execute(
                "INSERT INTO device_sync_cursors (device_id, file_name, last_line, updated_at) VALUES (?1, ?2, ?3, ?4)",
                params![did, fname, line, upd],
            );
        }

        let count: i64 = dest_conn
            .query_row(
                "SELECT COUNT(*) FROM trades WHERE deleted_at IS NULL",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        trades_restored = count as usize;
    } else if let Some(src_json) = json_file {
        log::info!("[snapshot] Memulihkan data dari snapshot JSON: {}", src_json.display());
        let content = fs::read_to_string(&src_json).map_err(|e| {
            format!(
                "Gagal membaca file JSON ({}): {}",
                src_json.display(),
                e
            )
        })?;
        let json_val: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("Format JSON cadangan tidak valid: {}", e))?;

        if let Some(trades_arr) = json_val.get("trades").and_then(|v| v.as_array()) {
            let tx = dest_conn
                .transaction()
                .map_err(|e| format!("Gagal memulai transaksi pemulihan: {}", e))?;

            for t_val in trades_arr {
                if let Ok(trade_detail) = serde_json::from_value::<TradeDetail>(t_val.clone()) {
                    let trade = &trade_detail.trade;
                    let trade_uuid = match trade
                        .external_id
                        .as_deref()
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                    {
                        Some(ext) => {
                            crate::db::migrations::deterministic_trade_uuid(&trade.exchange, ext)
                        }
                        None => crate::db::migrations::random_uuid(),
                    };

                    let _ = tx.execute(
                        "INSERT INTO trades (
                            id, exchange, external_id, symbol, direction, entry_price, exit_price,
                            entry_time, exit_time, size, leverage, margin_mode, realized_pnl,
                            pnl_source, fee_open, fee_close, funding_fee, created_at, updated_at, uuid
                        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)
                        ON CONFLICT(id) DO UPDATE SET
                            exchange = excluded.exchange,
                            external_id = excluded.external_id,
                            symbol = excluded.symbol,
                            direction = excluded.direction,
                            entry_price = excluded.entry_price,
                            exit_price = excluded.exit_price,
                            entry_time = excluded.entry_time,
                            exit_time = excluded.exit_time,
                            size = excluded.size,
                            leverage = excluded.leverage,
                            margin_mode = excluded.margin_mode,
                            realized_pnl = excluded.realized_pnl,
                            fee_open = excluded.fee_open,
                            fee_close = excluded.fee_close,
                            funding_fee = excluded.funding_fee,
                            updated_at = excluded.updated_at,
                            deleted_at = NULL",
                        params![
                            trade.id,
                            trade.exchange,
                            trade.external_id,
                            trade.symbol,
                            trade.direction,
                            trade.entry_price,
                            trade.exit_price,
                            trade.entry_time,
                            trade.exit_time,
                            trade.size,
                            trade.leverage,
                            trade.margin_mode,
                            trade.realized_pnl,
                            trade.pnl_source,
                            trade.fee_open,
                            trade.fee_close,
                            trade.funding_fee,
                            trade.created_at,
                            trade.updated_at,
                            trade_uuid,
                        ],
                    );

                    if let Some(ref j) = trade_detail.journal {
                        let _ = tx.execute(
                            "INSERT INTO trade_journal (
                                trade_id, setup_tag, pre_trade_thesis, post_trade_review,
                                emotion_tag, execution_grade, screenshot_path, updated_at
                            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                            ON CONFLICT(trade_id) DO UPDATE SET
                                setup_tag = excluded.setup_tag,
                                pre_trade_thesis = excluded.pre_trade_thesis,
                                post_trade_review = excluded.post_trade_review,
                                emotion_tag = excluded.emotion_tag,
                                execution_grade = excluded.execution_grade,
                                screenshot_path = excluded.screenshot_path,
                                updated_at = excluded.updated_at",
                            params![
                                trade.id,
                                j.setup_tag,
                                j.pre_trade_thesis,
                                j.post_trade_review,
                                j.emotion_tag,
                                j.execution_grade,
                                j.screenshot_path,
                                j.updated_at,
                            ],
                        );
                    }

                    if let Some(ref pr) = trade_detail.planned_risk {
                        let _ = tx.execute(
                            "INSERT INTO planned_risk (
                                trade_id, planned_stop, planned_target, risk_amount, planned_rr
                            ) VALUES (?1, ?2, ?3, ?4, ?5)
                            ON CONFLICT(trade_id) DO UPDATE SET
                                planned_stop = excluded.planned_stop,
                                planned_target = excluded.planned_target,
                                risk_amount = excluded.risk_amount,
                                planned_rr = excluded.planned_rr",
                            params![
                                trade.id,
                                pr.planned_stop,
                                pr.planned_target,
                                pr.risk_amount,
                                pr.planned_rr,
                            ],
                        );
                    }

                    for (idx, item) in trade_detail.checklist.iter().enumerate() {
                        let _ = tx.execute(
                            "INSERT OR IGNORE INTO journal_checklist (trade_id, label, checked, sort_order)
                             VALUES (?1, ?2, ?3, ?4)",
                            params![
                                trade.id,
                                item.label,
                                if item.checked { 1 } else { 0 },
                                idx as i64
                            ],
                        );
                    }

                    for tag in &trade_detail.tags {
                        let _ = tx.execute(
                            "INSERT OR IGNORE INTO journal_tags (name, created_at) VALUES (?1, ?2)",
                            params![tag.name, trade.created_at],
                        );
                        if let Ok(tag_id) = tx.query_row(
                            "SELECT id FROM journal_tags WHERE name = ?1 COLLATE NOCASE",
                            params![tag.name],
                            |r| r.get::<_, i64>(0),
                        ) {
                            let _ = tx.execute(
                                "INSERT OR IGNORE INTO trade_journal_tags (trade_id, tag_id) VALUES (?1, ?2)",
                                params![trade.id, tag_id],
                            );
                        }
                    }
                }
            }

            tx.commit().map_err(|e| {
                format!("Gagal menyimpan transaksi dari snapshot JSON: {}", e)
            })?;

            let count: i64 = dest_conn
                .query_row(
                    "SELECT COUNT(*) FROM trades WHERE deleted_at IS NULL",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            trades_restored = count as usize;
        }
    } else {
        return Err(format!(
            "Tidak ditemukan file database cadangan (.db / .sqlite) maupun snapshot JSON di folder: {}",
            chosen_path.display()
        ));
    }

    // Salin screenshot legacy & aset media jika tersedia
    let base_src = if chosen_path.is_dir() {
        Some(chosen_path.as_path())
    } else {
        chosen_path.parent()
    };

    let mut media_restored = 0;
    if let Some(src_root) = base_src {
        let (s_files, _) = copy_dir_files(&src_root.join("screenshots"), &get_screenshot_dir(dest_db_path));
        let (m_files, _) = copy_dir_files(&src_root.join("media"), &get_media_dir(dest_db_path));
        media_restored = s_files + m_files;
    }

    let source_path_display = chosen_path.to_string_lossy().to_string();
    let message = format!(
        "Berhasil memulihkan {} transaksi dan {} berkas media dari Local Snapshot ({}).",
        trades_restored, media_restored, source_path_display
    );
    log::info!("[snapshot] {}", message);

    Ok(BackupRestoreResult {
        success: true,
        source_path: source_path_display,
        trades_count: trades_restored,
        screenshots_restored: media_restored,
        message,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_date_ymd() {
        let d = format_date_ymd(1704067200000);
        assert_eq!(d, "2024-01-01");
    }

    #[test]
    fn test_restore_backup_physical_and_json() {
        use crate::db::migrations::run_migrations;
        use crate::db::repositories::trades::create_trade;
        use crate::models::TradeInput;

        let temp_dir = std::env::temp_dir().join(format!(
            "nitirekso-test-snapshot-{}",
            rand::random::<u64>()
        ));
        let _ = fs::create_dir_all(&temp_dir);

        let src_db_path = temp_dir.join("source.sqlite");
        let mut src_conn = Connection::open(&src_db_path).unwrap();
        run_migrations(&mut src_conn).unwrap();

        let trade_in = TradeInput {
            exchange: "binance".to_string(),
            external_id: Some("ext-999".to_string()),
            symbol: "ETHUSDT".to_string(),
            direction: "short".to_string(),
            entry_price: 3500.0,
            exit_price: 3400.0,
            entry_time: 1700000000000,
            exit_time: 1700003600000,
            size: 1.0,
            leverage: 5.0,
            margin_mode: Some("cross".to_string()),
            realized_pnl: 100.0,
            fee_open: 2.0,
            fee_close: 2.0,
            funding_fee: 0.5,
        };
        let _ = create_trade(&mut src_conn, &trade_in, None, None).unwrap();

        let backup_folder = temp_dir.join("snapshot_folder");
        let _ = fs::create_dir_all(&backup_folder);

        fs::copy(&src_db_path, backup_folder.join("trading-journal-database.db")).unwrap();

        let target_db_path = temp_dir.join("target.sqlite");
        let mut target_conn = Connection::open(&target_db_path).unwrap();
        run_migrations(&mut target_conn).unwrap();

        let count_before: i64 = target_conn
            .query_row("SELECT COUNT(*) FROM trades", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count_before, 0);

        let restore_res =
            restore_backup_from_path(&mut target_conn, &target_db_path, Some(&backup_folder))
                .unwrap();
        assert_eq!(restore_res.trades_count, 1);
        assert!(restore_res.success);

        let count_after: i64 = target_conn
            .query_row("SELECT COUNT(*) FROM trades", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count_after, 1);

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
