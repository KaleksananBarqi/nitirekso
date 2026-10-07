use crate::credentials::{delete_gdrive_token, load_gdrive_token, save_gdrive_token};
use crate::db::repositories::settings::{get_setting, set_setting};
use crate::db::repositories::trades::list_trades;
use crate::models::{TradeDetail, TradeFilter};
use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine;
use rand::Rng;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const DEFAULT_REDIRECT_PORT: u16 = 17380;
const OAUTH_SCOPE: &str = "https://www.googleapis.com/auth/drive.file";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupStatusPayload {
    pub connected: bool,
    pub email: Option<String>,
    pub folder: Option<String>,
    pub last_backup_at: Option<i64>,
    pub next_backup_at: Option<i64>,
    pub sync_mode: Option<String>,
    pub local_folder: Option<String>,
    pub client_id_configured: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRunResult {
    pub status: String,
    pub files_uploaded: usize,
    pub bytes_uploaded: usize,
    pub duration_ms: i64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenData {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expiry_date: Option<i64>,
    pub email: Option<String>,
}

#[derive(Debug, Clone)]
pub struct BackupContext {
    pub snapshot_json: String,
    pub local_folder: Option<String>,
    pub token_data: Option<TokenData>,
    pub db_path: PathBuf,
    pub date_str: String,
    pub now_ms: i64,
    pub client_id: String,
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// Format timestamp milidetik ke YYYY-MM-DD menggunakan kalkulasi kalender Gregorian
pub fn format_date_ymd(timestamp_ms: i64) -> String {
    let secs = (timestamp_ms / 1000).max(0) as u64;
    let days = secs / 86400;
    let z = days + 719468;
    let era = z / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64) + (era as i64) * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let final_y = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}", final_y, m, d)
}

/// Dapatkan Google Drive OAuth Client ID yang aktif dari settings DB atau env
pub fn get_effective_client_id(conn: &Connection) -> String {
    let configured = get_setting(conn, "gdriveClientId")
        .unwrap_or(None)
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();

    if !configured.is_empty() {
        return configured;
    }

    std::env::var("GDRIVE_CLIENT_ID").unwrap_or_default()
}

/// Ambil status konfigurasi dan koneksi backup
pub fn get_backup_status(conn: &Connection) -> BackupStatusPayload {
    let token = load_gdrive_token().and_then(|json_str| serde_json::from_str::<TokenData>(&json_str).ok());
    let email = get_setting(conn, "gdriveEmail")
        .unwrap_or(None)
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();
    let folder = get_setting(conn, "gdriveFolderId")
        .unwrap_or(None)
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();
    let last_backup_at = get_setting(conn, "gdriveLastBackupAt")
        .unwrap_or(None)
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let local_folder = get_setting(conn, "gdriveLocalFolder")
        .unwrap_or(None)
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();

    let sync_mode = get_setting(conn, "gdriveSyncMode")
        .unwrap_or(None)
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| {
            if !local_folder.is_empty() {
                "folder".to_string()
            } else {
                "oauth".to_string()
            }
        });

    let client_id = get_effective_client_id(conn);

    BackupStatusPayload {
        connected: token.is_some() || !local_folder.is_empty(),
        email: if email.is_empty() { None } else { Some(email) },
        folder: if folder.is_empty() { None } else { Some(folder) },
        last_backup_at: if last_backup_at > 0 { Some(last_backup_at) } else { None },
        next_backup_at: None,
        sync_mode: Some(sync_mode),
        local_folder: if local_folder.is_empty() { None } else { Some(local_folder) },
        client_id_configured: Some(!client_id.is_empty()),
    }
}

/// Putus koneksi Google Drive dan bersihkan folder lokal
pub fn disconnect_backup(conn: &Connection) -> Result<(), String> {
    let _ = delete_gdrive_token();
    let _ = set_setting(conn, "gdriveEmail", &json!(""));
    let _ = set_setting(conn, "gdriveFolderId", &json!(""));
    let _ = set_setting(conn, "gdriveLocalFolder", &json!(""));
    let _ = set_setting(conn, "gdriveLastBackupAt", &json!(0));
    log::info!("[backup] Koneksi backup berhasil diputus dan dibersihkan");
    Ok(())
}

