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

    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y").arg("-i").arg(&in_path);

    if has_audio {
        cmd.arg("-stream_loop")
            .arg("-1")
            .arg("-i")
            .arg(&audio_path)
            .arg("-c:v")
            .arg("copy")
            .arg("-c:a")
            .arg("aac")
            .arg("-map")
            .arg("0:v:0")
            .arg("-map")
            .arg("1:a:0?")
            .arg("-shortest")
            .arg("-movflags")
            .arg("+faststart")
            .arg(&out_path);
    } else {
        cmd.arg("-c")
            .arg("copy")
            .arg("-movflags")
            .arg("+faststart")
            .arg(&out_path);
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let status = match cmd.status() {
        Ok(s) => s,
        Err(e) => {
            log::warn!(
                "[video-remux] Gagal mengeksekusi ffmpeg: {}. Mengembalikan video rekaman asli sebagai fallback.",
                e
            );
            let _ = fs::remove_file(&in_path);
            let _ = fs::remove_file(&audio_path);
            return Ok(input_data);
        }
    };

    let result = if status.success() && out_path.exists() {
        match fs::read(&out_path) {
            Ok(bytes) => {
                log::info!(
                    "[video-remux] Remuxing MP4 +faststart sukses: {} bytes (audio: {})",
                    bytes.len(),
                    has_audio
                );
                bytes
            }
            Err(_) => input_data,
        }
    } else {
        log::warn!("[video-remux] FFmpeg exit code tidak sukses, mengembalikan video rekaman asli.");
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
