use tauri::ipc::{InvokeBody, Request, Response};
use crate::models::MutationResult;
use crate::video::{parse_binary_envelope, remux_mp4_with_faststart_for_app};

/// Menguraikan nama berkas target dari header request IPC atau fallback jika tidak tersedia.
pub fn extract_file_name_from_headers(request: &Request<'_>) -> String {
    extract_header_str(request, "x-file-name").unwrap_or_else(|| "export.mp4".to_string())
}

fn extract_header_str(request: &Request<'_>, name: &str) -> Option<String> {
    request
        .headers()
        .get(name)
        .and_then(|h| h.to_str().ok())
        .map(|s| {
            urlencoding::decode(s)
                .map(|cow| cow.into_owned())
                .unwrap_or_else(|_| s.to_string())
        })
        .filter(|s| !s.trim().is_empty())
}

/// Mengekstrak byte mentah dari `InvokeBody::Raw` maupun `InvokeBody::Json(Value::Array)`.
/// Di Tauri v2 (khususnya WebKitGTK Linux & beberapa WebView saat memakai postMessage IPC),
/// `invoke(cmd, uint8Array, { headers })` dapat tiba sebagai `InvokeBody::Json(Array([255, 216, ...]))`
/// alih-alih `InvokeBody::Raw`. Helper ini menangani keduanya secara transparan.
pub fn extract_raw_or_json_array_bytes(body: &InvokeBody) -> Result<Vec<u8>, String> {
    match body {
        InvokeBody::Raw(bytes) => Ok(bytes.to_vec()),
        InvokeBody::Json(serde_json::Value::Array(arr)) => {
            let mut out = Vec::with_capacity(arr.len());
            for (idx, item) in arr.iter().enumerate() {
                let n = item
                    .as_u64()
                    .ok_or_else(|| format!("Byte tidak valid pada indeks {}", idx))?;
                if n > 255 {
                    return Err(format!("Nilai byte di luar rentang 0..255 pada indeks {}", idx));
                }
                out.push(n as u8);
            }
            Ok(out)
        }
        InvokeBody::Json(_) => Err("Payload biner mentah diperlukan.".to_string()),
    }
}

/// Handler IPC Tauri untuk remuxing berkas video MP4 secara native tanpa serialisasi JSON.
/// Menerima payload biner mentah melalui `tauri::ipc::Request` (InvokeBody::Raw atau JSON byte array).
/// Format payload biner terkompresi (envelope):
/// - 4 byte pertama: `u32` big-endian menandakan panjang trek audio (`audio_len`).
/// - `audio_len` byte berikutnya: data trek audio AAC opsional.
/// - Sisa byte hingga akhir: data video MP4 mentah.
///
/// Mengembalikan `Response` biner mentah yang diterima sebagai `ArrayBuffer` di sisi frontend.
#[tauri::command]
pub fn remux_video_mp4(app: tauri::AppHandle, request: Request<'_>) -> Result<Response, String> {
    match request.body() {
        InvokeBody::Raw(bytes) => {
            let (video_data, audio_data) = parse_binary_envelope(bytes.as_slice())?;
            let remuxed = remux_mp4_with_faststart_for_app(Some(&app), video_data, audio_data)?;
            Ok(Response::new(remuxed))
        }
        InvokeBody::Json(serde_json::Value::Array(_)) => {
            let bytes = extract_raw_or_json_array_bytes(request.body())?;
            let (video_data, audio_data) = parse_binary_envelope(&bytes)?;
            let remuxed = remux_mp4_with_faststart_for_app(Some(&app), video_data, audio_data)?;
            Ok(Response::new(remuxed))
        }
        InvokeBody::Json(val) => {
            // Jalur kompatibilitas mundur jika dipanggil via payload JSON objek lama
            let data: Vec<u8> = serde_json::from_value(
                val.get("data").cloned().unwrap_or(serde_json::Value::Null),
            )
            .map_err(|e| format!("Gagal mem-parse parameter 'data': {}", e))?;

            let audio_data: Option<Vec<u8>> = val
                .get("audioData")
                .and_then(|v| serde_json::from_value(v.clone()).ok());

            let remuxed =
                remux_mp4_with_faststart_for_app(Some(&app), &data, audio_data.as_deref())?;
            Ok(Response::new(remuxed))
        }
    }
}

