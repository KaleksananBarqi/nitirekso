use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;

pub const SUPPORTED_EXCHANGES: &[&str] = &["mexc", "bitunix", "bybit", "binance", "bingx"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeCredentials {
    pub api_key: String,
    pub api_secret: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialStatus {
    pub exchange: String,
    pub configured: bool,
    pub key_hint: Option<String>,
    pub updated_at: Option<i64>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredCredentialFile {
    payload: String,
    updated_at: i64,
    key_hint: String,
}

fn credentials_dir() -> PathBuf {
    if let Some(appdata) = dirs::data_dir() {
        let dir = appdata.join("nitirekso").join("credentials");
        let _ = fs::create_dir_all(&dir);
        dir
    } else {
        let dir = PathBuf::from("credentials");
        let _ = fs::create_dir_all(&dir);
        dir
    }
}

fn credential_path(exchange: &str) -> PathBuf {
    credentials_dir().join(format!("{}.bin", exchange))
}

fn derive_key() -> [u8; 32] {
    let mut hasher = Sha256::new();
    let user = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "default_user".to_string());
    hasher.update(user.as_bytes());
    hasher.update(b"_nitirekso_vault_master_salt_2026_");
    let result = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&result);
    key
}

pub fn make_key_hint(api_key: &str) -> String {
    let trimmed = api_key.trim();
    if trimmed.len() <= 8 {
        "••••".to_string()
    } else {
        format!("{}…{}", &trimmed[..4], &trimmed[trimmed.len() - 4..])
    }
}

pub fn get_status(exchange: &str) -> CredentialStatus {
    let path = credential_path(exchange);
    if !path.exists() {
        return CredentialStatus {
            exchange: exchange.to_string(),
            configured: false,
            key_hint: None,
            updated_at: None,
        };
    }

    match fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str::<StoredCredentialFile>(&content) {
            Ok(stored) => CredentialStatus {
                exchange: exchange.to_string(),
                configured: true,
                key_hint: Some(stored.key_hint),
                updated_at: Some(stored.updated_at),
            },
            Err(_) => CredentialStatus {
                exchange: exchange.to_string(),
                configured: true,
                key_hint: None,
                updated_at: None,
            },
        },
        Err(_) => CredentialStatus {
            exchange: exchange.to_string(),
            configured: false,
            key_hint: None,
            updated_at: None,
        },
    }
}

pub fn save_credentials(
    exchange: &str,
    api_key: &str,
    api_secret: &str,
) -> Result<(), String> {
    let key = api_key.trim();
    let secret = api_secret.trim();

    if key.is_empty() || secret.is_empty() {
        return Err("API Key dan Secret tidak boleh kosong".to_string());
    }

    let creds = ExchangeCredentials {
        api_key: key.to_string(),
        api_secret: secret.to_string(),
    };

    let serialized = serde_json::to_vec(&creds)
        .map_err(|e| format!("Gagal serialisasi kredensial: {}", e))?;

    let cipher_key = derive_key();
    let cipher = Aes256Gcm::new_from_slice(&cipher_key)
        .map_err(|e| format!("Inisialisasi AES gagal: {}", e))?;

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, serialized.as_ref())
        .map_err(|e| format!("Enkripsi gagal: {}", e))?;

    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);
    let payload = BASE64.encode(combined);

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let stored = StoredCredentialFile {
        payload,
        updated_at: now,
        key_hint: make_key_hint(key),
    };

    let json_content = serde_json::to_string_pretty(&stored)
        .map_err(|e| format!("Serialisasi file gagal: {}", e))?;

    let path = credential_path(exchange);
    fs::write(&path, json_content)
        .map_err(|e| format!("Gagal menyimpan file kredensial: {}", e))?;

    log::info!("[keystore] Kredensial untuk exchange {} berhasil disimpan", exchange);
    Ok(())
}

pub fn load_credentials(exchange: &str) -> Option<ExchangeCredentials> {
    let path = credential_path(exchange);
    if !path.exists() {
        return None;
    }

    let content = fs::read_to_string(&path).ok()?;
    let stored = serde_json::from_str::<StoredCredentialFile>(&content).ok()?;
    let raw_bytes = BASE64.decode(stored.payload).ok()?;

    if raw_bytes.len() < 12 {
        return None;
    }

    let (nonce_bytes, ciphertext) = raw_bytes.split_at(12);
    let cipher_key = derive_key();
    let cipher = Aes256Gcm::new_from_slice(&cipher_key).ok()?;
    let nonce = Nonce::from_slice(nonce_bytes);

    let decrypted = cipher.decrypt(nonce, ciphertext).ok()?;
    serde_json::from_slice::<ExchangeCredentials>(&decrypted).ok()
}

pub fn delete_credentials(exchange: &str) -> Result<(), String> {
    let path = credential_path(exchange);
    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("Gagal menghapus kredensial: {}", e))?;
    }
    Ok(())
}

pub fn get_all_statuses() -> Vec<CredentialStatus> {
    SUPPORTED_EXCHANGES.iter().map(|&ex| get_status(ex)).collect()
}

