use crate::models::MutationResult;
use crate::video::remux_mp4_with_faststart;

#[tauri::command]
pub fn remux_video_mp4(
    data: Vec<u8>,
    audio_data: Option<Vec<u8>>,
) -> MutationResult<Vec<u8>> {
    match remux_mp4_with_faststart(data, audio_data) {
        Ok(remuxed) => MutationResult::success(remuxed),
        Err(e) => MutationResult::fail(e),
    }
}

/// Buka prompt native dialog (rfd) untuk memilih lokasi penyimpanan berkas video MP4.
#[tauri::command]
pub fn save_video_file(
    default_name: String,
    data: Vec<u8>,
) -> MutationResult<Option<String>> {
    let dialog = rfd::FileDialog::new()
        .set_title("Simpan Video Hasil Ekspor (MP4)")
        .set_file_name(&default_name)
        .add_filter("Video MP4 (*.mp4)", &["mp4"]);

    if let Some(target_path) = dialog.save_file() {
        match std::fs::write(&target_path, &data) {
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
