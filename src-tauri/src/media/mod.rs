use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const MAX_SCREENSHOT_BYTES: usize = 5 * 1024 * 1024; // 5 MB
pub const MAX_SHARE_MEDIA_BYTES: usize = 15 * 1024 * 1024; // 15 MB

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaUploadPayload {
    pub kind: String, // "screenshot" | "share_media" | "exchange_logo"
    pub file_name: String,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaAssetInfo {
    pub sha256: String,
    pub kind: String,
    pub ext: String,
    pub mime: String,
    pub size_bytes: usize,
}

#[derive(Debug, Clone)]
pub struct StoredMediaRecord {
    pub sha256: String,
    pub kind: String,
    pub ext: String,
    pub mime: String,
    pub size_bytes: i64,
    pub original_name: Option<String>,
    pub created_at: i64,
    pub deleted_at: Option<i64>,
}

pub fn get_media_dir(db_path: &Path) -> PathBuf {
    let dir = db_path.parent().unwrap_or(Path::new(".")).join("media");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir
}

pub fn max_bytes_for_kind(kind: &str) -> usize {
    match kind {
        "screenshot" => MAX_SCREENSHOT_BYTES,
        "share_media" | "exchange_logo" => MAX_SHARE_MEDIA_BYTES,
        _ => MAX_SCREENSHOT_BYTES,
    }
}

pub fn validate_media_payload(kind: &str, ext: &str, data: &[u8]) -> Result<&'static str, String> {
    if !matches!(kind, "screenshot" | "share_media" | "exchange_logo") {
        return Err(format!("Jenis media tidak didukung: {}", kind));
    }
    if data.is_empty() {
        return Err("Data media kosong.".to_string());
    }
    let limit = max_bytes_for_kind(kind);
    if data.len() > limit {
        return Err(format!(
            "Ukuran media melebihi batas maksimal {} MB.",
            limit / (1024 * 1024)
        ));
    }

    match ext {
        "png" if data.len() >= 4 && data[0..4] == [0x89, 0x50, 0x4e, 0x47] => Ok("image/png"),
        "jpg" | "jpeg" if data.len() >= 2 && data[0..2] == [0xff, 0xd8] => Ok("image/jpeg"),
        "webp" if data.len() >= 4 && data[0..4] == [0x52, 0x49, 0x46, 0x46] => Ok("image/webp"),
        "gif" if data.len() >= 3 && data[0..3] == [0x47, 0x49, 0x46] => Ok("image/gif"),
        "svg" if kind != "screenshot" => {
            let text = String::from_utf8_lossy(data).to_lowercase();
            if text.contains("<svg") && !text.contains("<script") {
                Ok("image/svg+xml")
            } else {
                Err("File SVG tidak valid atau mengandung elemen terlarang.".to_string())
            }
        }
        "mp4" if kind == "share_media" && data.len() >= 8 && &data[4..8] == b"ftyp" => {
            Ok("video/mp4")
        }
        "webm"
            if kind == "share_media"
                && data.len() >= 4
                && data[0..4] == [0x1a, 0x45, 0xdf, 0xa3] =>
        {
            Ok("video/webm")
        }
        _ => Err("Format file media tidak valid atau tidak didukung.".to_string()),
    }
}

pub fn compute_sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

pub fn media_file_name(sha256: &str, ext: &str) -> String {
    format!("{}.{}", sha256, ext)
}

