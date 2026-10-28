use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

/// Penjaga pembersihan berkas sementara berbasis RAII (Resource Acquisition Is Initialization).
/// Memastikan seluruh berkas sementara yang didaftarkan terhapus secara deterministik dari disk
/// saat keluar dari cakupan fungsi, baik pada alur sukses, kegagalan eksekusi, maupun early return.
#[derive(Debug, Default)]
pub struct TempFileGuard {
    paths: Vec<PathBuf>,
}

impl TempFileGuard {
    /// Membuat instance baru penjaga berkas sementara.
    pub fn new() -> Self {
        Self { paths: Vec::new() }
    }

    /// Mendaftarkan path berkas sementara untuk dipantau dan dihapus saat drop.
    pub fn track(&mut self, path: PathBuf) {
        self.paths.push(path);
    }

    /// Mengambil daftar path yang sedang dipantau (berguna untuk verifikasi pengujian).
    pub fn tracked_paths(&self) -> &[PathBuf] {
        &self.paths
    }
}

impl Drop for TempFileGuard {
    fn drop(&mut self) {
        for path in &self.paths {
            if path.exists() {
                if let Err(e) = fs::remove_file(path) {
                    log::warn!("[video-remux] Gagal menghapus berkas sementara {:?}: {}", path, e);
                }
            }
        }
    }
}

/// Mengurai payload biner berekstensi teroptimasi tanpa overhead JSON.
/// Format struktur biner:
/// - 4 byte pertama: `u32` big-endian menandakan panjang audio dalam byte (`audio_len`).
/// - `audio_len` byte berikutnya: byte data trek audio AAC opsional.
/// - Sisa byte hingga akhir: byte video MP4 mentah.
pub fn parse_binary_envelope(bytes: &[u8]) -> Result<(&[u8], Option<&[u8]>), String> {
    if bytes.len() < 4 {
        return Err("Payload biner video terlalu pendek: minimal 4 byte header diperlukan".to_string());
    }

    let audio_len = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize;
    let required_len = 4usize
        .checked_add(audio_len)
        .ok_or_else(|| "Payload biner video cacat: panjang audio melebihi batas aman memori".to_string())?;

    if bytes.len() < required_len {
        return Err("Payload biner video cacat: panjang audio melebihi ukuran payload".to_string());
    }

    let audio_data = if audio_len > 0 {
        Some(&bytes[4..required_len])
    } else {
        None
    };

    let video_data = &bytes[required_len..];
    Ok((video_data, audio_data))
}

