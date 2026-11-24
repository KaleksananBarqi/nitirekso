#[cfg(target_os = "android")]
mod android_impl {
    use serde::{Deserialize, Serialize};
    use std::path::Path;
    use std::sync::OnceLock;
    use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
    use tauri::{AppHandle, Manager, Wry};

    pub struct AndroidPluginState(pub PluginHandle<Wry>);
    static ANDROID_APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct EmptyArgs {}

    #[derive(Debug, Clone, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct PickTreeResponse {
        pub uri: Option<String>,
        pub display_name: Option<String>,
    }

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct TreeUriArgs<'a> {
        tree_uri: &'a str,
    }

    #[derive(Debug, Clone, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct DisplayNameResponse {
        display_name: Option<String>,
    }

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct EnsureLayoutArgs<'a> {
        tree_uri: &'a str,
        device_id: &'a str,
    }

    #[derive(Debug, Clone, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ContentB64Response {
        content_b64: Option<String>,
    }

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct WriteMetaArgs<'a> {
        tree_uri: &'a str,
        content_b64: &'a str,
    }

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ListRemoteOpArgs<'a> {
        tree_uri: &'a str,
        local_device_id: &'a str,
    }

    #[derive(Debug, Clone, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SafOpFileItem {
        pub device_id: String,
        pub file_name: String,
    }

    #[derive(Debug, Clone, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ListRemoteOpResponse {
        files: Vec<SafOpFileItem>,
    }

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ReadOpLinesArgs<'a> {
        tree_uri: &'a str,
        device_id: &'a str,
        file_name: &'a str,
        from_line: usize,
    }

    #[derive(Debug, Clone, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ReadOpLineEntry {
        index: usize,
        line: String,
    }

    #[derive(Debug, Clone, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ReadOpLinesResponse {
        lines: Vec<ReadOpLineEntry>,
        total_seen: usize,
    }

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct AppendOpLinesArgs<'a> {
        tree_uri: &'a str,
        device_id: &'a str,
        date_str: &'a str,
        max_file_bytes: u64,
        lines: &'a [String],
    }

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct MediaFileArgs<'a> {
        tree_uri: &'a str,
        file_name: &'a str,
    }

    #[derive(Debug, Clone, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ExistsResponse {
        exists: bool,
    }

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct WriteMediaArgs<'a> {
        tree_uri: &'a str,
        file_name: &'a str,
        content_b64: &'a str,
    }

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct WriteSnapshotArgs<'a> {
        tree_uri: &'a str,
        snapshot_folder_name: &'a str,
        source_dir_path: &'a str,
    }

    #[derive(Debug, Clone, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SnapshotWriteResponse {
        pub files_written: usize,
        pub bytes_written: usize,
    }

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct CopyTreeArgs<'a> {
        tree_uri: &'a str,
        dest_dir_path: &'a str,
    }

    #[derive(Debug, Clone, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct CopyTreeResponse {
        pub files_copied: usize,
        pub display_name: Option<String>,
    }

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct CopyImageArgs<'a> {
        source_path: &'a str,
        mime_type: &'a str,
    }

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct PrintHtmlArgs<'a> {
        html: &'a str,
        job_name: &'a str,
    }

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct MuxArgs<'a> {
        video_path: &'a str,
        audio_path: Option<&'a str>,
        output_path: &'a str,
    }

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct SaveMediaStoreArgs<'a> {
        source_path: &'a str,
        file_name: &'a str,
        mime_type: &'a str,
        collection: &'a str,
    }

    #[derive(Debug, Clone, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct SaveMediaStoreResponse {
        saved_location: String,
    }

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ShareFileArgs<'a> {
        source_path: &'a str,
        mime_type: &'a str,
        title: &'a str,
    }

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct WrapSecretArgs<'a> {
        plaintext_b64: &'a str,
    }

    #[derive(Debug, Clone, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct WrapSecretResponse {
        ciphertext_b64: String,
    }

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct UnwrapSecretArgs<'a> {
        ciphertext_b64: &'a str,
    }

    #[derive(Debug, Clone, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct UnwrapSecretResponse {
        plaintext_b64: String,
    }

    pub fn init_plugin() -> TauriPlugin<Wry> {
        Builder::new("nitirekso-android")
            .setup(|app, api| {
                let handle =
                    api.register_android_plugin("com.nitirekso.app", "NitireksoAndroidPlugin")?;
                app.manage(AndroidPluginState(handle));
                let _ = ANDROID_APP_HANDLE.set(app.clone());
                Ok(())
            })
            .build()
    }

    pub fn global_app_handle() -> Option<&'static AppHandle> {
        ANDROID_APP_HANDLE.get()
    }

    fn plugin(app: &AppHandle) -> Result<&PluginHandle<Wry>, String> {
        app.try_state::<AndroidPluginState>()
            .map(|s| &s.inner().0)
            .ok_or_else(|| "Plugin Android nitirekso belum terinisialisasi.".to_string())
    }

    pub fn pick_directory_tree(app: &AppHandle) -> Result<PickTreeResponse, String> {
        plugin(app)?
            .run_mobile_plugin("pickDirectoryTree", EmptyArgs {})
            .map_err(|e| format!("Gagal membuka pemilih folder Android: {}", e))
    }

    pub fn get_tree_display_name(app: &AppHandle, tree_uri: &str) -> Option<String> {
        plugin(app)
            .ok()?
            .run_mobile_plugin::<DisplayNameResponse>("getTreeDisplayName", TreeUriArgs { tree_uri })
            .ok()
            .and_then(|r| r.display_name)
    }

    pub fn saf_ensure_layout(app: &AppHandle, tree_uri: &str, device_id: &str) -> Result<(), String> {
        let _: serde_json::Value = plugin(app)?
            .run_mobile_plugin("safEnsureLayout", EnsureLayoutArgs { tree_uri, device_id })
            .map_err(|e| format!("Gagal menyiapkan struktur Sync Vault SAF: {}", e))?;
        Ok(())
    }

    pub fn saf_read_meta(app: &AppHandle, tree_uri: &str) -> Result<Option<Vec<u8>>, String> {
        use base64::engine::general_purpose::STANDARD as BASE64;
        use base64::Engine;
        let res: ContentB64Response = plugin(app)?
            .run_mobile_plugin("safReadMeta", TreeUriArgs { tree_uri })
            .map_err(|e| format!("Gagal membaca vault.json dari SAF: {}", e))?;
        match res.content_b64 {
            Some(b64) if !b64.is_empty() => BASE64
                .decode(b64)
                .map(Some)
                .map_err(|e| format!("Gagal decode vault.json SAF: {}", e)),
            _ => Ok(None),
        }
    }

    pub fn saf_write_meta(app: &AppHandle, tree_uri: &str, data: &[u8]) -> Result<(), String> {
        use base64::engine::general_purpose::STANDARD as BASE64;
        use base64::Engine;
        let encoded = BASE64.encode(data);
        let _: serde_json::Value = plugin(app)?
            .run_mobile_plugin(
                "safWriteMeta",
                WriteMetaArgs {
                    tree_uri,
                    content_b64: &encoded,
                },
            )
            .map_err(|e| format!("Gagal menulis vault.json ke SAF: {}", e))?;
        Ok(())
    }

    pub fn saf_list_remote_op_files(
        app: &AppHandle,
        tree_uri: &str,
        local_device_id: &str,
    ) -> Result<Vec<SafOpFileItem>, String> {
        let res: ListRemoteOpResponse = plugin(app)?
            .run_mobile_plugin(
                "safListRemoteOpFiles",
                ListRemoteOpArgs {
                    tree_uri,
                    local_device_id,
                },
            )
            .map_err(|e| format!("Gagal membaca daftar op-log SAF: {}", e))?;
        Ok(res.files)
    }

    pub fn saf_read_op_lines(
        app: &AppHandle,
        tree_uri: &str,
        device_id: &str,
        file_name: &str,
        from_line: usize,
    ) -> Result<(Vec<(usize, String)>, usize), String> {
        let res: ReadOpLinesResponse = plugin(app)?
            .run_mobile_plugin(
                "safReadOpLines",
                ReadOpLinesArgs {
                    tree_uri,
                    device_id,
                    file_name,
                    from_line,
                },
            )
            .map_err(|e| format!("Gagal membaca baris op-log SAF: {}", e))?;
        let lines = res
            .lines
            .into_iter()
            .map(|entry| (entry.index, entry.line))
            .collect();
        Ok((lines, res.total_seen))
    }

    pub fn saf_append_op_lines(
        app: &AppHandle,
        tree_uri: &str,
        device_id: &str,
        date_str: &str,
        max_file_bytes: u64,
        lines: &[String],
    ) -> Result<(), String> {
        let _: serde_json::Value = plugin(app)?
            .run_mobile_plugin(
                "safAppendOpLines",
                AppendOpLinesArgs {
                    tree_uri,
                    device_id,
                    date_str,
                    max_file_bytes,
                    lines,
                },
            )
            .map_err(|e| format!("Gagal menulis op-log ke SAF: {}", e))?;
        Ok(())
    }

    pub fn saf_has_media(app: &AppHandle, tree_uri: &str, file_name: &str) -> bool {
        plugin(app)
            .ok()
            .and_then(|p| {
                p.run_mobile_plugin::<ExistsResponse>(
                    "safHasMedia",
                    MediaFileArgs {
                        tree_uri,
                        file_name,
                    },
                )
                .ok()
            })
            .map(|r| r.exists)
            .unwrap_or(false)
    }

    pub fn saf_write_media(
        app: &AppHandle,
        tree_uri: &str,
        file_name: &str,
        bytes: &[u8],
    ) -> Result<(), String> {
        use base64::engine::general_purpose::STANDARD as BASE64;
        use base64::Engine;
        let encoded = BASE64.encode(bytes);
        let _: serde_json::Value = plugin(app)?
            .run_mobile_plugin(
                "safWriteMedia",
                WriteMediaArgs {
                    tree_uri,
                    file_name,
                    content_b64: &encoded,
                },
            )
            .map_err(|e| format!("Gagal menulis media ke SAF: {}", e))?;
        Ok(())
    }

    pub fn saf_read_media(
        app: &AppHandle,
        tree_uri: &str,
        file_name: &str,
    ) -> Result<Option<Vec<u8>>, String> {
        use base64::engine::general_purpose::STANDARD as BASE64;
        use base64::Engine;
        let res: ContentB64Response = plugin(app)?
            .run_mobile_plugin(
                "safReadMedia",
                MediaFileArgs {
                    tree_uri,
                    file_name,
                },
            )
            .map_err(|e| format!("Gagal membaca media dari SAF: {}", e))?;
        match res.content_b64 {
            Some(b64) if !b64.is_empty() => BASE64
                .decode(b64)
                .map(Some)
                .map_err(|e| format!("Gagal decode media SAF: {}", e)),
            _ => Ok(None),
        }
    }

    pub fn saf_write_snapshot_dir(
        app: &AppHandle,
        tree_uri: &str,
        snapshot_folder_name: &str,
        source_dir: &Path,
    ) -> Result<SnapshotWriteResponse, String> {
        let source_dir_path = source_dir.to_string_lossy().to_string();
        plugin(app)?
            .run_mobile_plugin(
                "safWriteSnapshotDir",
                WriteSnapshotArgs {
                    tree_uri,
                    snapshot_folder_name,
                    source_dir_path: &source_dir_path,
                },
            )
            .map_err(|e| format!("Gagal menyalin Local Snapshot ke folder SAF: {}", e))
    }

    pub fn saf_copy_tree_to_dir(
        app: &AppHandle,
        tree_uri: &str,
        dest_dir: &Path,
    ) -> Result<CopyTreeResponse, String> {
        let dest_dir_path = dest_dir.to_string_lossy().to_string();
        plugin(app)?
            .run_mobile_plugin(
                "safCopyTreeToDir",
                CopyTreeArgs {
                    tree_uri,
                    dest_dir_path: &dest_dir_path,
                },
            )
            .map_err(|e| format!("Gagal menyalin berkas snapshot dari SAF: {}", e))
    }

    pub fn mux_audio_video_mp4(
        app: &AppHandle,
        video_path: &Path,
        audio_path: Option<&Path>,
        output_path: &Path,
    ) -> Result<(), String> {
        let v_str = video_path.to_string_lossy().to_string();
        let a_str = audio_path.map(|p| p.to_string_lossy().to_string());
        let o_str = output_path.to_string_lossy().to_string();
        let _: serde_json::Value = plugin(app)?
            .run_mobile_plugin(
                "muxAudioVideoMp4",
                MuxArgs {
                    video_path: &v_str,
                    audio_path: a_str.as_deref(),
                    output_path: &o_str,
                },
            )
            .map_err(|e| format!("Gagal muxing MP4 via Android MediaMuxer: {}", e))?;
        Ok(())
    }

    pub fn save_to_media_store(
        app: &AppHandle,
        source_path: &Path,
        file_name: &str,
        mime_type: &str,
        collection: &str,
    ) -> Result<String, String> {
        let s_str = source_path.to_string_lossy().to_string();
        let res: SaveMediaStoreResponse = plugin(app)?
            .run_mobile_plugin(
                "saveToMediaStore",
                SaveMediaStoreArgs {
                    source_path: &s_str,
                    file_name,
                    mime_type,
                    collection,
                },
            )
            .map_err(|e| format!("Gagal menyimpan berkas ke MediaStore Android: {}", e))?;
        Ok(res.saved_location)
    }

    pub fn share_file(
        app: &AppHandle,
        source_path: &Path,
        mime_type: &str,
        title: &str,
    ) -> Result<(), String> {
        let s_str = source_path.to_string_lossy().to_string();
        let _: serde_json::Value = plugin(app)?
            .run_mobile_plugin(
                "shareFile",
                ShareFileArgs {
                    source_path: &s_str,
                    mime_type,
                    title,
                },
            )
            .map_err(|e| format!("Gagal membuka Share Sheet Android: {}", e))?;
        Ok(())
    }

    pub fn copy_image_to_clipboard(
        app: &AppHandle,
        source_path: &Path,
        mime_type: &str,
    ) -> Result<(), String> {
        let s_str = source_path.to_string_lossy().to_string();
        let _: serde_json::Value = plugin(app)?
            .run_mobile_plugin(
                "copyImageToClipboard",
                CopyImageArgs {
                    source_path: &s_str,
                    mime_type,
                },
            )
            .map_err(|e| format!("Gagal menyalin gambar ke clipboard Android: {}", e))?;
        Ok(())
    }

    pub fn print_html_document(
        app: &AppHandle,
        html: &str,
        job_name: &str,
    ) -> Result<(), String> {
        let _: serde_json::Value = plugin(app)?
            .run_mobile_plugin("printHtmlDocument", PrintHtmlArgs { html, job_name })
            .map_err(|e| format!("Gagal membuka dialog Print/PDF Android: {}", e))?;
        Ok(())
    }

    pub fn wrap_secret(app: &AppHandle, plaintext: &[u8]) -> Result<String, String> {
        use base64::engine::general_purpose::STANDARD as BASE64;
        use base64::Engine;
        let encoded = BASE64.encode(plaintext);
        let res: WrapSecretResponse = plugin(app)?
            .run_mobile_plugin("wrapSecret", WrapSecretArgs { plaintext_b64: &encoded })
            .map_err(|e| format!("Gagal membungkus secret dengan AndroidKeyStore: {}", e))?;
        Ok(res.ciphertext_b64)
    }

    pub fn unwrap_secret(app: &AppHandle, ciphertext_b64: &str) -> Result<Vec<u8>, String> {
        use base64::engine::general_purpose::STANDARD as BASE64;
        use base64::Engine;
        let res: UnwrapSecretResponse = plugin(app)?
            .run_mobile_plugin("unwrapSecret", UnwrapSecretArgs { ciphertext_b64 })
            .map_err(|e| format!("Gagal membuka secret dari AndroidKeyStore: {}", e))?;
        BASE64
            .decode(res.plaintext_b64)
            .map_err(|e| format!("Gagal decode plaintext secret AndroidKeyStore: {}", e))
    }
}

#[cfg(not(target_os = "android"))]
mod desktop_stub {
    use tauri::plugin::{Builder, TauriPlugin};
    use tauri::Wry;

    pub fn init_plugin() -> TauriPlugin<Wry> {
        Builder::new("nitirekso-android").build()
    }
}

#[cfg(target_os = "android")]
pub use android_impl::*;

#[cfg(not(target_os = "android"))]
pub use desktop_stub::*;
