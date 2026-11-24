use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub const GITHUB_REPO: &str = "KaleksananBarqi/nitirekso";
pub const DOWNLOAD_PROGRESS_EVENT: &str = "updater:download-progress";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum InstallKind {
    Flatpak,
    AppImage,
    Rpm,
    Deb,
    WindowsNsis,
    WindowsMsi,
    MacOs,
    AndroidApk,
    Dev,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PackageManagerKind {
    Dnf,
    Zypper,
    Rpm,
    AptGet,
    None,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum InstallResultStatus {
    InstalledRelaunching,
    OpenedFallback,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallEnvironment {
    pub os: String,
    pub arch: String,
    pub install_kind: InstallKind,
    pub package_manager: PackageManagerKind,
    pub can_self_update: bool,
    pub store_managed: bool,
    pub is_dev: bool,
    pub executable_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseAssetInfo {
    pub name: String,
    pub download_url: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseMetadataResult {
    pub not_modified: bool,
    pub etag: Option<String>,
    pub source: String,
    pub latest_version: String,
    pub release_url: String,
    pub release_notes: Option<String>,
    pub published_at: Option<String>,
    pub assets: Vec<ReleaseAssetInfo>,
    pub rate_limit_reset_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDownloadProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub percent: f64,
    pub asset_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinuxDownloadVerificationResult {
    pub local_path: String,
    pub sha256: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinuxInstallResult {
    pub status: InstallResultStatus,
    pub message: String,
}

fn command_exists(name: &str) -> bool {
    Command::new("which")
        .arg(name)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn detect_rpm_package_manager() -> PackageManagerKind {
    if command_exists("dnf") {
        PackageManagerKind::Dnf
    } else if command_exists("zypper") {
        PackageManagerKind::Zypper
    } else if command_exists("rpm") {
        PackageManagerKind::Rpm
    } else {
        PackageManagerKind::None
    }
}

fn detect_deb_package_manager() -> PackageManagerKind {
    if command_exists("apt-get") {
        PackageManagerKind::AptGet
    } else {
        PackageManagerKind::None
    }
}

fn query_command_ok(cmd: &str, args: &[&str]) -> bool {
    Command::new(cmd)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Mendeteksi jenis instalasi runtime, arsitektur CPU, dan package manager yang tersedia.
pub fn detect_install_environment() -> InstallEnvironment {
    let os = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();
    let is_dev = cfg!(debug_assertions);
    let exe_path = std::env::current_exe().ok();
    let executable_path = exe_path.as_ref().map(|p| p.to_string_lossy().to_string());

    if os == "linux" {
        if let Ok(flatpak_id) = std::env::var("FLATPAK_ID") {
            if !flatpak_id.trim().is_empty() {
                return InstallEnvironment {
                    os,
                    arch,
                    install_kind: InstallKind::Flatpak,
                    package_manager: PackageManagerKind::None,
                    can_self_update: false,
                    store_managed: true,
                    is_dev,
                    executable_path,
                };
            }
        }

        if let Ok(appimage) = std::env::var("APPIMAGE") {
            if !appimage.trim().is_empty() {
                return InstallEnvironment {
                    os,
                    arch,
                    install_kind: InstallKind::AppImage,
                    package_manager: PackageManagerKind::None,
                    can_self_update: !is_dev,
                    store_managed: false,
                    is_dev,
                    executable_path,
                };
            }
        }

        if let Some(ref exe) = exe_path {
            let exe_str = exe.to_string_lossy();
            if query_command_ok("rpm", &["-qf", &exe_str]) {
                return InstallEnvironment {
                    os,
                    arch,
                    install_kind: InstallKind::Rpm,
                    package_manager: detect_rpm_package_manager(),
                    can_self_update: !is_dev,
                    store_managed: false,
                    is_dev,
                    executable_path,
                };
            }
            if query_command_ok("dpkg", &["-S", &exe_str]) {
                return InstallEnvironment {
                    os,
                    arch,
                    install_kind: InstallKind::Deb,
                    package_manager: detect_deb_package_manager(),
                    can_self_update: !is_dev,
                    store_managed: false,
                    is_dev,
                    executable_path,
                };
            }
        }

        if is_dev {
            return InstallEnvironment {
                os,
                arch,
                install_kind: InstallKind::Dev,
                package_manager: PackageManagerKind::None,
                can_self_update: false,
                store_managed: false,
                is_dev,
                executable_path,
            };
        }

        return InstallEnvironment {
            os,
            arch,
            install_kind: InstallKind::Unknown,
            package_manager: PackageManagerKind::None,
            can_self_update: false,
            store_managed: false,
            is_dev,
            executable_path,
        };
    }

    if os == "android" {
        return InstallEnvironment {
            os,
            arch,
            install_kind: InstallKind::AndroidApk,
            package_manager: PackageManagerKind::None,
            can_self_update: false,
            store_managed: false,
            is_dev,
            executable_path,
        };
    }

    if is_dev {
        return InstallEnvironment {
            os,
            arch,
            install_kind: InstallKind::Dev,
            package_manager: PackageManagerKind::None,
            can_self_update: false,
            store_managed: false,
            is_dev,
            executable_path,
        };
    }

    if os == "windows" {
        return InstallEnvironment {
            os,
            arch,
            install_kind: InstallKind::WindowsNsis,
            package_manager: PackageManagerKind::None,
            can_self_update: true,
            store_managed: false,
            is_dev,
            executable_path,
        };
    }

    if os == "macos" {
        return InstallEnvironment {
            os,
            arch,
            install_kind: InstallKind::MacOs,
            package_manager: PackageManagerKind::None,
            can_self_update: true,
            store_managed: false,
            is_dev,
            executable_path,
        };
    }

    InstallEnvironment {
        os,
        arch,
        install_kind: InstallKind::Unknown,
        package_manager: PackageManagerKind::None,
        can_self_update: false,
        store_managed: false,
        is_dev,
        executable_path,
    }
}

/// Memvalidasi bahwa URL unduhan berasal dari domain GitHub resmi dan menggunakan HTTPS.
pub fn validate_github_download_url(raw_url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(raw_url.trim())
        .map_err(|e| format!("URL unduhan tidak valid: {}", e))?;

    if parsed.scheme() != "https" {
        return Err("Hanya protokol HTTPS yang diizinkan untuk unduhan pembaruan.".to_string());
    }

    let host = parsed.host_str().unwrap_or("").to_lowercase();
    let allowed = host == "github.com"
        || host == "objects.githubusercontent.com"
        || host == "release-assets.githubusercontent.com"
        || host.ends_with(".githubusercontent.com");

    if !allowed {
        return Err(format!(
            "Host unduhan '{}' tidak termasuk domain rilis resmi GitHub.",
            host
        ));
    }

    Ok(parsed)
}

/// Memvalidasi nama berkas aset agar aman dari path traversal.
pub fn sanitize_package_filename(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty()
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.contains("..")
    {
        return Err("Nama berkas paket tidak valid.".to_string());
    }
    let lower = trimmed.to_lowercase();
    if !lower.ends_with(".rpm") && !lower.ends_with(".deb") {
        return Err("Hanya paket .rpm atau .deb yang didukung pada jalur updater native Linux.".to_string());
    }
    Ok(trimmed.to_string())
}

/// Mengurai berkas `SHA256SUMS.txt` menjadi peta `nama_berkas -> hex_sha256`.
pub fn parse_sha256_sums(content: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let mut parts = trimmed.splitn(2, char::is_whitespace);
        let hash_part = parts.next().unwrap_or("").trim().to_lowercase();
        let file_part = parts
            .next()
            .unwrap_or("")
            .trim()
            .trim_start_matches('*')
            .trim_start_matches("./");

        if hash_part.len() == 64 && hash_part.chars().all(|c| c.is_ascii_hexdigit()) && !file_part.is_empty() {
            let basename = Path::new(file_part)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(file_part)
                .to_string();
            map.insert(basename, hash_part);
        }
    }
    map
}

/// Mengurai metadata fallback statis dari `latest.json` dan daftar nama aset dari `SHA256SUMS.txt`.
pub fn parse_static_release_manifests(
    latest_json_str: &str,
    sha256_sums_str: Option<&str>,
) -> Result<ReleaseMetadataResult, String> {
    let json_val: Value = serde_json::from_str(latest_json_str)
        .map_err(|e| format!("Gagal mengurai latest.json: {}", e))?;

    let raw_version = json_val
        .get("version")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Field 'version' tidak ditemukan pada latest.json".to_string())?;
    let latest_version = raw_version.trim_start_matches('v').to_string();

    let release_notes = json_val
        .get("notes")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let published_at = json_val
        .get("pub_date")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let mut asset_map: HashMap<String, ReleaseAssetInfo> = HashMap::new();

    // 1. Ambil aset dari SHA256SUMS.txt (mencakup seluruh format: .rpm, .deb, .AppImage, .exe, .msi, .dmg)
    if let Some(sums) = sha256_sums_str {
        for name in parse_sha256_sums(sums).keys() {
            let download_url = format!(
                "https://github.com/{}/releases/download/v{}/{}",
                GITHUB_REPO, latest_version, name
            );
            asset_map.insert(
                name.clone(),
                ReleaseAssetInfo {
                    name: name.clone(),
                    download_url,
                    size: 0,
                },
            );
        }
    }

    // 2. Lengkapi dari platforms di latest.json jika ada URL yang belum masuk
    if let Some(platforms) = json_val.get("platforms").and_then(|v| v.as_object()) {
        for (_plat, entry) in platforms {
            if let Some(url) = entry.get("url").and_then(|v| v.as_str()) {
                let name = url
                    .rsplit('/')
                    .next()
                    .unwrap_or("")
                    .split('?')
                    .next()
                    .unwrap_or("")
                    .to_string();
                if !name.is_empty() && !asset_map.contains_key(&name) {
                    asset_map.insert(
                        name.clone(),
                        ReleaseAssetInfo {
                            name,
                            download_url: url.to_string(),
                            size: 0,
                        },
                    );
                }
            }
        }
    }

    let mut assets: Vec<ReleaseAssetInfo> = asset_map.into_values().collect();
    assets.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(ReleaseMetadataResult {
        not_modified: false,
        etag: None,
        source: "static-fallback".to_string(),
        latest_version: latest_version.clone(),
        release_url: format!(
            "https://github.com/{}/releases/tag/v{}",
            GITHUB_REPO, latest_version
        ),
        release_notes,
        published_at,
        assets,
        rate_limit_reset_at: None,
    })
}

/// Mengambil metadata rilis terbaru dari GitHub API dengan ETag (304) serta fallback statis anti-403/429.
pub async fn fetch_latest_release_metadata(
    current_version: &str,
    etag: Option<&str>,
) -> Result<ReleaseMetadataResult, String> {
    let clean_current = current_version.trim_start_matches('v').to_string();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent(format!("nitirekso-desktop/{}", clean_current))
        .build()
        .map_err(|e| format!("Gagal menginisialisasi HTTP client: {}", e))?;

    let api_url = format!("https://api.github.com/repos/{}/releases/latest", GITHUB_REPO);
    let mut req = client
        .get(&api_url)
        .header("Accept", "application/vnd.github.v3+json");
    if let Some(tag) = etag {
        if !tag.trim().is_empty() {
            req = req.header("If-None-Match", tag.trim());
        }
    }

    let mut rate_limit_reset_at: Option<i64> = None;
    let mut api_error_msg: Option<String> = None;

    match req.send().await {
        Ok(res) => {
            let status = res.status();
            let resp_etag = res
                .headers()
                .get("etag")
                .and_then(|h| h.to_str().ok())
                .map(|s| s.to_string());
            let is_rate_limited = status == reqwest::StatusCode::FORBIDDEN
                || status == reqwest::StatusCode::TOO_MANY_REQUESTS;
            if is_rate_limited {
                rate_limit_reset_at = res
                    .headers()
                    .get("x-ratelimit-reset")
                    .and_then(|h| h.to_str().ok())
                    .and_then(|s| s.parse::<i64>().ok());
            }

            if status == reqwest::StatusCode::NOT_MODIFIED {
                return Ok(ReleaseMetadataResult {
                    not_modified: true,
                    etag: resp_etag.or_else(|| etag.map(|s| s.to_string())),
                    source: "cache".to_string(),
                    latest_version: clean_current,
                    release_url: format!("https://github.com/{}/releases", GITHUB_REPO),
                    release_notes: None,
                    published_at: None,
                    assets: Vec::new(),
                    rate_limit_reset_at,
                });
            }

            if status.is_success() {
                if let Ok(data) = res.json::<Value>().await {
                    let latest_version = data
                        .get("tag_name")
                        .and_then(|v| v.as_str())
                        .unwrap_or(&clean_current)
                        .trim_start_matches('v')
                        .to_string();
                    let release_url = data
                        .get("html_url")
                        .and_then(|v| v.as_str())
                        .unwrap_or(&format!("https://github.com/{}/releases", GITHUB_REPO))
                        .to_string();
                    let release_notes = data
                        .get("body")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let published_at = data
                        .get("published_at")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());

                    let mut assets = Vec::new();
                    if let Some(arr) = data.get("assets").and_then(|v| v.as_array()) {
                        for item in arr {
                            let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            let download_url = item
                                .get("browser_download_url")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let size = item.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
                            if !name.is_empty() && !download_url.is_empty() {
                                assets.push(ReleaseAssetInfo {
                                    name,
                                    download_url,
                                    size,
                                });
                            }
                        }
                    }

                    return Ok(ReleaseMetadataResult {
                        not_modified: false,
                        etag: resp_etag,
                        source: "github-api".to_string(),
                        latest_version,
                        release_url,
                        release_notes,
                        published_at,
                        assets,
                        rate_limit_reset_at,
                    });
                }
            } else {
                api_error_msg = Some(format!("HTTP {}", status.as_u16()));
            }
        }
        Err(e) => {
            api_error_msg = Some(e.to_string());
        }
    }

    // Fallback statis (bebas kuota rate-limit GitHub API)
    let latest_json_url = format!(
        "https://github.com/{}/releases/latest/download/latest.json",
        GITHUB_REPO
    );
    let sums_url = format!(
        "https://github.com/{}/releases/latest/download/SHA256SUMS.txt",
        GITHUB_REPO
    );

    if let Ok(latest_res) = client.get(&latest_json_url).send().await {
        if latest_res.status().is_success() {
            if let Ok(latest_body) = latest_res.text().await {
                let sums_body = match client.get(&sums_url).send().await {
                    Ok(sr) if sr.status().is_success() => sr.text().await.ok(),
                    _ => None,
                };
                if let Ok(mut parsed) =
                    parse_static_release_manifests(&latest_body, sums_body.as_deref())
                {
                    parsed.rate_limit_reset_at = rate_limit_reset_at;
                    return Ok(parsed);
                }
            }
        }
    }

    let reset_hint = rate_limit_reset_at
        .map(|ts| format!(" (resetEpoch:{})", ts))
        .unwrap_or_default();
    Err(format!(
        "Gagal mengambil informasi rilis terbaru ({}){}",
        api_error_msg.unwrap_or_else(|| "jaringan tidak tersedia".to_string()),
        reset_hint
    ))
}

fn get_updates_temp_dir() -> Result<PathBuf, String> {
    let dir = std::env::temp_dir().join("nitirekso-updates");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Gagal membuat folder unduhan sementara: {}", e))?;
    }
    Ok(dir)
}

/// Mengunduh paket Linux (.rpm/.deb) secara streaming dan memverifikasi integritasnya terhadap `SHA256SUMS.txt`.
pub async fn download_and_verify_linux_package(
    app: &AppHandle,
    asset_url: &str,
    asset_name: &str,
    expected_version: &str,
) -> Result<LinuxDownloadVerificationResult, String> {
    let validated_url = validate_github_download_url(asset_url)?;
    let safe_name = sanitize_package_filename(asset_name)?;
    let clean_version = expected_version.trim_start_matches('v');

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .user_agent(format!("nitirekso-desktop/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("Gagal membuat HTTP client unduhan: {}", e))?;

    // 1. Ambil SHA256SUMS.txt dari tag rilis terkait untuk verifikasi integritas
    let sums_url = format!(
        "https://github.com/{}/releases/download/v{}/SHA256SUMS.txt",
        GITHUB_REPO, clean_version
    );
    let sums_resp = client
        .get(&sums_url)
        .send()
        .await
        .map_err(|e| format!("Gagal mengunduh SHA256SUMS.txt: {}", e))?;

    if !sums_resp.status().is_success() {
        return Err(format!(
            "SHA256SUMS.txt tidak ditemukan pada rilis v{} (HTTP {}).",
            clean_version,
            sums_resp.status().as_u16()
        ));
    }

    let sums_text = sums_resp
        .text()
        .await
        .map_err(|e| format!("Gagal membaca SHA256SUMS.txt: {}", e))?;
    let sums_map = parse_sha256_sums(&sums_text);
    let expected_hash = sums_map.get(&safe_name).cloned().ok_or_else(|| {
        format!(
            "Checksum SHA-256 untuk berkas '{}' tidak tercantum di SHA256SUMS.txt.",
            safe_name
        )
    })?;

    // 2. Unduh paket secara streaming sambil hitung SHA-256 & kirim event progres
    let resp = client
        .get(validated_url)
        .send()
        .await
        .map_err(|e| format!("Gagal mengunduh berkas pembaruan: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!(
            "Server rilis mengembalikan status HTTP {} saat mengunduh {}.",
            resp.status().as_u16(),
            safe_name
        ));
    }

    let total_bytes = resp.content_length();
    let target_dir = get_updates_temp_dir()?;
    let target_path = target_dir.join(&safe_name);
    let mut file = fs::File::create(&target_path)
        .map_err(|e| format!("Gagal membuat berkas sementara '{}': {}", target_path.display(), e))?;

    let mut hasher = Sha256::new();
    let mut downloaded_bytes: u64 = 0;
    let mut stream = resp.bytes_stream();

    while let Some(chunk_res) = stream.next().await {
        let chunk = match chunk_res {
            Ok(c) => c,
            Err(e) => {
                let _ = fs::remove_file(&target_path);
                return Err(format!("Unduhan terputus di tengah jalan: {}", e));
            }
        };

        if let Err(e) = file.write_all(&chunk) {
            let _ = fs::remove_file(&target_path);
            return Err(format!("Gagal menulis berkas unduhan ke disk: {}", e));
        }
        hasher.update(&chunk);
        downloaded_bytes += chunk.len() as u64;

        let percent = match total_bytes {
            Some(t) if t > 0 => ((downloaded_bytes as f64 / t as f64) * 100.0).min(100.0),
            _ => 0.0,
        };

        let _ = app.emit(
            DOWNLOAD_PROGRESS_EVENT,
            UpdateDownloadProgress {
                downloaded_bytes,
                total_bytes,
                percent,
                asset_name: safe_name.clone(),
            },
        );
    }

    if let Err(e) = file.flush() {
        let _ = fs::remove_file(&target_path);
        return Err(format!("Gagal menyelesaikan penulisan berkas: {}", e));
    }

    let actual_hash = hex::encode(hasher.finalize());
    if actual_hash != expected_hash {
        let _ = fs::remove_file(&target_path);
        return Err(format!(
            "Verifikasi SHA-256 gagal untuk {} (diharapkan {}, aktual {}). Berkas dihapus demi keamanan.",
            safe_name, expected_hash, actual_hash
        ));
    }

    Ok(LinuxDownloadVerificationResult {
        local_path: target_path.to_string_lossy().to_string(),
        sha256: actual_hash,
        size: downloaded_bytes,
    })
}

/// Memetakan perintah instalasi `pkexec` berdasarkan jenis paket & package manager.
pub fn determine_install_command_args(
    install_kind: InstallKind,
    package_manager: PackageManagerKind,
    local_path: &str,
) -> Option<Vec<String>> {
    match (install_kind, package_manager) {
        (InstallKind::Rpm, PackageManagerKind::Dnf) => Some(vec![
            "dnf".into(),
            "install".into(),
            "-y".into(),
            local_path.into(),
        ]),
        (InstallKind::Rpm, PackageManagerKind::Zypper) => Some(vec![
            "zypper".into(),
            "--non-interactive".into(),
            "install".into(),
            "--allow-unsigned-rpm".into(),
            local_path.into(),
        ]),
        (InstallKind::Rpm, PackageManagerKind::Rpm) => Some(vec![
            "rpm".into(),
            "-Uvh".into(),
            local_path.into(),
        ]),
        (InstallKind::Deb, PackageManagerKind::AptGet) => Some(vec![
            "env".into(),
            "DEBIAN_FRONTEND=noninteractive".into(),
            "apt-get".into(),
            "install".into(),
            "-y".into(),
            local_path.into(),
        ]),
        _ => None,
    }
}

fn validate_downloaded_local_path(local_path: &str) -> Result<PathBuf, String> {
    let updates_dir = get_updates_temp_dir()?;
    let canonical_dir = fs::canonicalize(&updates_dir).unwrap_or(updates_dir);
    let candidate = fs::canonicalize(local_path)
        .map_err(|_| "Berkas installer hasil unduhan tidak ditemukan.".to_string())?;

    if !candidate.starts_with(&canonical_dir) {
        return Err("Lokasi berkas installer berada di luar direktori unduhan yang diizinkan.".to_string());
    }

    let ext = candidate
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();
    if ext != "rpm" && ext != "deb" {
        return Err("Format berkas installer Linux tidak didukung.".to_string());
    }

    Ok(candidate)
}

fn spawn_xdg_open(path: &Path) -> Result<(), String> {
    Command::new("xdg-open")
        .arg(path)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Gagal membuka berkas dengan xdg-open: {}", e))
}

/// Membuka berkas installer lokal menggunakan pengelola paket grafis sistem (xdg-open).
pub fn open_local_installer_fallback(local_path: &str) -> Result<LinuxInstallResult, String> {
    let validated = validate_downloaded_local_path(local_path)?;
    spawn_xdg_open(&validated)?;
    Ok(LinuxInstallResult {
        status: InstallResultStatus::OpenedFallback,
        message: "Berkas installer dibuka dengan pengelola paket sistem. Lanjutkan instalasi lalu buka ulang aplikasi.".to_string(),
    })
}

/// Membersihkan akhiran " (deleted)" yang muncul di `/proc/self/exe` Linux setelah biner ditimpa.
pub fn clean_executable_path(raw: &Path) -> String {
    let s = raw.to_string_lossy();
    s.strip_suffix(" (deleted)").unwrap_or(&s).to_string()
}

/// Menjalankan subproses detached yang menunggu PID aplikasi saat ini keluar penuh
/// sebelum meluncurkan biner baru agar lock `tauri-plugin-single-instance` terlepas bersih.
fn spawn_relaunch_helper(exe_str: &str) -> Result<(), String> {
    let pid = std::process::id();

    let script = "pid=\"$1\"; exe=\"$2\"; \
        i=0; while kill -0 \"$pid\" 2>/dev/null && [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done; \
        exec \"$exe\" >/dev/null 2>&1 &";

    Command::new("sh")
        .arg("-c")
        .arg(script)
        .arg("nitirekso-relaunch")
        .arg(pid.to_string())
        .arg(exe_str)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Gagal menjalankan relaunch helper: {}", e))?;

    Ok(())
}

/// Memasang paket `.rpm`/`.deb` via `pkexec` lalu me-restart aplikasi, atau beralih ke `xdg-open`.
pub fn install_linux_package_and_relaunch(
    app: &AppHandle,
    local_path: &str,
    install_kind: InstallKind,
) -> Result<LinuxInstallResult, String> {
    let validated_path = validate_downloaded_local_path(local_path)?;
    let path_str = validated_path.to_string_lossy().to_string();
    // Tangkap path executable SEBELUM pkexec menimpa biner di disk (menghindari "/proc/self/exe (deleted)")
    let captured_exe = std::env::current_exe()
        .map(|p| clean_executable_path(&p))
        .ok();

    let pkg_mgr = match install_kind {
        InstallKind::Rpm => detect_rpm_package_manager(),
        InstallKind::Deb => detect_deb_package_manager(),
        _ => PackageManagerKind::None,
    };

    let Some(args) = determine_install_command_args(install_kind, pkg_mgr, &path_str) else {
        spawn_xdg_open(&validated_path)?;
        return Ok(LinuxInstallResult {
            status: InstallResultStatus::OpenedFallback,
            message: "Package manager CLI tidak tersedia; berkas dibuka lewat pengelola paket sistem.".to_string(),
        });
    };

    let output = Command::new("pkexec").args(&args).output();
    match output {
        Ok(out) if out.status.success() => {
            let relaunch_res = match captured_exe {
                Some(ref exe) => spawn_relaunch_helper(exe),
                None => Err("Lokasi executable tidak ditemukan.".to_string()),
            };
            if let Err(e) = relaunch_res {
                log::warn!("[updater] Instalasi sukses, namun relaunch helper gagal: {}", e);
                return Ok(LinuxInstallResult {
                    status: InstallResultStatus::InstalledRelaunching,
                    message: "Pembaruan berhasil dipasang. Silakan tutup dan buka ulang nitirekso.".to_string(),
                });
            }
            app.exit(0);
            Ok(LinuxInstallResult {
                status: InstallResultStatus::InstalledRelaunching,
                message: "Pembaruan berhasil dipasang, aplikasi sedang dimulai ulang.".to_string(),
            })
        }
        Ok(out) => {
            let code = out.status.code().unwrap_or(-1);
            // 126: pengguna menutup/membatalkan dialog otentikasi polkit; 127: pkexec tidak terautentikasi
            if code == 126 || code == 127 {
                return Ok(LinuxInstallResult {
                    status: InstallResultStatus::Cancelled,
                    message: "Otentikasi instalasi dibatalkan. Anda dapat mencoba lagi atau membuka berkas installer secara manual.".to_string(),
                });
            }
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            log::warn!("[updater] pkexec gagal (kode {}): {}. Beralih ke xdg-open...", code, stderr);
            spawn_xdg_open(&validated_path)?;
            Ok(LinuxInstallResult {
                status: InstallResultStatus::OpenedFallback,
                message: "Instalasi otomatis membutuhkan langkah manual; berkas installer telah dibuka.".to_string(),
            })
        }
        Err(e) => {
            log::warn!("[updater] Gagal menjalankan pkexec: {}. Beralih ke xdg-open...", e);
            spawn_xdg_open(&validated_path)?;
            Ok(LinuxInstallResult {
                status: InstallResultStatus::OpenedFallback,
                message: "pkexec tidak tersedia; berkas installer dibuka lewat aplikasi default sistem.".to_string(),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_sha256_sums_parses_standard_and_binary_prefixes() {
        let sample = "\
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  nitirekso-1.9.1-1.x86_64.rpm
0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef *./nitirekso_1.9.1_amd64.deb
invalid_line_ignored
";
        let map = parse_sha256_sums(sample);
        assert_eq!(map.len(), 2);
        assert_eq!(
            map.get("nitirekso-1.9.1-1.x86_64.rpm").map(String::as_str),
            Some("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
        );
        assert_eq!(
            map.get("nitirekso_1.9.1_amd64.deb").map(String::as_str),
            Some("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
        );
    }

    #[test]
    fn test_parse_static_release_manifests_combines_latest_json_and_sha256sums() {
        let latest_json = r#"{
            "version": "1.9.1",
            "notes": "Perbaikan updater dan wallpaper PnL",
            "pub_date": "2026-11-19T10:00:00Z",
            "platforms": {
                "windows-x86_64": {
                    "signature": "sig-win",
                    "url": "https://github.com/KaleksananBarqi/nitirekso/releases/download/v1.9.1/nitirekso_1.9.1_x64-setup.exe"
                },
                "linux-x86_64": {
                    "signature": "sig-lin",
                    "url": "https://github.com/KaleksananBarqi/nitirekso/releases/download/v1.9.1/nitirekso_1.9.1_amd64.AppImage"
                }
            }
        }"#;
        let sums = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  nitirekso-1.9.1-1.x86_64.rpm\n\
                    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb  nitirekso_1.9.1_amd64.deb\n";

        let parsed = parse_static_release_manifests(latest_json, Some(sums)).unwrap();
        assert_eq!(parsed.latest_version, "1.9.1");
        assert_eq!(parsed.source, "static-fallback");
        assert_eq!(parsed.assets.len(), 4);
        assert!(parsed.assets.iter().any(|a| a.name == "nitirekso-1.9.1-1.x86_64.rpm"));
        assert!(parsed.assets.iter().any(|a| a.name == "nitirekso_1.9.1_amd64.deb"));
        assert!(parsed.assets.iter().any(|a| a.name == "nitirekso_1.9.1_x64-setup.exe"));
        assert!(parsed.assets.iter().any(|a| a.name == "nitirekso_1.9.1_amd64.AppImage"));
    }

    #[test]
    fn test_validate_github_download_url_and_filename_security() {
        assert!(validate_github_download_url(
            "https://github.com/KaleksananBarqi/nitirekso/releases/download/v1.9.1/nitirekso-1.9.1-1.x86_64.rpm"
        )
        .is_ok());
        assert!(validate_github_download_url(
            "https://objects.githubusercontent.com/github-production-release-asset/foo.rpm"
        )
        .is_ok());
        assert!(validate_github_download_url("http://github.com/foo.rpm").is_err());
        assert!(validate_github_download_url("https://evil.example.com/foo.rpm").is_err());

        assert!(sanitize_package_filename("nitirekso-1.9.1-1.x86_64.rpm").is_ok());
        assert!(sanitize_package_filename("nitirekso_1.9.1_amd64.deb").is_ok());
        assert!(sanitize_package_filename("../evil.rpm").is_err());
        assert!(sanitize_package_filename("payload.sh").is_err());
    }

    #[test]
    fn test_determine_install_command_args_variants() {
        let rpm_dnf = determine_install_command_args(
            InstallKind::Rpm,
            PackageManagerKind::Dnf,
            "/tmp/pkg.rpm",
        )
        .unwrap();
        assert_eq!(rpm_dnf, vec!["dnf", "install", "-y", "/tmp/pkg.rpm"]);

        let deb_apt = determine_install_command_args(
            InstallKind::Deb,
            PackageManagerKind::AptGet,
            "/tmp/pkg.deb",
        )
        .unwrap();
        assert_eq!(
            deb_apt,
            vec!["env", "DEBIAN_FRONTEND=noninteractive", "apt-get", "install", "-y", "/tmp/pkg.deb"]
        );

        assert!(determine_install_command_args(
            InstallKind::AppImage,
            PackageManagerKind::None,
            "/tmp/app.AppImage",
        )
        .is_none());
    }

    #[test]
    fn test_clean_executable_path_strips_deleted_suffix() {
        assert_eq!(
            clean_executable_path(Path::new("/usr/bin/nitirekso (deleted)")),
            "/usr/bin/nitirekso"
        );
        assert_eq!(
            clean_executable_path(Path::new("/usr/bin/nitirekso")),
            "/usr/bin/nitirekso"
        );
    }
}
