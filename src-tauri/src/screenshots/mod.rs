use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotUploadPayload {
    pub file_name: String,
    pub data: Vec<u8>,
}

pub fn get_screenshot_dir(db_path: &Path) -> PathBuf {
    let dir = db_path.parent().unwrap_or(Path::new(".")).join("screenshots");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir
}

pub fn read_screenshot_data_url(db_path: &Path, rel_path: &str) -> Result<String, String> {
    let clean_name = Path::new(rel_path)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Nama file screenshot tidak valid.".to_string())?;

    // Cek folder media content-addressed terlebih dahulu, lalu fallback ke folder screenshots/ legacy
    let media_candidate = crate::media::get_media_dir(db_path).join(clean_name);
    let full_path = if media_candidate.exists() {
        media_candidate
    } else {
        get_screenshot_dir(db_path).join(clean_name)
    };

    if !full_path.exists() {
        return Err(format!("File screenshot '{}' tidak ditemukan.", clean_name));
    }

    let bytes = fs::read(&full_path)
        .map_err(|e| format!("Gagal membaca file screenshot: {}", e))?;

    let ext = Path::new(clean_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();

    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "application/octet-stream",
    };

    let encoded = BASE64.encode(bytes);
    Ok(format!("data:{};base64,{}", mime, encoded))
}

pub fn delete_screenshot(db_path: &Path, rel_path: &str) {
    if let Some(clean_name) = Path::new(rel_path).file_name() {
        let full_path = get_screenshot_dir(db_path).join(clean_name);
        if full_path.exists() {
            let _ = fs::remove_file(full_path);
        }
    }
}
