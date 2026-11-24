use crate::commands::video::extract_raw_or_json_array_bytes;
use crate::db::DbState;
use crate::media::{
    get_media_record, read_media_bytes_for_sync, read_media_data_url,
    save_media_asset as media_save, soft_delete_media_asset, MediaAssetInfo, MediaUploadPayload,
};
use crate::models::MutationResult;
use crate::vault::VaultState;
use tauri::ipc::{InvokeBody, Request};
use tauri::State;

fn extract_media_header(request: &Request<'_>, name: &str) -> Option<String> {
    request
        .headers()
        .get(name)
        .and_then(|h| h.to_str().ok())
        .map(|s| {
            urlencoding::decode(s)
                .map(|cow| cow.into_owned())
                .unwrap_or_else(|_| s.to_string())
        })
        .filter(|s| !s.trim().is_empty())
}

fn parse_media_upload_payload(
    body: &InvokeBody,
    header_kind: Option<String>,
    header_file_name: Option<String>,
) -> Result<MediaUploadPayload, String> {
    match body {
        InvokeBody::Raw(_) | InvokeBody::Json(serde_json::Value::Array(_)) => {
            let data = extract_raw_or_json_array_bytes(body)?;
            Ok(MediaUploadPayload {
                kind: header_kind.unwrap_or_else(|| "share_media".to_string()),
                file_name: header_file_name.unwrap_or_else(|| "media.png".to_string()),
                data,
            })
        }
        InvokeBody::Json(val) => {
            let target = val.get("payload").unwrap_or(val);
            serde_json::from_value::<MediaUploadPayload>(target.clone())
                .map_err(|e| format!("Gagal mem-parse payload media: {}", e))
        }
    }
}

#[tauri::command]
pub fn save_media_asset(
    db: State<'_, DbState>,
    vault: State<'_, VaultState>,
    request: Request<'_>,
) -> MutationResult<MediaAssetInfo> {
    let payload = match parse_media_upload_payload(
        request.body(),
        extract_media_header(&request, "x-media-kind"),
        extract_media_header(&request, "x-file-name"),
    ) {
        Ok(p) => p,
        Err(e) => return MutationResult::fail(e),
    };

    let conn = db.conn.lock().unwrap();
    match media_save(&conn, &db.db_path, &payload) {
        Ok(info) => {
            if let Ok(Some(bytes)) = read_media_bytes_for_sync(&db.db_path, &info.sha256, &info.ext) {
                let _ = vault.emit_media_upsert(&conn, &info.sha256, Some(&bytes));
            }
            MutationResult::success(info)
        }
        Err(e) => MutationResult::fail(e),
    }
}

#[tauri::command]
pub fn get_media_asset(db: State<'_, DbState>, sha256: String) -> MutationResult<String> {
    let conn = db.conn.lock().unwrap();
    match read_media_data_url(&conn, &db.db_path, &sha256) {
        Ok(data_url) => MutationResult::success(data_url),
        Err(e) => MutationResult::fail(e),
    }
}

#[tauri::command]
pub fn delete_media_asset(
    db: State<'_, DbState>,
    vault: State<'_, VaultState>,
    sha256: String,
) -> MutationResult<()> {
    let conn = db.conn.lock().unwrap();
    match soft_delete_media_asset(&conn, &sha256) {
        Ok(changed) => {
            if changed {
                if get_media_record(&conn, &sha256).is_some() {
                    let _ = vault.emit_media_upsert(&conn, &sha256, None);
                }
            }
            MutationResult::ok_unit()
        }
        Err(e) => MutationResult::fail(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_media_upload_payload_handles_raw_and_json_byte_array() {
        // Repro nyata SHARE_PNL_ERR_004: WebKitGTK mengirim JPEG Uint8Array sebagai JSON byte array [255, 216, ...]
        let json_array_body = InvokeBody::Json(serde_json::json!([255, 216, 255, 224]));
        let parsed = parse_media_upload_payload(
            &json_array_body,
            Some("share_media".to_string()),
            Some("ts.jpg".to_string()),
        )
        .expect("JSON byte array harus diterima");
        assert_eq!(parsed.kind, "share_media");
        assert_eq!(parsed.file_name, "ts.jpg");
        assert_eq!(parsed.data, vec![0xFF, 0xD8, 0xFF, 0xE0]);

        // Jalur Raw binary
        let raw_body = InvokeBody::Raw(vec![0x89, 0x50, 0x4E, 0x47]);
        let parsed_raw = parse_media_upload_payload(
            &raw_body,
            Some("share_media".to_string()),
            Some("avatarUrl.png".to_string()),
        )
        .expect("Raw binary harus diterima");
        assert_eq!(parsed_raw.data, vec![0x89, 0x50, 0x4E, 0x47]);

        // Jalur kompatibilitas mundur JSON struct
        let legacy_json = InvokeBody::Json(serde_json::json!({
            "payload": {
                "kind": "exchange_logo",
                "fileName": "logo.png",
                "data": [137, 80, 78, 71]
            }
        }));
        let parsed_legacy = parse_media_upload_payload(&legacy_json, None, None)
            .expect("Legacy JSON struct harus tetap diterima");
        assert_eq!(parsed_legacy.kind, "exchange_logo");
        assert_eq!(parsed_legacy.file_name, "logo.png");
        assert_eq!(parsed_legacy.data, vec![137, 80, 78, 71]);
    }
}