// ---------------------------------------------------------------------------
// AI Keystore (OpenAI-compatible API key)
// ---------------------------------------------------------------------------

const AI_CREDENTIAL_NAME: &str = "ai_openai";

pub fn save_ai_api_key(api_key: &str) -> Result<(), String> {
    let key = api_key.trim();
    if key.is_empty() {
        return Err("API key AI tidak boleh kosong".to_string());
    }

    let serialized = key.as_bytes();
    let cipher_key = derive_key();
    let cipher = Aes256Gcm::new_from_slice(&cipher_key)
        .map_err(|e| format!("Inisialisasi AES gagal: {}", e))?;

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, serialized)
        .map_err(|e| format!("Enkripsi gagal: {}", e))?;

    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);
    let payload = BASE64.encode(combined);

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let stored = StoredCredentialFile {
        payload,
        updated_at: now,
        key_hint: make_key_hint(key),
    };

    let json_content = serde_json::to_string_pretty(&stored)
        .map_err(|e| format!("Serialisasi file gagal: {}", e))?;

    let path = credential_path(AI_CREDENTIAL_NAME);
    fs::write(&path, json_content)
        .map_err(|e| format!("Gagal menyimpan API key AI: {}", e))?;

    log::info!("[keystore] API Key AI berhasil disimpan");
    Ok(())
}

pub fn load_ai_api_key() -> Option<String> {
    let path = credential_path(AI_CREDENTIAL_NAME);
    if !path.exists() {
        return None;
    }

    let content = fs::read_to_string(&path).ok()?;
    let stored = serde_json::from_str::<StoredCredentialFile>(&content).ok()?;
    let raw_bytes = BASE64.decode(stored.payload).ok()?;

    if raw_bytes.len() < 12 {
        return None;
    }

    let (nonce_bytes, ciphertext) = raw_bytes.split_at(12);
    let cipher_key = derive_key();
    let cipher = Aes256Gcm::new_from_slice(&cipher_key).ok()?;
    let nonce = Nonce::from_slice(nonce_bytes);

    let decrypted = cipher.decrypt(nonce, ciphertext).ok()?;
    String::from_utf8(decrypted).ok()
}

pub fn delete_ai_api_key() -> Result<(), String> {
    let path = credential_path(AI_CREDENTIAL_NAME);
    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("Gagal menghapus API key AI: {}", e))?;
    }
    Ok(())
}

pub fn get_ai_key_hint() -> Option<String> {
    let path = credential_path(AI_CREDENTIAL_NAME);
    if !path.exists() {
        return None;
    }
    let content = fs::read_to_string(&path).ok()?;
    let stored = serde_json::from_str::<StoredCredentialFile>(&content).ok()?;
    Some(stored.key_hint)
}

// ---------------------------------------------------------------------------
// Google Drive Token Keystore (OAuth token)
// ---------------------------------------------------------------------------

const GDRIVE_CREDENTIAL_NAME: &str = "gdrive_oauth";

pub fn save_gdrive_token(token_json: &str) -> Result<(), String> {
    let trimmed = token_json.trim();
    if trimmed.is_empty() {
        return Err("Token Google Drive tidak boleh kosong".to_string());
    }

    let cipher_key = derive_key();
    let cipher = Aes256Gcm::new_from_slice(&cipher_key)
        .map_err(|e| format!("Inisialisasi AES gagal: {}", e))?;

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, trimmed.as_bytes())
        .map_err(|e| format!("Enkripsi gagal: {}", e))?;

    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);
    let payload = BASE64.encode(combined);

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let stored = StoredCredentialFile {
        payload,
        updated_at: now,
        key_hint: "gdrive_token".to_string(),
    };

    let json_content = serde_json::to_string_pretty(&stored)
        .map_err(|e| format!("Serialisasi file gagal: {}", e))?;

    let path = credential_path(GDRIVE_CREDENTIAL_NAME);
    fs::write(&path, json_content)
        .map_err(|e| format!("Gagal menyimpan token Google Drive: {}", e))?;

    log::info!("[keystore] Token Google Drive berhasil disimpan");
    Ok(())
}

pub fn load_gdrive_token() -> Option<String> {
    let path = credential_path(GDRIVE_CREDENTIAL_NAME);
    if !path.exists() {
        return None;
    }

    let content = fs::read_to_string(&path).ok()?;
    let stored = serde_json::from_str::<StoredCredentialFile>(&content).ok()?;
    let raw_bytes = BASE64.decode(stored.payload).ok()?;

    if raw_bytes.len() < 12 {
        return None;
    }

    let (nonce_bytes, ciphertext) = raw_bytes.split_at(12);
    let cipher_key = derive_key();
    let cipher = Aes256Gcm::new_from_slice(&cipher_key).ok()?;
    let nonce = Nonce::from_slice(nonce_bytes);

    let decrypted = cipher.decrypt(nonce, ciphertext).ok()?;
    String::from_utf8(decrypted).ok()
}

pub fn delete_gdrive_token() -> Result<(), String> {
    let path = credential_path(GDRIVE_CREDENTIAL_NAME);
    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("Gagal menghapus token Google Drive: {}", e))?;
    }
    Ok(())
}