/// Buka dialog native pemilih folder untuk sync lokal
pub fn select_local_folder(conn: &Connection) -> Result<Option<String>, String> {
    let dialog = rfd::FileDialog::new().set_title("Pilih Folder Sinkronisasi Google Drive / Cadangan");
    if let Some(folder_path) = dialog.pick_folder() {
        let chosen = folder_path.to_string_lossy().to_string();
        set_setting(conn, "gdriveLocalFolder", &json!(&chosen))
            .map_err(|e| format!("Gagal menyimpan folder backup: {}", e))?;
        set_setting(conn, "gdriveSyncMode", &json!("folder"))
            .map_err(|e| format!("Gagal menyimpan mode sync: {}", e))?;
        log::info!("[backup] Folder lokal backup disetel ke: {}", chosen);
        Ok(Some(chosen))
    } else {
        Ok(None)
    }
}

/// Generate pasangan PKCE (verifier & S256 challenge)
fn generate_pkce() -> (String, String) {
    let mut verifier_bytes = [0u8; 32];
    rand::thread_rng().fill(&mut verifier_bytes);
    let verifier = URL_SAFE_NO_PAD.encode(verifier_bytes);

    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let hash = hasher.finalize();
    let challenge = URL_SAFE_NO_PAD.encode(hash);

    (verifier, challenge)
}

/// Extract email dari payload id_token (JWT bagian kedua)
fn extract_email_from_id_token(id_token: &str) -> Option<String> {
    let parts: Vec<&str> = id_token.split('.').collect();
    if parts.len() < 2 {
        return None;
    }

    let payload_bytes = URL_SAFE_NO_PAD
        .decode(parts[1])
        .or_else(|_| STANDARD.decode(parts[1]))
        .ok()?;

    let val: Value = serde_json::from_slice(&payload_bytes).ok()?;
    val.get("email").and_then(|v| v.as_str()).map(|s| s.to_string())
}

