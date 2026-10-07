use crate::db::DbState;
use crate::models::MutationResult;
use crate::screenshots::{
    read_screenshot_data_url, save_screenshot, ScreenshotUploadPayload,
};
use tauri::State;

#[tauri::command]
pub fn upload_screenshot(
    db: State<'_, DbState>,
    payload: ScreenshotUploadPayload,
) -> MutationResult<String> {
    match save_screenshot(&db.db_path, &payload) {
        Ok(filename) => MutationResult::success(filename),
        Err(e) => MutationResult::fail(e),
    }
}

#[tauri::command]
pub fn get_screenshot(db: State<'_, DbState>, rel_path: String) -> MutationResult<String> {
    match read_screenshot_data_url(&db.db_path, &rel_path) {
        Ok(data_url) => MutationResult::success(data_url),
        Err(e) => MutationResult::fail(e),
    }
}