/// Menyimpan berkas media secara content-addressed ke `<data_dir>/media/<sha256>.<ext>` dan tabel `media_assets`.
pub fn save_media_asset(
    conn: &Connection,
    db_path: &Path,
    payload: &MediaUploadPayload,
) -> Result<MediaAssetInfo, String> {
    let ext = Path::new(&payload.file_name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .ok_or_else(|| "Ekstensi file media tidak valid.".to_string())?;

    let mime = validate_media_payload(&payload.kind, &ext, &payload.data)?;
    let sha256 = compute_sha256_hex(&payload.data);
    let fname = media_file_name(&sha256, &ext);
    let media_dir = get_media_dir(db_path);
    let target_path = media_dir.join(&fname);

    // Tulis atomik bila file content-addressed belum ada di disk
    if !target_path.exists() {
        let tmp_name = format!(".tmp-{}-{}", sha256, rand::random::<u32>());
        let tmp_path = media_dir.join(tmp_name);
        fs::write(&tmp_path, &payload.data)
            .map_err(|e| format!("Gagal menulis berkas media sementara: {}", e))?;
        if let Err(e) = fs::rename(&tmp_path, &target_path) {
            let _ = fs::remove_file(&tmp_path);
            return Err(format!("Gagal menyimpan berkas media: {}", e));
        }
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let size_bytes = payload.data.len();

    conn.execute(
        "INSERT INTO media_assets (sha256, kind, ext, mime, size_bytes, original_name, created_at, deleted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL)
         ON CONFLICT(sha256) DO UPDATE SET
           kind          = excluded.kind,
           ext           = excluded.ext,
           mime          = excluded.mime,
           size_bytes    = excluded.size_bytes,
           original_name = COALESCE(excluded.original_name, media_assets.original_name),
           deleted_at    = NULL",
        params![
            sha256,
            payload.kind,
            ext,
            mime,
            size_bytes as i64,
            payload.file_name,
            now
        ],
    )
    .map_err(|e| format!("Gagal mencatat metadata media ke database: {}", e))?;

    Ok(MediaAssetInfo {
        sha256,
        kind: payload.kind.clone(),
        ext,
        mime: mime.to_string(),
        size_bytes,
    })
}

pub fn get_media_record(conn: &Connection, sha256: &str) -> Option<StoredMediaRecord> {
    conn.query_row(
        "SELECT sha256, kind, ext, mime, size_bytes, original_name, created_at, deleted_at
         FROM media_assets WHERE sha256 = ?1",
        params![sha256],
        |row| {
            Ok(StoredMediaRecord {
                sha256: row.get(0)?,
                kind: row.get(1)?,
                ext: row.get(2)?,
                mime: row.get(3)?,
                size_bytes: row.get(4)?,
                original_name: row.get(5)?,
                created_at: row.get(6)?,
                deleted_at: row.get(7)?,
            })
        },
    )
    .ok()
}

pub fn read_media_data_url(
    conn: &Connection,
    db_path: &Path,
    sha256: &str,
) -> Result<String, String> {
    let clean_hash = sha256.trim();
    let rec = get_media_record(conn, clean_hash)
        .filter(|r| r.deleted_at.is_none())
        .ok_or_else(|| format!("Aset media '{}' tidak ditemukan.", clean_hash))?;

    let path = get_media_dir(db_path).join(media_file_name(&rec.sha256, &rec.ext));
    if !path.exists() {
        return Err(format!("Berkas media '{}' belum tersedia di perangkat ini.", clean_hash));
    }

    let bytes = fs::read(&path).map_err(|e| format!("Gagal membaca berkas media: {}", e))?;
    Ok(format!("data:{};base64,{}", rec.mime, BASE64.encode(bytes)))
}

pub fn read_media_bytes_for_sync(
    db_path: &Path,
    sha256: &str,
    ext: &str,
) -> Result<Option<Vec<u8>>, String> {
    let path = get_media_dir(db_path).join(media_file_name(sha256, ext));
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(&path).map_err(|e| format!("Gagal membaca media lokal: {}", e))?;
    Ok(Some(bytes))
}

pub fn write_synced_media_bytes(
    db_path: &Path,
    sha256: &str,
    ext: &str,
    bytes: &[u8],
) -> Result<(), String> {
    let dir = get_media_dir(db_path);
    let target = dir.join(media_file_name(sha256, ext));
    if target.exists() {
        return Ok(());
    }
    let tmp_path = dir.join(format!(".tmp-{}-{}", sha256, rand::random::<u32>()));
    fs::write(&tmp_path, bytes).map_err(|e| format!("Gagal menulis media hasil sync: {}", e))?;
    if let Err(e) = fs::rename(&tmp_path, &target) {
        let _ = fs::remove_file(&tmp_path);
        return Err(format!("Gagal memfinalisasi media hasil sync: {}", e));
    }
    Ok(())
}

pub fn soft_delete_media_asset(conn: &Connection, sha256: &str) -> Result<bool, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let affected = conn
        .execute(
            "UPDATE media_assets SET deleted_at = ?1 WHERE sha256 = ?2 AND deleted_at IS NULL",
            params![now, sha256.trim()],
        )
        .map_err(|e| format!("Gagal menghapus metadata media: {}", e))?;
    Ok(affected > 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_media_payload_limits_and_magic_bytes() {
        let png = vec![0x89, 0x50, 0x4e, 0x47, 0x00, 0x01];
        assert_eq!(
            validate_media_payload("screenshot", "png", &png).unwrap(),
            "image/png"
        );

        let too_big_ss = vec![0x89; MAX_SCREENSHOT_BYTES + 1];
        assert!(validate_media_payload("screenshot", "png", &too_big_ss).is_err());

        let too_big_share = vec![0x89; MAX_SHARE_MEDIA_BYTES + 1];
        assert!(validate_media_payload("share_media", "png", &too_big_share).is_err());

        let invalid_svg = b"<svg><script>alert(1)</script></svg>";
        assert!(validate_media_payload("exchange_logo", "svg", invalid_svg).is_err());
    }
}