/// Mulai alur OAuth Google Drive dengan PKCE dan loopback server lokal di port 17380
pub async fn start_backup_oauth(
    db_path: PathBuf,
    client_id_override: Option<String>,
) -> Result<(), String> {
    let client_id = {
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("Gagal membuka koneksi DB: {}", e))?;

        if let Some(ref cid) = client_id_override {
            let trimmed = cid.trim();
            if !trimmed.is_empty() {
                let _ = set_setting(&conn, "gdriveClientId", &json!(trimmed));
            }
        }

        let id = client_id_override
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| get_effective_client_id(&conn));

        if id.trim().is_empty() {
            return Err(
                "Google Drive Client ID belum dikonfigurasi. Masukkan Client ID di menu Pengaturan atau gunakan Folder Sync lokal."
                    .to_string(),
            );
        }
        id
    };

    let port = DEFAULT_REDIRECT_PORT;
    let (verifier, challenge) = generate_pkce();

    let mut state_bytes = [0u8; 16];
    rand::thread_rng().fill(&mut state_bytes);
    let state = hex::encode(state_bytes);

    let redirect_uri = format!("http://localhost:{}", port);
    let encoded_redirect_uri = urlencoding::encode(&redirect_uri);
    let encoded_scope = urlencoding::encode(OAUTH_SCOPE);

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent&code_challenge={}&code_challenge_method=S256&state={}",
        urlencoding::encode(&client_id),
        encoded_redirect_uri,
        encoded_scope,
        challenge,
        state
    );

    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{}", port))
        .await
        .map_err(|e| format!("Gagal membuka listener port {}: {}", port, e))?;

    log::info!("[backup] Loopback OAuth listener mendengarkan di port {}", port);

    // Buka browser pengguna
    opener::open(&auth_url).map_err(|e| format!("Gagal membuka browser sistem: {}", e))?;

    // Tunggu koneksi dari browser dengan timeout 5 menit
    let client_id_clone = client_id.clone();
    let state_clone = state.clone();

    tokio::spawn(async move {
        let wait_result = tokio::time::timeout(Duration::from_secs(300), listener.accept()).await;

        match wait_result {
            Ok(Ok((mut stream, _))) => {
                use tokio::io::{AsyncReadExt, AsyncWriteExt};
                let mut buffer = [0u8; 2048];
                let n = stream.read(&mut buffer).await.unwrap_or(0);
                let request_str = String::from_utf8_lossy(&buffer[..n]);

                // Parse request path & query params
                let first_line = request_str.lines().next().unwrap_or("");
                let path_and_query = first_line.split_whitespace().nth(1).unwrap_or("/");

                let query_str = path_and_query.split_once('?').map(|(_, q)| q).unwrap_or("");
                let mut query_pairs = std::collections::HashMap::new();
                for pair in query_str.split('&') {
                    if let Some((k, v)) = pair.split_once('=') {
                        let decoded_k = urlencoding::decode(k).unwrap_or_default().to_string();
                        let decoded_v = urlencoding::decode(v).unwrap_or_default().to_string();
                        query_pairs.insert(decoded_k, decoded_v);
                    }
                }

                if let Some(err) = query_pairs.get("error") {
                    let html = "<html><body style=\"font-family:sans-serif;text-align:center;padding:50px;\"><h2>Autentikasi Dibatalkan</h2><p>Anda bisa menutup tab ini.</p></body></html>";
                    let resp = format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", html.len(), html);
                    let _ = stream.write_all(resp.as_bytes()).await;
                    log::warn!("[backup] OAuth Google Drive dibatalkan oleh pengguna: {}", err);
                    return;
                }

                let returned_state = query_pairs.get("state").cloned().unwrap_or_default();
                if returned_state != state_clone {
                    let html = "<html><body style=\"font-family:sans-serif;text-align:center;padding:50px;\"><h2>State Mismatch</h2><p>Kemungkinan ada percobaan CSRF.</p></body></html>";
                    let resp = format!("HTTP/1.1 400 Bad Request\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", html.len(), html);
                    let _ = stream.write_all(resp.as_bytes()).await;
                    return;
                }

                if let Some(code) = query_pairs.get("code") {
                    match exchange_code_for_token(code, &verifier, port, &client_id_clone).await {
                        Ok(token_data) => {
                            if let Ok(serialized) = serde_json::to_string(&token_data) {
                                let _ = save_gdrive_token(&serialized);
                            }
                            let email = token_data.email.clone().unwrap_or_default();

                            if let Ok(conn) = rusqlite::Connection::open(&db_path) {
                                let _ = set_setting(&conn, "gdriveEmail", &json!(email));
                                let _ = set_setting(&conn, "gdriveFolderId", &json!(""));
                                let _ = set_setting(&conn, "gdriveLastBackupAt", &json!(0));
                                let _ = set_setting(&conn, "gdriveSyncMode", &json!("oauth"));
                            }

                            let html = "<html><body style=\"font-family:sans-serif;text-align:center;padding:50px;\"><h2 style=\"color:#22c55e;\">Google Drive Terhubung!</h2><p>Akun berhasil terautentikasi. Anda dapat menutup tab ini dan kembali ke aplikasi Nitirekso.</p></body></html>";
                            let resp = format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", html.len(), html);
                            let _ = stream.write_all(resp.as_bytes()).await;
                            log::info!("[backup] Google Drive berhasil terhubung via OAuth ({})", email);
                        }
                        Err(err) => {
                            let html = format!("<html><body style=\"font-family:sans-serif;text-align:center;padding:50px;\"><h2 style=\"color:#ef4444;\">Gagal Menghubungkan</h2><p>{}</p></body></html>", err);
                            let resp = format!("HTTP/1.1 500 Internal Server Error\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", html.len(), html);
                            let _ = stream.write_all(resp.as_bytes()).await;
                            log::error!("[backup] Gagal pertukaran token Google: {}", err);
                        }
                    }
                } else {
                    let html = "<html><body><h2>Permintaan tidak dikenali.</h2></body></html>";
                    let resp = format!("HTTP/1.1 404 Not Found\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", html.len(), html);
                    let _ = stream.write_all(resp.as_bytes()).await;
                }
            }
            Ok(Err(e)) => {
                log::error!("[backup] Listener accept error: {}", e);
            }
            Err(_) => {
                log::warn!("[backup] Timeout 5 menit tercapai untuk OAuth redirect listener");
            }
        }
    });

    Ok(())
}

