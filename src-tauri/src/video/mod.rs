use std::fs;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

/// Melakukan stream-copy remuxing lossless fMP4 menjadi Standard Linear MP4 (+faststart)
/// serta muxing latar belakang audio (jika ada) menggunakan FFmpeg.
pub fn remux_mp4_with_faststart(
    input_data: Vec<u8>,
    audio_data: Option<Vec<u8>>,
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

    fs::write(&in_path, &input_data)
        .map_err(|e| format!("Gagal menulis berkas video sementara: {}", e))?;

    let has_audio = if let Some(ref a_data) = audio_data {
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
            Err(_) => input_data,
        }
    } else {
        log::warn!("[video-remux] FFmpeg tidak tersedia atau gagal, menggunakan rekaman asli.");
        input_data
    };

    // Bersihkan file sementara
    let _ = fs::remove_file(&in_path);
    let _ = fs::remove_file(&audio_path);
    let _ = fs::remove_file(&out_path);

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_remux_fallback_on_corrupt_data() {
        let dummy = vec![0u8, 1, 2, 3];
        let res = remux_mp4_with_faststart(dummy.clone(), None);
        assert!(res.is_ok());
        // Jika ffmpeg gagal karena file bukan video, ia mengembalikan dummy asli secara aman
        let out = res.unwrap();
        assert!(!out.is_empty());
    }
}
