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
