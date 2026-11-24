use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::Path;

const KEY_CHECK_PLAINTEXT: &[u8] = b"nitirekso-vault-key-v1";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultMeta {
    pub version: u32,
    pub kdf: String,
    pub salt_b64: String,
    pub key_check_b64: String,
}

pub fn derive_key_from_passphrase(passphrase: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let trimmed = passphrase.trim();
    if trimmed.len() < 4 {
        return Err("Vault Passphrase minimal 4 karakter.".to_string());
    }

    // Parameter Argon2id yang aman namun tetap cepat pada perangkat mobile maupun desktop
    let params = Params::new(19 * 1024, 2, 1, Some(32))
        .map_err(|e| format!("Konfigurasi Argon2id gagal: {}", e))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut key = [0u8; 32];
    argon2
        .hash_password_into(trimmed.as_bytes(), salt, &mut key)
        .map_err(|e| format!("Gagal menurunkan kunci dari Vault Passphrase: {}", e))?;

    Ok(key)
}

pub fn create_vault_meta(passphrase: &str) -> Result<(VaultMeta, [u8; 32]), String> {
    let mut salt = [0u8; 16];
    rand::thread_rng().fill(&mut salt);

    let master_key = derive_key_from_passphrase(passphrase, &salt)?;
    let key_check_b64 = encrypt_bytes_b64(&master_key, KEY_CHECK_PLAINTEXT)?;

    let meta = VaultMeta {
        version: 1,
        kdf: "argon2id".to_string(),
        salt_b64: BASE64.encode(salt),
        key_check_b64,
    };

    Ok((meta, master_key))
}

pub fn unlock_vault_meta(meta: &VaultMeta, passphrase: &str) -> Result<[u8; 32], String> {
    let salt = BASE64
        .decode(&meta.salt_b64)
        .map_err(|_| "Salt pada vault.json rusak.".to_string())?;
    let master_key = derive_key_from_passphrase(passphrase, &salt)?;

    let decrypted = decrypt_bytes_b64(&master_key, &meta.key_check_b64)
        .map_err(|_| "Vault Passphrase salah untuk Sync Vault ini.".to_string())?;

    if decrypted.as_slice() != KEY_CHECK_PLAINTEXT {
        return Err("Vault Passphrase salah untuk Sync Vault ini.".to_string());
    }

    Ok(master_key)
}

pub fn encrypt_bytes_b64(key: &[u8; 32], plaintext: &[u8]) -> Result<String, String> {
    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|e| format!("Inisialisasi AES gagal: {}", e))?;
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| format!("Enkripsi gagal: {}", e))?;

    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(BASE64.encode(combined))
}

pub fn decrypt_bytes_b64(key: &[u8; 32], payload_b64: &str) -> Result<Vec<u8>, String> {
    let raw = BASE64
        .decode(payload_b64)
        .map_err(|_| "Payload terenkripsi tidak valid.".to_string())?;
    if raw.len() < 12 {
        return Err("Payload terenkripsi terlalu pendek.".to_string());
    }
    let (nonce_bytes, ciphertext) = raw.split_at(12);
    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|e| format!("Inisialisasi AES gagal: {}", e))?;
    let nonce = Nonce::from_slice(nonce_bytes);

    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Dekripsi gagal: kunci tidak cocok.".to_string())
}