/// Handler IPC Tauri untuk menyimpan berkas video ke disk menggunakan native file dialog (Desktop)
/// atau MediaStore Android (`Movies/nitirekso`).
#[tauri::command]
pub fn save_video_file(app: tauri::AppHandle, request: Request<'_>) -> MutationResult<Option<String>> {
    let mut default_name = extract_file_name_from_headers(&request);

    match request.body() {
        InvokeBody::Raw(bytes) => {
            if bytes.is_empty() {
                return MutationResult::fail("Data berkas video kosong atau tidak valid".to_string());
            }
            save_media_bytes_for_platform(Some(&app), &default_name, "video/mp4", bytes.as_slice())
        }
        InvokeBody::Json(serde_json::Value::Array(_)) => {
            let bytes = match extract_raw_or_json_array_bytes(request.body()) {
                Ok(b) => b,
                Err(e) => return MutationResult::fail(e),
            };
            if bytes.is_empty() {
                return MutationResult::fail("Data berkas video kosong atau tidak valid".to_string());
            }
            save_media_bytes_for_platform(Some(&app), &default_name, "video/mp4", &bytes)
        }
        InvokeBody::Json(val) => {
            // Jalur kompatibilitas mundur untuk pemanggil payload JSON objek lama
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
            save_media_bytes_for_platform(Some(&app), &default_name, "video/mp4", bytes.as_slice())
        }
    }
}

/// Handler IPC Tauri untuk menyimpan media ekspor apa pun (PNG, GIF, MP4, WebM) ke Galeri/Downloads Android
/// atau dialog native Desktop.
#[tauri::command]
pub fn save_media_export(app: tauri::AppHandle, request: Request<'_>) -> MutationResult<Option<String>> {
    let file_name = extract_file_name_from_headers(&request);
    let mime = extract_header_str(&request, "x-mime-type")
        .unwrap_or_else(|| infer_mime_from_filename(&file_name).to_string());

    let bytes = match extract_raw_or_json_array_bytes(request.body()) {
        Ok(b) => b,
        Err(e) => return MutationResult::fail(e),
    };
    if bytes.is_empty() {
        return MutationResult::fail("Data berkas media kosong".to_string());
    }
    save_media_bytes_for_platform(Some(&app), &file_name, &mime, &bytes)
}

/// Handler IPC Tauri untuk membagikan berkas media lewat Android Share Sheet (`Intent.ACTION_SEND`).
#[tauri::command]
pub fn share_media_export(app: tauri::AppHandle, request: Request<'_>) -> MutationResult<()> {
    let file_name = extract_file_name_from_headers(&request);
    let mime = extract_header_str(&request, "x-mime-type")
        .unwrap_or_else(|| infer_mime_from_filename(&file_name).to_string());
    let title = extract_header_str(&request, "x-title")
        .unwrap_or_else(|| "Bagikan dari nitirekso".to_string());

    let bytes = match extract_raw_or_json_array_bytes(request.body()) {
        Ok(b) => b,
        Err(e) => return MutationResult::fail(e),
    };
    if bytes.is_empty() {
        return MutationResult::fail("Data berkas media kosong".to_string());
    }

    #[cfg(target_os = "android")]
    {
        let share_dir = crate::app_paths::get_app_cache_dir().join("shared");
        let _ = std::fs::create_dir_all(&share_dir);
        let safe_name = std::path::Path::new(&file_name)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("share-export.bin");
        let target = share_dir.join(safe_name);
        if let Err(e) = std::fs::write(&target, bytes.as_slice()) {
            return MutationResult::fail(format!("Gagal menyiapkan berkas untuk dibagikan: {}", e));
        }
        match crate::android_bridge::share_file(&app, &target, &mime, &title) {
            Ok(_) => MutationResult::ok_unit(),
            Err(e) => MutationResult::fail(e),
        }
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, mime, title);
        match save_media_bytes_for_platform(None, &file_name, "application/octet-stream", bytes.as_slice()) {
            r if r.ok => MutationResult::ok_unit(),
            r => MutationResult::fail(r.error.unwrap_or_else(|| "Gagal menyimpan berkas.".to_string())),
        }
    }
}