/// Tukar authorization code dengan access token & refresh token
async fn exchange_code_for_token(
    code: &str,
    verifier: &str,
    port: u16,
    client_id: &str,
) -> Result<TokenData, String> {
    let redirect_uri = format!("http://localhost:{}", port);
    let params = [
        ("client_id", client_id),
        ("code", code),
        ("code_verifier", verifier),
        ("grant_type", "authorization_code"),
        ("redirect_uri", &redirect_uri),
    ];

    let client = reqwest::Client::new();
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Koneksi token exchange gagal: {}", e))?;

    if !resp.status().is_success() {
        let err_body = resp.text().await.unwrap_or_default();
        return Err(format!("Token exchange ditolak: {}", err_body));
    }

    let token_resp: Value = resp
        .json()
        .await
        .map_err(|e| format!("Gagal parse token response: {}", e))?;

    let access_token = token_resp
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "access_token tidak ditemukan di response".to_string())?
        .to_string();

    let refresh_token = token_resp
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let expires_in = token_resp.get("expires_in").and_then(|v| v.as_i64()).unwrap_or(3600);
    let expiry_date = Some(now_millis() + expires_in * 1000);

    let email = token_resp
        .get("id_token")
        .and_then(|v| v.as_str())
        .and_then(extract_email_from_id_token);

    Ok(TokenData {
        access_token,
        refresh_token,
        expiry_date,
        email,
    })
}

/// Refresh token jika kadaluarsa
async fn get_valid_access_token(client_id: &str, mut token_data: TokenData) -> Result<(String, TokenData), String> {
    let now = now_millis();
    let is_expired = token_data.expiry_date.map(|exp| now > exp - 60_000).unwrap_or(false);

    if !is_expired {
        return Ok((token_data.access_token.clone(), token_data));
    }

    if let Some(ref r_token) = token_data.refresh_token {
        let params = [
            ("client_id", client_id),
            ("refresh_token", r_token.as_str()),
            ("grant_type", "refresh_token"),
        ];

        let client = reqwest::Client::new();
        let resp = client
            .post("https://oauth2.googleapis.com/token")
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("Gagal refresh token: {}", e))?;

        if resp.status().is_success() {
            let res_json: Value = resp.json().await.map_err(|e| e.to_string())?;
            if let Some(new_at) = res_json.get("access_token").and_then(|v| v.as_str()) {
                token_data.access_token = new_at.to_string();
                let expires_in = res_json.get("expires_in").and_then(|v| v.as_i64()).unwrap_or(3600);
                token_data.expiry_date = Some(now_millis() + expires_in * 1000);

                if let Ok(serialized) = serde_json::to_string(&token_data) {
                    let _ = save_gdrive_token(&serialized);
                }

                log::info!("[backup] Access token Google Drive berhasil diperbarui (refresh)");
                return Ok((token_data.access_token.clone(), token_data));
            }
        }
    }

    Ok((token_data.access_token.clone(), token_data))
}

/// Direktori screenshots yang terkelola
pub fn get_screenshot_dir(db_path: &Path) -> PathBuf {
    db_path.parent().unwrap_or(Path::new(".")).join("screenshots")
}

/// Siapkan data snapshot backup dari DB secara synchronous (sebelum async upload)
pub fn prepare_backup_context(conn: &Connection, db_path: &Path) -> Result<BackupContext, String> {
    let token_raw = load_gdrive_token();
    let token_data = token_raw.and_then(|s| serde_json::from_str::<TokenData>(&s).ok());
    let local_folder = get_setting(conn, "gdriveLocalFolder")
        .unwrap_or(None)
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .filter(|s| !s.trim().is_empty());

    if token_data.is_none() && local_folder.is_none() {
        return Err(
            "Google Drive belum terhubung. Silakan pilih Folder Google Drive di komputer atau hubungkan akun Google Drive via OAuth."
                .to_string(),
        );
    }

    let trades: Vec<TradeDetail> = list_trades(conn, &TradeFilter::default())
        .map_err(|e| format!("Gagal membaca daftar trade: {}", e))?;

    let now_ms = now_millis();
    let date_str = format_date_ymd(now_ms);

    let snapshot_value = json!({
        "exportedAt": now_ms,
        "version": 1,
        "trades": trades
    });

    let snapshot_json = serde_json::to_string_pretty(&snapshot_value)
        .map_err(|e| format!("Gagal membuat snapshot JSON: {}", e))?;

    let client_id = get_effective_client_id(conn);

    Ok(BackupContext {
        snapshot_json,
        local_folder,
        token_data,
        db_path: db_path.to_path_buf(),
        date_str,
        now_ms,
        client_id,
    })
}

