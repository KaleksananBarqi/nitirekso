use tauri::ipc::{InvokeBody, Request, Response};
use crate::models::MutationResult;
use crate::video::{parse_binary_envelope, remux_mp4_with_faststart};

/// Menguraikan nama berkas target dari header request IPC atau fallback jika tidak tersedia.
pub fn extract_file_name_from_headers(request: &Request<'_>) -> String {
    request
        .headers()
        .get("x-file-name")
        .and_then(|h| h.to_str().ok())
        .map(|s| {
            urlencoding::decode(s)
                .map(|cow| cow.into_owned())
                .unwrap_or_else(|_| s.to_string())
        })
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "export.mp4".to_string())
}

/// Handler IPC Tauri untuk remuxing berkas video MP4 secara native tanpa serialisasi JSON.
/// Menerima payload biner mentah melalui `tauri::ipc::Request` (InvokeBody::Raw).
/// Format payload biner terkompresi (envelope):
/// - 4 byte pertama: `u32` big-endian menandakan panjang trek audio (`audio_len`).
/// - `audio_len` byte berikutnya: data trek audio AAC opsional.
/// - Sisa byte hingga akhir: data video MP4 mentah.
///
/// Mengembalikan `Response` biner mentah yang diterima sebagai `ArrayBuffer` di sisi frontend.
#[tauri::command]
pub fn remux_video_mp4(request: Request<'_>) -> Result<Response, String> {
    match request.body() {
        InvokeBody::Raw(bytes) => {
            let (video_data, audio_data) = parse_binary_envelope(bytes.as_slice())?;
            let remuxed = remux_mp4_with_faststart(video_data, audio_data)?;
            Ok(Response::new(remuxed))
        }
        InvokeBody::Json(val) => {
            // Jalur kompatibilitas mundur jika dipanggil via payload JSON lama
            let data: Vec<u8> = serde_json::from_value(
                val.get("data").cloned().unwrap_or(serde_json::Value::Null),
            )
            .map_err(|e| format!("Gagal mem-parse parameter 'data': {}", e))?;

            let audio_data: Option<Vec<u8>> = val
                .get("audioData")
                .and_then(|v| serde_json::from_value(v.clone()).ok());

            let remuxed = remux_mp4_with_faststart(&data, audio_data.as_deref())?;
            Ok(Response::new(remuxed))
        }
    }
}

/// Handler IPC Tauri untuk menyimpan berkas video ke disk menggunakan native file dialog.
/// Mendukung payload biner mentah melalui `InvokeBody::Raw` tanpa konversi `number[]` JSON.
/// Nama berkas bawaan dikirimkan melalui header `x-file-name` (URL-encoded).
#[tauri::command]
pub fn save_video_file(request: Request<'_>) -> MutationResult<Option<String>> {
    let mut default_name = extract_file_name_from_headers(&request);

    match request.body() {
        InvokeBody::Raw(bytes) => {
            if bytes.is_empty() {
                return MutationResult::fail("Data berkas video kosong atau tidak valid".to_string());
            }
            save_video_to_disk(&default_name, bytes.as_slice())
        }
        InvokeBody::Json(val) => {
            // Jalur kompatibilitas mundur untuk pemanggil payload JSON lama
            if let Some(name) = val.get("defaultName").and_then(|v| v.as_str()) {
                if !name.trim().is_empty() {
                    default_name = name.to_string();
                }
            }
            let bytes: Vec<u8> = match val.get("data") {
                Some(arr) => match serde_json::from_value::<Vec<u8>>(arr.clone()) {
                    Ok(b) => b,
                    Err(e) => return MutationResult::fail(format!("Gagal mem-parse parameter 'data': {}", e)),
                },
                None => return MutationResult::fail("Data berkas video kosong atau tidak valid".to_string()),
            };
            if bytes.is_empty() {
                return MutationResult::fail("Data berkas video kosong atau tidak valid".to_string());
            }
            save_video_to_disk(&default_name, bytes.as_slice())
        }
    }
}

/// Menuliskan byte video ke path target spesifik.
pub fn write_video_to_path(target_path: &std::path::Path, data: &[u8]) -> MutationResult<Option<String>> {
    match std::fs::write(target_path, data) {
        Ok(_) => {
            let path_str = target_path.to_string_lossy().to_string();
            log::info!("[video] Berkas video berhasil disimpan ke: {}", path_str);
            MutationResult::success(Some(path_str))
        }
        Err(e) => {
            log::error!("[video] Gagal menyimpan video ke {:?}: {}", target_path, e);
            MutationResult::fail(format!("Gagal menulis berkas video: {}", e))
        }
    }
}

/// Membuka prompt dialog native pemilih lokasi berkas dan menuliskan byte video secara deterministik.
/// Jika `destination_or_name` berupa absolute path (misalnya pada pengujian otomatis),
/// berkas langsung ditulis ke path tersebut tanpa membuka modal UI dialog.
pub fn save_video_to_disk(destination_or_name: &str, data: &[u8]) -> MutationResult<Option<String>> {
    let dest_path = std::path::Path::new(destination_or_name);
    if dest_path.is_absolute() {
        return write_video_to_path(dest_path, data);
    }

    let dialog = rfd::FileDialog::new()
        .set_title("Simpan Video Hasil Ekspor (MP4)")
        .set_file_name(destination_or_name)
        .add_filter("Video MP4 (*.mp4)", &["mp4"]);

    if let Some(target_path) = dialog.save_file() {
        write_video_to_path(&target_path, data)
    } else {
        log::info!("[video] Dialog pemilihan folder video dibatalkan pengguna");
        MutationResult::success(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_file_name_url_decode() {
        let raw_name = "nitirekso%20pnl%202026-10-28.mp4";
        let decoded = urlencoding::decode(raw_name)
            .map(|cow| cow.into_owned())
            .unwrap_or_else(|_| raw_name.to_string());
        assert_eq!(decoded, "nitirekso pnl 2026-10-28.mp4");
    }

    #[test]
    fn test_save_video_to_disk_writes_to_temp_file_and_handles_error() {
        let temp_dir = std::env::temp_dir().join("nitirekso-video-save-test");
        let _ = std::fs::create_dir_all(&temp_dir);

        let target_file = temp_dir.join("saved-test-video.mp4");
        let test_bytes = b"mp4-video-authentic-test-bytes";

        // 1. Uji kasus sukses: simpan byte ke temp file melalui save_video_to_disk
        let res = save_video_to_disk(target_file.to_str().unwrap(), test_bytes);
        assert!(res.ok, "Penyimpanan video ke temp file harus berhasil: {:?}", res.error);
        assert_eq!(res.data, Some(Some(target_file.to_string_lossy().to_string())));

        // Verifikasi konten file di disk
        let saved_content = std::fs::read(&target_file).expect("File hasil simpan harus dapat dibaca");
        assert_eq!(saved_content, test_bytes, "Konten berkas harus persis dengan byte masukan");

        // 2. Uji penanganan error: simpan ke path yang mustahil/tidak dapat ditulis
        let invalid_target = if cfg!(windows) {
            "Z:\\forbidden-nonexistent-drive-path\\video.mp4"
        } else {
            "/proc/nonexistent-directory-forbidden/video.mp4"
        };
        let err_res = save_video_to_disk(invalid_target, test_bytes);
        assert!(!err_res.ok, "Penyimpanan ke path tidak valid harus gagal");
        assert!(err_res.error.is_some(), "Pesan error harus tersedia pada hasil kegagalan");

        // Bersihkan file sementara
        let _ = std::fs::remove_file(&target_file);
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
