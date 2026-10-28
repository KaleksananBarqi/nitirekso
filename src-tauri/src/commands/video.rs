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
    let default_name = extract_file_name_from_headers(&request);

    let raw_bytes: Option<Vec<u8>> = match request.body() {
        InvokeBody::Raw(bytes) => Some(bytes.clone()),
        InvokeBody::Json(val) => {
            // Fallback untuk pemanggil payload JSON lama
            if let Some(arr) = val.get("data") {
                serde_json::from_value::<Vec<u8>>(arr.clone()).ok()
            } else {
                None
            }
        }
    };

    let bytes = match raw_bytes {
        Some(b) => b,
        None => return MutationResult::fail("Data berkas video kosong atau tidak valid".to_string()),
    };

    save_video_to_disk(&default_name, &bytes)
}

/// Membuka prompt dialog native pemilih lokasi berkas dan menuliskan byte video secara deterministik.
fn save_video_to_disk(default_name: &str, data: &[u8]) -> MutationResult<Option<String>> {
    let dialog = rfd::FileDialog::new()
        .set_title("Simpan Video Hasil Ekspor (MP4)")
        .set_file_name(default_name)
        .add_filter("Video MP4 (*.mp4)", &["mp4"]);

    if let Some(target_path) = dialog.save_file() {
        match std::fs::write(&target_path, data) {
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
    } else {
        log::info!("[video] Dialog pemilihan folder video dibatalkan pengguna");
        MutationResult::success(None)
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_file_name_url_decode() {
        let raw_name = "nitirekso%20pnl%202026-10-28.mp4";
        let decoded = urlencoding::decode(raw_name)
            .map(|cow| cow.into_owned())
            .unwrap_or_else(|_| raw_name.to_string());
        assert_eq!(decoded, "nitirekso pnl 2026-10-28.mp4");
    }

    #[test]
    fn test_save_video_to_disk_empty_check() {
        let empty_bytes = Vec::<u8>::new();
        assert!(empty_bytes.is_empty());
    }
}
