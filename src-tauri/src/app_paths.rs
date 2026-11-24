use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::Manager;

/// Penyimpanan terpusat direktori data internal aplikasi agar Desktop dan Android
/// sama-sama menggunakan `app.path().app_data_dir()`, sambil tetap menjaga
/// kompatibilitas mundur lokasi lama di Desktop (`dirs::data_dir()/nitirekso`).
static APP_DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn init_app_data_dir(app: &tauri::AppHandle) {
    let resolved = resolve_runtime_data_dir(app);
    let _ = std::fs::create_dir_all(&resolved);
    let _ = APP_DATA_DIR.set(resolved);
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn resolve_runtime_data_dir(app: &tauri::AppHandle) -> PathBuf {
    if let Some(appdata) = dirs::data_dir() {
        return appdata.join("nitirekso");
    }
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}

#[cfg(any(target_os = "android", target_os = "ios"))]
fn resolve_runtime_data_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("nitirekso"))
}

pub fn get_app_data_dir() -> PathBuf {
    if let Some(dir) = APP_DATA_DIR.get() {
        return dir.clone();
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    if let Some(appdata) = dirs::data_dir() {
        return appdata.join("nitirekso");
    }

    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        std::env::temp_dir().join("nitirekso")
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        PathBuf::from(".")
    }
}

pub fn get_app_cache_dir() -> PathBuf {
    let dir = get_app_data_dir().join("cache");
    let _ = std::fs::create_dir_all(&dir);
    dir
}