/// Melakukan stream-copy remuxing lossless fMP4 menjadi Standard Linear MP4 (+faststart)
/// serta muxing latar belakang audio (jika ada) menggunakan FFmpeg.
///
/// Menggunakan slice referensi biner langsung (`&[u8]`) untuk menghindari kloning memori yang tidak perlu.
/// Menjamin kebersihan berkas sementara (`nitirekso-video`) dengan `TempFileGuard` RAII.
pub fn remux_mp4_with_faststart(
    input_data: &[u8],
    audio_data: Option<&[u8]>,
) -> Result<Vec<u8>, String> {
    let temp_dir = std::env::temp_dir().join("nitirekso-video");
    let _ = fs::create_dir_all(&temp_dir);

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let rand_id = rand::random::<u32>();

    let in_path = temp_dir.join(format!("raw-{}-{}.mp4", now, rand_id));
    let audio_path = temp_dir.join(format!("raw-audio-{}-{}.mp4", now, rand_id));
    let out_path = temp_dir.join(format!("faststart-{}-{}.mp4", now, rand_id));

    // Pasang guard RAII untuk menjamin seluruh berkas sementara terhapus pada akhir fungsi
    let mut guard = TempFileGuard::new();
    guard.track(in_path.clone());
    guard.track(audio_path.clone());
    guard.track(out_path.clone());

    fs::write(&in_path, input_data)
        .map_err(|e| format!("Gagal menulis berkas video sementara: {}", e))?;

    let has_audio = if let Some(a_data) = audio_data {
        if !a_data.is_empty() {
            let _ = fs::write(&audio_path, a_data);
            true
        } else {
            false
        }
    } else {
        false
    };

    let run_ffmpeg = |args: &[&str]| -> bool {
        let mut cmd = Command::new("ffmpeg");
        cmd.arg("-y");
        for a in args {
            cmd.arg(a);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        match cmd.status() {
            Ok(s) => s.success() && out_path.exists(),
            Err(_) => false,
        }
    };

    let in_str = in_path.to_string_lossy().to_string();
    let audio_str = audio_path.to_string_lossy().to_string();
    let out_str = out_path.to_string_lossy().to_string();

    let mut success = false;

    // Strategi 1: Jika ada audio, coba remux video stream-copy dengan audio AAC
    if has_audio {
        let args_with_audio = [
            "-i", &in_str,
            "-stream_loop", "-1",
            "-i", &audio_str,
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "192k",
            "-map", "0:v:0",
            "-map", "1:a:0?",
            "-shortest",
            "-movflags", "+faststart",
            &out_str
        ];
        if run_ffmpeg(&args_with_audio) {
            success = true;
            log::info!("[video-remux] Sukses remuxing dengan audio loop");
        }
    }

    // Strategi 2: Stream-copy murni lossless (+faststart)
    if !success {
        let args_copy = [
            "-i", &in_str,
            "-c", "copy",
            "-movflags", "+faststart",
            &out_str
        ];
        if run_ffmpeg(&args_copy) {
            success = true;
            log::info!("[video-remux] Sukses remuxing stream-copy lossless");
        }
    }

    // Strategi 3: Transcode aman ke H.264 YUV420p standar universal (untuk kompatibilitas 100% player Windows)
    if !success {
        log::warn!("[video-remux] Stream copy ditolak, mencoba transcode libx264 YUV420p standar...");
        let args_transcode = [
            "-i", &in_str,
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "18",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            &out_str
        ];
        if run_ffmpeg(&args_transcode) {
            success = true;
            log::info!("[video-remux] Sukses transcode H.264 universal YUV420p");
        }
    }

    let result = if success && out_path.exists() {
        match fs::read(&out_path) {
            Ok(bytes) => {
                log::info!(
                    "[video-remux] File video final siap: {} bytes",
                    bytes.len()
                );
                bytes
            }
            Err(_) => input_data.to_vec(),
        }
    } else {
        log::warn!("[video-remux] FFmpeg tidak tersedia atau gagal, menggunakan rekaman asli.");
        input_data.to_vec()
    };

    // Seluruh berkas sementara dalam guard akan otomatis terhapus saat guard didrop di sini
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_remux_fallback_on_corrupt_data_and_cleans_tempfiles() {
        let dummy = vec![0u8, 1, 2, 3];
        let res = remux_mp4_with_faststart(&dummy, None);
        assert!(res.is_ok());

        // Jika ffmpeg gagal karena file bukan video, fungsi mengembalikan byte masukan secara aman
        let out = res.unwrap();
        assert_eq!(out, dummy);

        // Verifikasi tidak ada berkas sementara tersisa di nitirekso-video dari panggilan ini
        let temp_dir = std::env::temp_dir().join("nitirekso-video");
        if temp_dir.exists() {
            // Semua berkas raw-* yang dibuat harus sudah bersih
            let entries = fs::read_dir(&temp_dir).unwrap();
            let mut lingering = 0;
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("raw-") || name.starts_with("faststart-") {
                    lingering += 1;
                }
            }
            assert_eq!(lingering, 0, "Ditemukan berkas sementara yang tidak terhapus!");
        }
    }

    #[test]
    fn test_temp_file_guard_deletes_files_on_drop() {
        let temp_dir = std::env::temp_dir().join("nitirekso-video-guard-test");
        let _ = fs::create_dir_all(&temp_dir);

        let test_file = temp_dir.join("temp-file-to-clean.txt");
        fs::write(&test_file, b"sample temp content").unwrap();
        assert!(test_file.exists());

        {
            let mut guard = TempFileGuard::new();
            guard.track(test_file.clone());
            assert_eq!(guard.tracked_paths().len(), 1);
            // Keluar dari blok ini akan memicu drop pada guard
        }

        // Pastikan berkas terhapus secara otomatis
        assert!(!test_file.exists(), "Berkas sementara harus terhapus setelah guard didrop!");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_parse_binary_envelope_without_audio() {
        let mut payload = Vec::new();
        // audio_len = 0 (4 bytes big-endian: 0, 0, 0, 0)
        payload.extend_from_slice(&0u32.to_be_bytes());
        let sample_video = b"mp4-video-raw-stream-content";
        payload.extend_from_slice(sample_video);

        let parsed = parse_binary_envelope(&payload);
        assert!(parsed.is_ok());

        let (video, audio) = parsed.unwrap();
        assert_eq!(video, sample_video);
        assert!(audio.is_none());
    }

    #[test]
    fn test_parse_binary_envelope_with_audio() {
        let sample_audio = b"aac-audio-track-stream";
        let sample_video = b"mp4-video-raw-stream-content";

        let mut payload = Vec::new();
        // audio_len = sample_audio.len()
        payload.extend_from_slice(&(sample_audio.len() as u32).to_be_bytes());
        payload.extend_from_slice(sample_audio);
        payload.extend_from_slice(sample_video);

        let parsed = parse_binary_envelope(&payload);
        assert!(parsed.is_ok());

        let (video, audio) = parsed.unwrap();
        assert_eq!(video, sample_video);
        assert!(audio.is_some());
        assert_eq!(audio.unwrap(), sample_audio);
    }

    #[test]
    fn test_parse_binary_envelope_too_short() {
        let short_payload = vec![0u8, 1, 2];
        let parsed = parse_binary_envelope(&short_payload);
        assert!(parsed.is_err());
        assert!(parsed.unwrap_err().contains("terlalu pendek"));
    }

    #[test]
    fn test_temp_file_guard_default() {
        let guard = TempFileGuard::default();
        assert!(guard.tracked_paths().is_empty());
    }

    #[test]
    fn test_parse_binary_envelope_corrupted_length() {
        let mut payload = Vec::new();
        // audio_len = 500, tetapi payload hanya memiliki 5 byte
        payload.extend_from_slice(&500u32.to_be_bytes());
        payload.extend_from_slice(b"short");

        let parsed = parse_binary_envelope(&payload);
        assert!(parsed.is_err());
        assert!(parsed.unwrap_err().contains("melebihi ukuran payload"));
    }

    #[test]
    fn test_parse_binary_envelope_integer_overflow_or_excessive() {
        let mut payload = Vec::new();
        // audio_len maksimal (u32::MAX)
        payload.extend_from_slice(&u32::MAX.to_be_bytes());
        payload.extend_from_slice(b"small-data");

        let parsed = parse_binary_envelope(&payload);
        assert!(parsed.is_err());
    }
}