/// Eksekusi backup asinkron (Local Folder Sync dan/atau Google Drive Cloud)
pub async fn execute_backup(ctx: BackupContext) -> Result<(BackupRunResult, Option<String>), String> {
    let start = Instant::now();
    let snapshot_bytes = ctx.snapshot_json.as_bytes();

    let mut files_uploaded = 0;
    let mut bytes_uploaded = 0;
    let mut cloud_folder_id: Option<String> = None;

    // Mode A: Sinkronisasi ke folder lokal (Google Drive desktop / folder backup)
    if let Some(ref local_folder) = ctx.local_folder {
        let dest_dir = Path::new(local_folder);
        if !dest_dir.exists() {
            fs::create_dir_all(dest_dir).map_err(|e| format!("Gagal membuat direktori {}: {}", local_folder, e))?;
        }

        let json_filename = format!("trading-journal-{}.json", ctx.date_str);
        let json_dest = dest_dir.join(&json_filename);
        fs::write(&json_dest, snapshot_bytes)
            .map_err(|e| format!("Gagal menulis snapshot {}: {}", json_dest.display(), e))?;

        files_uploaded += 1;
        bytes_uploaded += snapshot_bytes.len();

        // Salin database fisik jika ada
        if ctx.db_path.exists() {
            let db_dest = dest_dir.join("trading-journal-database.db");
            if let Ok(bytes) = fs::copy(&ctx.db_path, &db_dest) {
                files_uploaded += 1;
                bytes_uploaded += bytes as usize;
            }
        }

        // Salin screenshots jika ada
        let screenshot_dir = get_screenshot_dir(&ctx.db_path);
        if screenshot_dir.exists() {
            let dest_screenshots = dest_dir.join("screenshots");
            let _ = fs::create_dir_all(&dest_screenshots);
            if let Ok(entries) = fs::read_dir(&screenshot_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        let file_name = entry.file_name();
                        let target = dest_screenshots.join(file_name);
                        if let Ok(bytes) = fs::copy(&path, target) {
                            files_uploaded += 1;
                            bytes_uploaded += bytes as usize;
                        }
                    }
                }
            }
        }
    }

    // Mode B: Upload ke Cloud Google Drive via direct OAuth
    if let Some(t_data) = ctx.token_data {
        match get_valid_access_token(&ctx.client_id, t_data).await {
            Ok((access_token, _)) => {
                let upload_res = upload_to_gdrive(&access_token, &ctx.date_str, snapshot_bytes, &ctx.db_path).await;
                match upload_res {
                    Ok((cloud_files, cloud_bytes, folder_id)) => {
                        files_uploaded += cloud_files;
                        bytes_uploaded += cloud_bytes;
                        cloud_folder_id = Some(folder_id);
                    }
                    Err(err) => {
                        if ctx.local_folder.is_none() {
                            return Err(err);
                        } else {
                            log::warn!("[backup] Upload cloud gagal tetapi lokal berhasil: {}", err);
                        }
                    }
                }
            }
            Err(e) => {
                if ctx.local_folder.is_none() {
                    return Err(e);
                } else {
                    log::warn!("[backup] Validasi token gagal namun folder lokal aktif: {}", e);
                }
            }
        }
    }

    let run_result = BackupRunResult {
        status: "ok".to_string(),
        files_uploaded,
        bytes_uploaded,
        duration_ms: start.elapsed().as_millis() as i64,
        error: None,
    };

    Ok((run_result, cloud_folder_id))
}