/// Memuat atau membuat secret acak 32-byte di berkas lokal terpisah dari SQLite (`.device-secret`)
/// sehingga salinan file `.sqlite` saja tidak cukup untuk membuka `vault_master_key_enc`.
/// Pada Android, secret disimpan terbungkus oleh Android Keystore (hardware-backed AES-GCM).
pub fn load_or_create_device_secret(db_path: &Path) -> [u8; 32] {
    if db_path.as_os_str().is_empty() || db_path == Path::new(":memory:") {
        let mut fallback = [0u8; 32];
        fallback.copy_from_slice(b"nitirekso-in-memory-test-secret!");
        return fallback;
    }

    let dir = db_path.parent().unwrap_or(Path::new("."));
    let _ = std::fs::create_dir_all(dir);

    #[cfg(target_os = "android")]
    {
        let ks_path = dir.join(".device-secret.ks");
        if let Some(app) = crate::android_bridge::global_app_handle() {
            if let Ok(wrapped_b64) = std::fs::read_to_string(&ks_path) {
                if let Ok(unwrapped) = crate::android_bridge::unwrap_secret(app, wrapped_b64.trim()) {
                    if unwrapped.len() == 32 {
                        let mut out = [0u8; 32];
                        out.copy_from_slice(&unwrapped);
                        return out;
                    }
                }
            }

            // Jika sebelumnya ada .device-secret mentah, bungkus dengan Android Keystore lalu hapus file mentah
            let legacy_secret_path = dir.join(".device-secret");
            let mut secret = [0u8; 32];
            let mut loaded_legacy = false;
            if let Ok(raw) = std::fs::read(&legacy_secret_path) {
                if raw.len() == 32 {
                    secret.copy_from_slice(&raw);
                    loaded_legacy = true;
                }
            }
            if !loaded_legacy {
                rand::thread_rng().fill(&mut secret);
            }

            if let Ok(wrapped_b64) = crate::android_bridge::wrap_secret(app, &secret) {
                if std::fs::write(&ks_path, wrapped_b64.as_bytes()).is_ok() {
                    if loaded_legacy {
                        let _ = std::fs::remove_file(&legacy_secret_path);
                    }
                    return secret;
                }
            }
        }
    }

    let secret_path = dir.join(".device-secret");

    if let Ok(raw) = std::fs::read(&secret_path) {
        if raw.len() == 32 {
            let mut out = [0u8; 32];
            out.copy_from_slice(&raw);
            return out;
        }
    }

    let mut secret = [0u8; 32];
    rand::thread_rng().fill(&mut secret);
    let _ = std::fs::write(&secret_path, &secret);

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(&secret_path) {
            let mut perms = meta.permissions();
            perms.set_mode(0o600);
            let _ = std::fs::set_permissions(&secret_path, perms);
        }
    }

    secret
}

/// Mengambil atau membuat device secret menggunakan lokasi database aplikasi aktif.
pub fn load_or_create_app_device_secret() -> [u8; 32] {
    let db_path = crate::db::get_db_path();
    load_or_create_device_secret(&db_path)
}

/// Kunci pembungkus lokal per perangkat agar Vault Passphrase cukup dimasukkan satu kali di perangkat ini.
fn derive_device_wrap_key(device_id: &str, device_secret: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(device_secret);
    hasher.update(device_id.as_bytes());
    hasher.update(b"_nitirekso_device_local_key_wrap_v2_");
    let digest = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&digest);
    key
}

pub fn wrap_master_key_for_device(
    db_path: &Path,
    device_id: &str,
    master_key: &[u8; 32],
) -> Result<String, String> {
    let secret = load_or_create_device_secret(db_path);
    let wrap_key = derive_device_wrap_key(device_id, &secret);
    encrypt_bytes_b64(&wrap_key, master_key)
}

pub fn unwrap_master_key_for_device(
    db_path: &Path,
    device_id: &str,
    wrapped_b64: &str,
) -> Option<[u8; 32]> {
    let secret = load_or_create_device_secret(db_path);
    let wrap_key = derive_device_wrap_key(device_id, &secret);
    let bytes = decrypt_bytes_b64(&wrap_key, wrapped_b64).ok()?;
    if bytes.len() != 32 {
        return None;
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes);
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vault_passphrase_roundtrip_and_wrong_passphrase() {
        let (meta, mk) = create_vault_meta("sandi-rahasia-2026").unwrap();
        let unlocked = unlock_vault_meta(&meta, "sandi-rahasia-2026").unwrap();
        assert_eq!(mk, unlocked);

        let wrong = unlock_vault_meta(&meta, "sandi-salah");
        assert!(wrong.is_err());

        let mem_path = Path::new(":memory:");
        let wrapped = wrap_master_key_for_device(mem_path, "dev-1", &mk).unwrap();
        let unwrapped = unwrap_master_key_for_device(mem_path, "dev-1", &wrapped).unwrap();
        assert_eq!(mk, unwrapped);

        let enc = encrypt_bytes_b64(&mk, b"api-secret-xyz").unwrap();
        let dec = decrypt_bytes_b64(&unlocked, &enc).unwrap();
        assert_eq!(dec, b"api-secret-xyz");
    }
}