fn infer_mime_from_filename(name: &str) -> &'static str {
    let lower = name.to_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".mp4") {
        "video/mp4"
    } else {
        "application/octet-stream"
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

fn save_media_bytes_for_platform(
    app: Option<&tauri::AppHandle>,
    destination_or_name: &str,
    mime: &str,
    data: &[u8],
) -> MutationResult<Option<String>> {
    let dest_path = std::path::Path::new(destination_or_name);
    if dest_path.is_absolute() {
        return write_video_to_path(dest_path, data);
    }

    #[cfg(target_os = "android")]
    {
        let Some(app_handle) = app else {
            return MutationResult::fail("AppHandle tidak tersedia untuk MediaStore.".to_string());
        };
        let temp_dir = crate::app_paths::get_app_cache_dir().join("media-export");
        let _ = std::fs::create_dir_all(&temp_dir);
        let safe_name = dest_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("nitirekso-export.bin");
        let temp_path = temp_dir.join(format!("{}-{}", rand::random::<u32>(), safe_name));
        if let Err(e) = std::fs::write(&temp_path, data) {
            return MutationResult::fail(format!("Gagal menulis berkas sementara: {}", e));
        }

        let collection = if mime.starts_with("video/") {
            "videos"
        } else if mime.starts_with("image/") {
            "images"
        } else {
            "downloads"
        };

        let res = crate::android_bridge::save_to_media_store(
            app_handle,
            &temp_path,
            safe_name,
            mime,
            collection,
        );
        let _ = std::fs::remove_file(&temp_path);
        match res {
            Ok(location) => MutationResult::success(Some(location)),
            Err(e) => MutationResult::fail(e),
        }
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let _ = app;
        let ext = dest_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("mp4");
        let title = if mime.starts_with("image/") {
            "Simpan Gambar Share Card"
        } else {
            "Simpan Video Hasil Ekspor (MP4)"
        };
        let dialog = rfd::FileDialog::new()
            .set_title(title)
            .set_file_name(destination_or_name)
            .add_filter(&format!("Berkas (*.{})", ext), &[ext]);

        if let Some(target_path) = dialog.save_file() {
            write_video_to_path(&target_path, data)
        } else {
            log::info!("[video] Dialog pemilihan lokasi ekspor dibatalkan pengguna");
            MutationResult::success(None)
        }
    }

    #[cfg(target_os = "ios")]
    {
        let _ = (app, mime);
        MutationResult::fail("Ekspor media belum didukung di iOS.".to_string())
    }
}

/// Membuka prompt dialog native pemilih lokasi berkas dan menuliskan byte video secara deterministik.
/// Jika `destination_or_name` berupa absolute path (misalnya pada pengujian otomatis),
/// berkas langsung ditulis ke path tersebut tanpa membuka modal UI dialog.
pub fn save_video_to_disk(destination_or_name: &str, data: &[u8]) -> MutationResult<Option<String>> {
    save_media_bytes_for_platform(None, destination_or_name, "video/mp4", data)
}

/// Menyalin gambar PNG/JPEG ke Clipboard sistem Android lewat FileProvider URI.
#[tauri::command]
pub fn copy_media_image(
    app: tauri::AppHandle,
    request: tauri::ipc::Request<'_>,
) -> MutationResult<()> {
    let raw_name = request
        .headers()
        .get("x-file-name")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("nitirekso-card.png");
    let file_name = urlencoding::decode(raw_name)
        .map(|cow| cow.into_owned())
        .unwrap_or_else(|_| raw_name.to_string());
    let mime = request
        .headers()
        .get("x-mime-type")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("image/png")
        .to_string();

    let data = match extract_raw_or_json_array_bytes(request.body()) {
        Ok(b) => b,
        Err(_) => {
            return MutationResult::fail(
                "Payload gambar harus dikirim sebagai binary Uint8Array".to_string(),
            );
        }
    };

    #[cfg(target_os = "android")]
    {
        let temp_dir = crate::app_paths::get_app_cache_dir().join("shared");
        let _ = std::fs::create_dir_all(&temp_dir);
        let safe_name = std::path::Path::new(&file_name)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("nitirekso-card.png");
        let temp_path = temp_dir.join(safe_name);
        if let Err(e) = std::fs::write(&temp_path, &data) {
            return MutationResult::fail(format!("Gagal menulis berkas gambar sementara: {}", e));
        }
        match crate::android_bridge::copy_image_to_clipboard(&app, &temp_path, &mime) {
            Ok(()) => MutationResult::success(()),
            Err(e) => MutationResult::fail(e),
        }
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, file_name, mime, data);
        MutationResult::fail("Gunakan Clipboard Web API pada platform desktop.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_raw_or_json_array_bytes_handles_webkitgtk_json_byte_array() {
        // Regresi bug WebKitGTK Linux: Uint8Array dikirim sebagai InvokeBody::Json(Array([255, 216, ...]))
        let jpeg_array = InvokeBody::Json(serde_json::json!([255, 216, 255, 224]));
        assert_eq!(
            extract_raw_or_json_array_bytes(&jpeg_array).unwrap(),
            vec![0xFF, 0xD8, 0xFF, 0xE0]
        );

        let raw_png = InvokeBody::Raw(vec![0x89, 0x50, 0x4E, 0x47]);
        assert_eq!(
            extract_raw_or_json_array_bytes(&raw_png).unwrap(),
            vec![0x89, 0x50, 0x4E, 0x47]
        );

        let invalid_obj = InvokeBody::Json(serde_json::json!({"not": "bytes"}));
        assert!(extract_raw_or_json_array_bytes(&invalid_obj).is_err());
    }

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
