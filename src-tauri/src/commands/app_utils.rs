use crate::app_utils::{
    check_for_updates as check_updates, get_btc_klines as fetch_btc_klines,
    open_external_url as open_url, AppUpdateInfo, BtcKlinePoint, BtcKlinesPayload,
};
use crate::models::MutationResult;
use crate::updater::{
    detect_install_environment as detect_env,
    download_and_verify_linux_package as download_linux_pkg,
    fetch_latest_release_metadata as fetch_release_meta,
    install_linux_package_and_relaunch as install_linux_pkg,
    open_local_installer_fallback as open_installer_fallback,
    InstallEnvironment, InstallKind, LinuxDownloadVerificationResult, LinuxInstallResult,
    ReleaseMetadataResult,
};

#[tauri::command]
pub fn open_external_url(url: String) -> MutationResult<()> {
    match open_url(&url) {
        Ok(_) => MutationResult::ok_unit(),
        Err(e) => MutationResult::fail(e),
    }
}

#[tauri::command]
pub fn get_app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub async fn check_for_updates(app: tauri::AppHandle) -> MutationResult<AppUpdateInfo> {
    let current_version = app.package_info().version.to_string();
    match check_updates(&current_version).await {
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

#[tauri::command]
pub fn detect_install_environment() -> InstallEnvironment {
    detect_env()
}

#[tauri::command]
pub async fn fetch_release_update_metadata(
    app: tauri::AppHandle,
    etag: Option<String>,
) -> MutationResult<ReleaseMetadataResult> {
    let current_version = app.package_info().version.to_string();
    match fetch_release_meta(&current_version, etag.as_deref()).await {
        Ok(meta) => MutationResult::success(meta),
        Err(e) => MutationResult::fail(e),
    }
}

#[tauri::command]
pub async fn download_and_verify_linux_package(
    app: tauri::AppHandle,
    asset_url: String,
    asset_name: String,
    expected_version: String,
) -> MutationResult<LinuxDownloadVerificationResult> {
    match download_linux_pkg(&app, &asset_url, &asset_name, &expected_version).await {
        Ok(res) => MutationResult::success(res),
        Err(e) => MutationResult::fail(e),
    }
}

#[tauri::command]
pub async fn install_linux_package_and_relaunch(
    app: tauri::AppHandle,
    local_path: String,
    install_kind: InstallKind,
) -> MutationResult<LinuxInstallResult> {
    // Eksekusi proses blocking pkexec di thread pool async agar tidak menahan thread UI Tauri
    let res = tokio::task::spawn_blocking(move || {
        install_linux_pkg(&app, &local_path, install_kind)
    })
    .await;

    match res {
        Ok(Ok(install_res)) => MutationResult::success(install_res),
        Ok(Err(e)) => MutationResult::fail(e),
        Err(e) => MutationResult::fail(format!("Gagal menjalankan task instalasi: {}", e)),
    }
}

#[tauri::command]
pub fn open_local_installer_fallback(local_path: String) -> MutationResult<LinuxInstallResult> {
    match open_installer_fallback(&local_path) {
        Ok(res) => MutationResult::success(res),
        Err(e) => MutationResult::fail(e),
    }
}