/// Cari atau buat folder "Trading Journal Backup" di Google Drive
async fn ensure_backup_folder(client: &reqwest::Client, access_token: &str) -> Result<String, String> {
    let search_url = "https://www.googleapis.com/drive/v3/files?q=name%3D'Trading%20Journal%20Backup'%20and%20mimeType%3D'application%2Fvnd.google-apps.folder'%20and%20trashed%3Dfalse&fields=files(id%2Cname)";

    let resp = client
        .get(search_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("Gagal mencari folder backup: {}", e))?;

    if resp.status().is_success() {
        let data: Value = resp.json().await.map_err(|e| e.to_string())?;
        if let Some(files) = data.get("files").and_then(|v| v.as_array()) {
            if let Some(first) = files.first() {
                if let Some(id) = first.get("id").and_then(|v| v.as_str()) {
                    return Ok(id.to_string());
                }
            }
        }
    }

    // Buat folder baru
    let create_resp = client
        .post("https://www.googleapis.com/drive/v3/files")
        .header("Authorization", format!("Bearer {}", access_token))
        .json(&json!({
            "name": "Trading Journal Backup",
            "mimeType": "application/vnd.google-apps.folder"
        }))
        .send()
        .await
        .map_err(|e| format!("Gagal request buat folder: {}", e))?;

    if !create_resp.status().is_success() {
        return Err("Gagal membuat folder backup di Google Drive".to_string());
    }

    let created: Value = create_resp.json().await.map_err(|e| e.to_string())?;
    let folder_id = created
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "ID folder tidak ditemukan pada respon pembuatan folder".to_string())?;

    Ok(folder_id.to_string())
}

/// Upload file multipart ke Google Drive v3
async fn upload_multipart_file(
    client: &reqwest::Client,
    access_token: &str,
    folder_id: &str,
    name: &str,
    content: &[u8],
    mime_type: &str,
) -> Result<(), String> {
    let mut boundary_bytes = [0u8; 8];
    rand::thread_rng().fill(&mut boundary_bytes);
    let boundary = format!("----formdata-{}", hex::encode(boundary_bytes));

    let metadata = json!({
        "name": name,
        "parents": [folder_id]
    })
    .to_string();

    let mut body = Vec::new();
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(b"Content-Type: application/json; charset=UTF-8\r\n\r\n");
    body.extend_from_slice(metadata.as_bytes());
    body.extend_from_slice(format!("\r\n--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(format!("Content-Type: {}\r\n\r\n", mime_type).as_bytes());
    body.extend_from_slice(content);
    body.extend_from_slice(format!("\r\n--{}--\r\n", boundary).as_bytes());

    let url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
    let resp = client
        .post(url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header(
            "Content-Type",
            format!("multipart/related; boundary={}", boundary),
        )
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Gagal mengunggah file {}: {}", name, e))?;

    if !resp.status().is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("Gagal upload {}: {}", name, err_text));
    }

    Ok(())
}

/// Helper untuk upload snapshot JSON dan screenshot ke Google Drive Cloud
async fn upload_to_gdrive(
    access_token: &str,
    date_str: &str,
    snapshot_bytes: &[u8],
    db_path: &Path,
) -> Result<(usize, usize, String), String> {
    let client = reqwest::Client::new();
    let folder_id = ensure_backup_folder(&client, access_token).await?;

    let snapshot_name = format!("trading-journal-{}.json", date_str);
    upload_multipart_file(
        &client,
        access_token,
        &folder_id,
        &snapshot_name,
        snapshot_bytes,
        "application/json",
    )
    .await?;

    let mut count = 1;
    let mut total_bytes = snapshot_bytes.len();

    let screenshot_dir = get_screenshot_dir(db_path);
    if screenshot_dir.exists() {
        if let Ok(entries) = fs::read_dir(&screenshot_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() {
                    if let Ok(data) = fs::read(&p) {
                        let fname = entry.file_name().to_string_lossy().to_string();
                        let mime = if fname.ends_with(".png") {
                            "image/png"
                        } else if fname.ends_with(".jpg") || fname.ends_with(".jpeg") {
                            "image/jpeg"
                        } else if fname.ends_with(".webp") {
                            "image/webp"
                        } else {
                            "application/octet-stream"
                        };

                        if upload_multipart_file(&client, access_token, &folder_id, &fname, &data, mime).await.is_ok() {
                            count += 1;
                            total_bytes += data.len();
                        }
                    }
                }
            }
        }
    }

    Ok((count, total_bytes, folder_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_date_ymd() {
        let d = format_date_ymd(1704067200000);
        assert_eq!(d, "2024-01-01");
    }

    #[test]
    fn test_pkce_generation() {
        let (verifier, challenge) = generate_pkce();
        assert!(!verifier.is_empty());
        assert!(!challenge.is_empty());
        assert_ne!(verifier, challenge);
    }
}
