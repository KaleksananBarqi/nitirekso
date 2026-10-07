use crate::app_utils::{
    check_for_updates as check_updates, get_btc_klines as fetch_btc_klines,
    open_external_url as open_url, AppUpdateInfo, BtcKlinePoint, BtcKlinesPayload,
    CURRENT_APP_VERSION,
};
use crate::models::MutationResult;

#[tauri::command]
pub fn open_external_url(url: String) -> MutationResult<()> {
    match open_url(&url) {
        Ok(_) => MutationResult::ok_unit(),
        Err(e) => MutationResult::fail(e),
    }
}

#[tauri::command]
pub fn get_app_version() -> String {
    CURRENT_APP_VERSION.to_string()
}

#[tauri::command]
pub async fn check_for_updates() -> MutationResult<AppUpdateInfo> {
    match check_updates().await {
        Ok(info) => MutationResult::success(info),
        Err(e) => MutationResult::fail(e),
    }
}

#[tauri::command]
pub async fn get_btc_klines(payload: BtcKlinesPayload) -> MutationResult<Vec<BtcKlinePoint>> {
    match fetch_btc_klines(payload).await {
        Ok(points) => MutationResult::success(points),
        Err(e) => MutationResult::fail(e),
    }
}
