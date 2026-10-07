use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_BYTES: usize = 5 * 1024 * 1024; // 5 MB

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

fn validate_image(ext: &str, data: &[u8]) -> Result<(), String> {
    if data.is_empty() {
        return Err("Data gambar kosong.".to_string());
    }
    if data.len() > MAX_BYTES {
        return Err("Ukuran gambar melebihi batas maksimal 5 MB.".to_string());
    }

    let is_valid = match ext {
        "png" => data.len() >= 4 && data[0..4] == [0x89, 0x50, 0x4e, 0x47],
        "jpg" | "jpeg" => data.len() >= 2 && data[0..2] == [0xff, 0xd8],
        "webp" => data.len() >= 4 && data[0..4] == [0x52, 0x49, 0x46, 0x46],
        "gif" => data.len() >= 3 && data[0..3] == [0x47, 0x49, 0x46],
        _ => false,
    };

    if !is_valid {
        return Err("File harus berupa gambar valid (PNG, JPG, JPEG, WebP, atau GIF).".to_string());
    }

    Ok(())
}

pub fn save_screenshot(db_path: &Path, payload: &ScreenshotUploadPayload) -> Result<String, String> {
    let p = Path::new(&payload.file_name);
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .ok_or_else(|| "Ekstensi file tidak valid.".to_string())?;

    validate_image(&ext, &payload.data)?;

    let dir = get_screenshot_dir(db_path);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    let gen_name = format!("trade-{}.{}", now, ext);
    let target_path = dir.join(&gen_name);

    fs::write(&target_path, &payload.data)
        .map_err(|e| format!("Gagal menyimpan file screenshot: {}", e))?;

    log::info!("[screenshot] Screenshot disimpan ke: {}", target_path.display());
    Ok(gen_name)
}

pub fn read_screenshot_data_url(db_path: &Path, rel_path: &str) -> Result<String, String> {
    let clean_name = Path::new(rel_path)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Nama file screenshot tidak valid.".to_string())?;

    let full_path = get_screenshot_dir(db_path).join(clean_name);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_image_png() {
        let fake_png = vec![0x89, 0x50, 0x4e, 0x47, 0x00, 0x01];
        assert!(validate_image("png", &fake_png).is_ok());

        let invalid = vec![0x00, 0x00];
        assert!(validate_image("png", &invalid).is_err());
    }
}
