use crate::credentials::{
    ExchangeCredentials, SUPPORTED_EXCHANGES, delete_ai_api_key, delete_credentials,
    load_ai_api_key_with_meta, load_credentials_with_meta, save_ai_api_key, save_credentials,
};
use crate::db::migrations::{deterministic_trade_uuid, random_uuid};
use crate::db::repositories::balances::get_all_balances;
use crate::db::repositories::settings::{get_all_settings, set_setting};
use crate::db::repositories::sync::get_sync_state;
use crate::media::{
    MAX_SCREENSHOT_BYTES, get_media_record, media_file_name, read_media_bytes_for_sync,
    write_synced_media_bytes,
};
use crate::models::AccountBalance;
use crate::vault::crypto::{
    VaultMeta, create_vault_meta, decrypt_bytes_b64, encrypt_bytes_b64, unlock_vault_meta,
    unwrap_master_key_for_device, wrap_master_key_for_device,
};
use crate::vault::hlc::{HlcGenerator, format_hlc, is_hlc_newer};
use crate::vault::oplog::{ChecklistOpItem, SyncEntityOp, SyncOp};
#[cfg(target_os = "android")]
use crate::vault::saf_storage::SafVaultStorage;
#[cfg(target_os = "android")]
use crate::vault::storage::is_content_uri;
use crate::vault::storage::{FsVaultStorage, VaultStorage};
use crate::vault::watcher::WatcherHandle;
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

const META_DEVICE_ID: &str = "device_id";
const META_SYNC_VAULT_PATH: &str = "sync_vault_path";
const META_MASTER_KEY_ENC: &str = "vault_master_key_enc";
const META_LAST_HLC: &str = "last_hlc";
const META_LAST_SYNC_AT: &str = "last_device_sync_at";
const META_LAST_REMOTE_SYNC_AT: &str = "last_remote_sync_at";
const META_LAST_SYNC_ERROR: &str = "last_device_sync_error";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSyncStatusPayload {
    pub connected: bool,
    pub vault_path: Option<String>,
    pub device_id: String,
    pub has_passphrase: bool,
    pub last_sync_at: Option<i64>,
    pub last_remote_sync_at: Option<i64>,
    pub pending_ops_count: usize,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSyncConnectPayload {
    pub folder_path: String,
    pub passphrase: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSyncRunResult {
    pub status: String, // "ok" | "skipped" | "error"
    pub applied_ops: usize,
    pub emitted_ops: usize,
    pub media_synced: usize,
    pub credentials_synced: usize,
    pub duration_ms: i64,
    pub error: Option<String>,
}

#[derive(Debug)]
pub struct VaultRuntime {
    pub device_id: String,
    pub vault_path: Option<PathBuf>,
    pub master_key: Option<[u8; 32]>,
    pub hlc: HlcGenerator,
    pub last_sync_at: Option<i64>,
    pub last_remote_sync_at: Option<i64>,
    pub last_error: Option<String>,
}

pub struct VaultState {
    pub runtime: Mutex<VaultRuntime>,
    pub watcher: Mutex<Option<WatcherHandle>>,
    pub app_handle: Mutex<Option<AppHandle>>,
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn get_meta(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM local_device_meta WHERE key = ?1",
        params![key],
        |r| r.get::<_, String>(0),
    )
    .ok()
    .filter(|s| !s.trim().is_empty())
}

fn set_meta(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO local_device_meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| format!("Gagal menyimpan local_device_meta '{}': {}", key, e))?;
    Ok(())
}

fn del_meta(conn: &Connection, key: &str) {
    let _ = conn.execute("DELETE FROM local_device_meta WHERE key = ?1", params![key]);
}

/// Daftar kunci setting lokal/legacy yang TIDAK PERNAH disinkronkan lewat Sync Vault.
fn is_local_only_setting_key(key: &str) -> bool {
    matches!(
        key,
        "gdriveClientId"
            | "gdriveEmail"
            | "gdriveFolderId"
            | "gdriveLocalFolder"
            | "gdriveLastBackupAt"
            | "gdriveSyncMode"
            | "deviceId"
            | "syncVaultPath"
    )
}

fn parse_field_clocks(raw: Option<String>) -> BTreeMap<String, String> {
    raw.and_then(|s| serde_json::from_str::<BTreeMap<String, String>>(&s).ok())
        .unwrap_or_default()
}

fn serialize_field_clocks(clocks: &BTreeMap<String, String>) -> String {
    serde_json::to_string(clocks).unwrap_or_else(|_| "{}".to_string())
}

/// Makro bersama untuk resolusi field-level LWW berdasarkan HLC per kolom.
macro_rules! merge_lww_field {
    ($field_clocks:expr, $op_hlc:expr, $local_clocks:expr, $cur_hlc:expr, $changed:expr, $key:expr, $target:ident, $remote_val:expr) => {
        let r_clk = $field_clocks
            .get($key)
            .map(|s| s.as_str())
            .unwrap_or($op_hlc.as_str());
        let l_clk = $local_clocks
            .get($key)
            .map(|s| s.as_str())
            .or($cur_hlc.as_deref());
        if is_hlc_newer(r_clk, l_clk) {
            $target = $remote_val;
            $local_clocks.insert($key.to_string(), r_clk.to_string());
            $changed = true;
        }
    };
}

impl VaultState {
    pub fn from_db(conn: &Connection, db_path: &Path) -> Self {
        let device_id = get_meta(conn, META_DEVICE_ID).unwrap_or_else(random_uuid);
        let vault_path = get_meta(conn, META_SYNC_VAULT_PATH).map(PathBuf::from);
        let last_hlc = get_meta(conn, META_LAST_HLC);
        let master_key = get_meta(conn, META_MASTER_KEY_ENC)
            .and_then(|enc| unwrap_master_key_for_device(db_path, &device_id, &enc));
        let last_sync_at = get_meta(conn, META_LAST_SYNC_AT).and_then(|s| s.parse::<i64>().ok());
        let last_remote_sync_at =
            get_meta(conn, META_LAST_REMOTE_SYNC_AT).and_then(|s| s.parse::<i64>().ok());
        let last_error = get_meta(conn, META_LAST_SYNC_ERROR);

        Self {
            runtime: Mutex::new(VaultRuntime {
                hlc: HlcGenerator::new(device_id.clone(), last_hlc.as_deref()),
                device_id,
                vault_path,
                master_key,
                last_sync_at,
                last_remote_sync_at,
                last_error,
            }),
            watcher: Mutex::new(None),
            app_handle: Mutex::new(None),
        }
    }

    pub fn set_app_handle(&self, app: AppHandle) {
        *self.app_handle.lock().unwrap() = Some(app);
    }

    pub fn get_status(&self) -> DeviceSyncStatusPayload {
        let rt = self.runtime.lock().unwrap();
        DeviceSyncStatusPayload {
            connected: rt.vault_path.is_some() && rt.master_key.is_some(),
            vault_path: rt
                .vault_path
                .as_ref()
                .map(|p| p.to_string_lossy().to_string()),
            device_id: rt.device_id.clone(),
            has_passphrase: rt.master_key.is_some(),
            last_sync_at: rt.last_sync_at,
            last_remote_sync_at: rt.last_remote_sync_at,
            pending_ops_count: 0,
            last_error: rt.last_error.clone(),
        }
    }

    pub fn active_storage(&self) -> Option<Arc<dyn VaultStorage>> {
        let rt = self.runtime.lock().unwrap();
        if rt.master_key.is_none() {
            return None;
        }
        let vp = rt.vault_path.as_ref()?;
        #[cfg(target_os = "android")]
        {
            let vp_str = vp.to_string_lossy();
            if is_content_uri(&vp_str) {
                let app = self.app_handle.lock().unwrap().clone()?;
                return Some(Arc::new(SafVaultStorage::new(app, vp_str.to_string())));
            }
        }
        Some(Arc::new(FsVaultStorage::new(vp.clone())))
    }

    fn next_hlc(&self, conn: &Connection) -> String {
        let hlc = {
            let mut rt = self.runtime.lock().unwrap();
            rt.hlc.tick()
        };
        let _ = set_meta(conn, META_LAST_HLC, &hlc);
        hlc
    }

    fn observe_hlc(&self, conn: &Connection, remote_hlc: &str) {
        let current = {
            let mut rt = self.runtime.lock().unwrap();
            rt.hlc.observe(remote_hlc);
            rt.hlc.current_string()
        };
        let _ = set_meta(conn, META_LAST_HLC, &current);
    }

    /// Menghubungkan perangkat ini ke folder Sync Vault memakai Vault Passphrase.
    pub fn connect_with_storage(
        &self,
        conn: &mut Connection,
        db_path: &Path,
        storage: &dyn VaultStorage,
        folder_path: &str,
        passphrase: &str,
    ) -> Result<DeviceSyncRunResult, String> {
        let start = Instant::now();
        let device_id = {
            let rt = self.runtime.lock().unwrap();
            rt.device_id.clone()
        };

        storage.ensure_layout(&device_id)?;

        // 1. Buka vault.json jika sudah ada atau buat VaultMeta baru bila vault baru
        let (master_key, existing_vault) = match storage.read_meta()? {
            Some(raw_meta) => {
                let meta: VaultMeta = serde_json::from_slice(&raw_meta)
                    .map_err(|e| format!("Format vault.json tidak valid: {}", e))?;
                let mk = unlock_vault_meta(&meta, passphrase)?;
                (mk, true)
            }
            None => {
                let (meta, mk) = create_vault_meta(passphrase)?;
                let encoded = serde_json::to_vec_pretty(&meta)
                    .map_err(|e| format!("Gagal serialisasi vault.json: {}", e))?;
                storage.write_meta(&encoded)?;
                (mk, false)
            }
        };

        // 2. Simpan kunci terbungkus dan path vault secara lokal (secret terpisah di .device-secret)
        let wrapped = wrap_master_key_for_device(db_path, &device_id, &master_key)?;
        set_meta(conn, META_SYNC_VAULT_PATH, folder_path.trim())?;
        set_meta(conn, META_MASTER_KEY_ENC, &wrapped)?;
        del_meta(conn, META_LAST_SYNC_ERROR);

        {
            let mut rt = self.runtime.lock().unwrap();
            rt.vault_path = Some(PathBuf::from(folder_path.trim()));
            rt.master_key = Some(master_key);
            rt.last_error = None;
        }

        // 3. Beri stempel clock lokal pada record sebelum-sync yang belum punya HLC agar pull tidak menimpa data lokal bernilai
        self.stamp_unclocked_local_records(conn, &device_id)?;

        // 4. Jika vault sudah memiliki isi dari perangkat lain, tarik terlebih dahulu sebelum mengirim op lokal
        let mut applied_ops = 0;
        let mut media_synced = 0;
        let mut credentials_synced = 0;
        if existing_vault {
            let pull_res = self.pull_from_storage(conn, db_path, storage)?;
            applied_ops += pull_res.applied_ops;
            media_synced += pull_res.media_synced;
            credentials_synced += pull_res.credentials_synced;
        }

        // 5. Ekspor seluruh data lokal yang belum tersinkron (termasuk screenshot legacy & kredensial lama)
        let (emitted_ops, exported_media) =
            self.bootstrap_local_to_storage(conn, db_path, storage, &master_key)?;
        media_synced += exported_media;

        let now = now_millis();
        let _ = set_meta(conn, META_LAST_SYNC_AT, &now.to_string());
        {
            let mut rt = self.runtime.lock().unwrap();
            rt.last_sync_at = Some(now);
        }

        Ok(DeviceSyncRunResult {
            status: "ok".to_string(),
            applied_ops,
            emitted_ops,
            media_synced,
            credentials_synced,
            duration_ms: start.elapsed().as_millis() as i64,
            error: None,
        })
    }

    pub fn disconnect(&self, conn: &Connection) -> Result<(), String> {
        {
            let mut w = self.watcher.lock().unwrap();
            *w = None;
        }
        del_meta(conn, META_SYNC_VAULT_PATH);
        del_meta(conn, META_MASTER_KEY_ENC);
        del_meta(conn, META_LAST_SYNC_ERROR);
        let _ = conn.execute("DELETE FROM device_sync_cursors", []);

        let mut rt = self.runtime.lock().unwrap();
        rt.vault_path = None;
        rt.master_key = None;
        rt.last_error = None;
        Ok(())
    }

    /// Memancarkan perubahan seluruh state satu trade (trade, journal, risk, checklist, tags) pasca create/update.
    pub fn emit_trade_snapshot_if_connected(
        &self,
        conn: &Connection,
        trade_id: i64,
        mark_fields_updated: bool,
    ) -> Result<(), String> {
        let Some(storage) = self.active_storage() else {
            return Ok(());
        };
        self.emit_trade_snapshot_to_storage(conn, storage.as_ref(), trade_id, mark_fields_updated)
    }

    /// Memancarkan HANYA kolom teknis `trades` (digunakan pasca Exchange Sync agar tidak pernah menimpa `trade_journal` atau `planned_risk`).
    pub fn emit_trade_only_if_connected(
        &self,
        conn: &Connection,
        trade_id: i64,
    ) -> Result<(), String> {
        let Some(storage) = self.active_storage() else {
            return Ok(());
        };
        let mut ops = Vec::new();
        let hlc = self.next_hlc(conn);
        let now = now_millis();
        let device_id = self.runtime.lock().unwrap().device_id.clone();

        if let Some(op) = self.build_trade_upsert_op(conn, trade_id, &device_id, &hlc, now, true)? {
            ops.push(op);
        }
        self.write_ops(conn, storage.as_ref(), &ops)
    }

    fn build_trade_upsert_op(
        &self,
        conn: &Connection,
        trade_id: i64,
        device_id: &str,
        hlc: &str,
        now: i64,
        mark_fields_updated: bool,
    ) -> Result<Option<SyncOp>, String> {
        let row_opt = conn
            .query_row(
                "SELECT uuid, exchange, external_id, symbol, direction,
                        entry_price, exit_price, entry_time, exit_time,
                        size, leverage, margin_mode, realized_pnl, pnl_source,
                        fee_open, fee_close, fee_open_maker, fee_close_maker,
                        funding_fee, created_at, updated_at, deleted_at, field_clocks
                 FROM trades WHERE id = ?1",
                params![trade_id],
                |r| {
                    Ok((
                        r.get::<_, Option<String>>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, Option<String>>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, String>(4)?,
                        r.get::<_, f64>(5)?,
                        r.get::<_, f64>(6)?,
                        r.get::<_, i64>(7)?,
                        r.get::<_, i64>(8)?,
                        r.get::<_, f64>(9)?,
                        r.get::<_, f64>(10)?,
                        r.get::<_, Option<String>>(11)?,
                        r.get::<_, f64>(12)?,
                        r.get::<_, String>(13)?,
                        r.get::<_, f64>(14)?,
                        r.get::<_, f64>(15)?,
                        r.get::<_, Option<f64>>(16)?,
                        r.get::<_, Option<f64>>(17)?,
                        r.get::<_, f64>(18)?,
                        r.get::<_, i64>(19)?,
                        r.get::<_, i64>(20)?,
                        r.get::<_, Option<i64>>(21)?,
                        r.get::<_, Option<String>>(22)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| format!("Gagal membaca trade {} untuk sync: {}", trade_id, e))?;

        let Some((
            uuid_opt,
            exchange,
            external_id,
            symbol,
            direction,
            entry_price,
            exit_price,
            entry_time,
            exit_time,
            size,
            leverage,
            margin_mode,
            realized_pnl,
            pnl_source,
            fee_open,
            fee_close,
            fee_open_maker,
            fee_close_maker,
            funding_fee,
            created_at,
            updated_at,
            deleted_at,
            raw_clocks,
        )) = row_opt
        else {
            return Ok(None);
        };

        let trade_uuid = uuid_opt.unwrap_or_else(|| {
            let generated = match external_id
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
            {
                Some(ext) => deterministic_trade_uuid(&exchange, ext),
                None => random_uuid(),
            };
            let _ = conn.execute(
                "UPDATE trades SET uuid = ?1 WHERE id = ?2",
                params![generated, trade_id],
            );
            generated
        });

        let mut trade_clocks = parse_field_clocks(raw_clocks);
        let trade_fields = [
            "exchange",
            "external_id",
            "symbol",
            "direction",
            "entry_price",
            "exit_price",
            "entry_time",
            "exit_time",
            "size",
            "leverage",
            "margin_mode",
            "realized_pnl",
            "pnl_source",
            "fee_open",
            "fee_close",
            "fee_open_maker",
            "fee_close_maker",
            "funding_fee",
        ];
        for f in trade_fields {
            if mark_fields_updated || !trade_clocks.contains_key(f) {
                trade_clocks.insert(f.to_string(), hlc.to_string());
            }
        }
        if deleted_at.is_some() || mark_fields_updated || !trade_clocks.contains_key("deleted_at") {
            trade_clocks.insert("deleted_at".to_string(), hlc.to_string());
        }
        let _ = conn.execute(
            "UPDATE trades SET hlc = ?1, field_clocks = ?2 WHERE id = ?3",
            params![hlc, serialize_field_clocks(&trade_clocks), trade_id],
        );

        Ok(Some(SyncOp {
            op_id: random_uuid(),
            device_id: device_id.to_string(),
            hlc: hlc.to_string(),
            ts: now,
            payload: SyncEntityOp::TradeUpsert {
                uuid: trade_uuid,
                exchange,
                external_id,
                symbol,
                direction,
                entry_price,
                exit_price,
                entry_time,
                exit_time,
                size,
                leverage,
                margin_mode,
                realized_pnl,
                pnl_source,
                fee_open,
                fee_close,
                fee_open_maker,
                fee_close_maker,
                funding_fee,
                created_at,
                updated_at,
                deleted_at,
                field_clocks: trade_clocks,
            },
        }))
    }

    pub fn emit_trade_snapshot_to_storage(
        &self,
        conn: &Connection,
        storage: &dyn VaultStorage,
        trade_id: i64,
        mark_fields_updated: bool,
    ) -> Result<(), String> {
        self.emit_trade_snapshot_to_storage_with_opts(
            conn,
            storage,
            trade_id,
            mark_fields_updated,
            false,
            false,
        )
    }

    pub fn emit_trade_snapshot_to_storage_with_opts(
        &self,
        conn: &Connection,
        storage: &dyn VaultStorage,
        trade_id: i64,
        mark_fields_updated: bool,
        force_checklist: bool,
        force_tags: bool,
    ) -> Result<(), String> {
        let mut ops = Vec::new();
        let hlc = self.next_hlc(conn);
        let now = now_millis();
        let device_id = self.runtime.lock().unwrap().device_id.clone();

        let Some(trade_op) =
            self.build_trade_upsert_op(conn, trade_id, &device_id, &hlc, now, mark_fields_updated)?
        else {
            return Ok(());
        };

        let trade_uuid = match &trade_op.payload {
            SyncEntityOp::TradeUpsert { uuid, .. } => uuid.clone(),
            _ => unreachable!(),
        };
        ops.push(trade_op);

        // 2. Journal
        if let Ok(Some((
            setup_tag,
            pre_trade_thesis,
            post_trade_review,
            emotion_tag,
            execution_grade,
            screenshot_path,
            j_updated_at,
            j_raw_clocks,
        ))) = conn
            .query_row(
                "SELECT setup_tag, pre_trade_thesis, post_trade_review, emotion_tag,
                        execution_grade, screenshot_path, updated_at, field_clocks
                 FROM trade_journal WHERE trade_id = ?1",
                params![trade_id],
                |r| {
                    Ok((
                        r.get::<_, Option<String>>(0)?,
                        r.get::<_, Option<String>>(1)?,
                        r.get::<_, Option<String>>(2)?,
                        r.get::<_, Option<String>>(3)?,
                        r.get::<_, Option<String>>(4)?,
                        r.get::<_, Option<String>>(5)?,
                        r.get::<_, i64>(6)?,
                        r.get::<_, Option<String>>(7)?,
                    ))
                },
            )
            .optional()
        {
            let mut j_clocks = parse_field_clocks(j_raw_clocks);
            let field_values: [(&str, bool); 6] = [
                ("setup_tag", setup_tag.is_some()),
                ("pre_trade_thesis", pre_trade_thesis.is_some()),
                ("post_trade_review", post_trade_review.is_some()),
                ("emotion_tag", emotion_tag.is_some()),
                ("execution_grade", execution_grade.is_some()),
                ("screenshot_path", screenshot_path.is_some()),
            ];
            let has_any_non_null = field_values.iter().any(|(_, is_set)| *is_set);
            for (f, is_set) in field_values {
                if mark_fields_updated || (is_set && !j_clocks.contains_key(f)) {
                    j_clocks.insert(f.to_string(), hlc.clone());
                }
            }
            if mark_fields_updated || has_any_non_null || !j_clocks.is_empty() {
                let _ = conn.execute(
                    "UPDATE trade_journal SET hlc = ?1, field_clocks = ?2 WHERE trade_id = ?3",
                    params![hlc, serialize_field_clocks(&j_clocks), trade_id],
                );

                ops.push(SyncOp {
                    op_id: random_uuid(),
                    device_id: device_id.clone(),
                    hlc: hlc.clone(),
                    ts: now,
                    payload: SyncEntityOp::TradeJournalUpsert {
                        trade_uuid: trade_uuid.clone(),
                        setup_tag,
                        pre_trade_thesis,
                        post_trade_review,
                        emotion_tag,
                        execution_grade,
                        screenshot_path,
                        updated_at: j_updated_at,
                        field_clocks: j_clocks,
                    },
                });
            }
        }

        // 3. Planned Risk
        if let Ok(Some((planned_stop, planned_target, risk_amount, planned_rr, pr_raw_clocks))) =
            conn.query_row(
                "SELECT planned_stop, planned_target, risk_amount, planned_rr, field_clocks
                 FROM planned_risk WHERE trade_id = ?1",
                params![trade_id],
                |r| {
                    Ok((
                        r.get::<_, Option<f64>>(0)?,
                        r.get::<_, Option<f64>>(1)?,
                        r.get::<_, Option<f64>>(2)?,
                        r.get::<_, Option<f64>>(3)?,
                        r.get::<_, Option<String>>(4)?,
                    ))
                },
            )
            .optional()
        {
            let mut pr_clocks = parse_field_clocks(pr_raw_clocks);
            let pr_fields: [(&str, bool); 4] = [
                ("planned_stop", planned_stop.is_some()),
                ("planned_target", planned_target.is_some()),
                ("risk_amount", risk_amount.is_some()),
                ("planned_rr", planned_rr.is_some()),
            ];
            let has_any_pr = pr_fields.iter().any(|(_, is_set)| *is_set);
            for (f, is_set) in pr_fields {
                if mark_fields_updated || (is_set && !pr_clocks.contains_key(f)) {
                    pr_clocks.insert(f.to_string(), hlc.clone());
                }
            }
            if mark_fields_updated || has_any_pr || !pr_clocks.is_empty() {
                let _ = conn.execute(
                    "UPDATE planned_risk SET hlc = ?1, field_clocks = ?2 WHERE trade_id = ?3",
                    params![hlc, serialize_field_clocks(&pr_clocks), trade_id],
                );

                ops.push(SyncOp {
                    op_id: random_uuid(),
                    device_id: device_id.clone(),
                    hlc: hlc.clone(),
                    ts: now,
                    payload: SyncEntityOp::PlannedRiskUpsert {
                        trade_uuid: trade_uuid.clone(),
                        planned_stop,
                        planned_target,
                        risk_amount,
                        planned_rr,
                        field_clocks: pr_clocks,
                    },
                });
            }
        }

        // 4. Checklist
        if let Ok(mut stmt) = conn.prepare(
            "SELECT label, checked, sort_order FROM journal_checklist WHERE trade_id = ?1 ORDER BY sort_order, id",
        ) {
            if let Ok(rows) = stmt.query_map(params![trade_id], |r| {
                let checked_int: i64 = r.get(1)?;
                Ok(ChecklistOpItem {
                    label: r.get(0)?,
                    checked: checked_int == 1,
                    sort_order: r.get(2)?,
                })
            }) {
                let items: Vec<ChecklistOpItem> = rows.filter_map(Result::ok).collect();
                let had_hlc = get_meta(conn, &format!("checklist_hlc:{}", trade_uuid)).is_some();
                if force_checklist || mark_fields_updated || (!items.is_empty() && !had_hlc) {
                    let _ = set_meta(conn, &format!("checklist_hlc:{}", trade_uuid), &hlc);
                    ops.push(SyncOp {
                        op_id: random_uuid(),
                        device_id: device_id.clone(),
                        hlc: hlc.clone(),
                        ts: now,
                        payload: SyncEntityOp::TradeChecklistReplace {
                            trade_uuid: trade_uuid.clone(),
                            items,
                        },
                    });
                }
            }
        }

        // 5. Tags
        if let Ok(mut stmt) = conn.prepare(
            "SELECT jt2.name FROM trade_journal_tags jt
             JOIN journal_tags jt2 ON jt2.id = jt.tag_id
             WHERE jt.trade_id = ?1 ORDER BY jt2.name COLLATE NOCASE",
        ) {
            if let Ok(rows) = stmt.query_map(params![trade_id], |r| r.get::<_, String>(0)) {
                let tags: Vec<String> = rows.filter_map(Result::ok).collect();
                let had_hlc = get_meta(conn, &format!("tags_hlc:{}", trade_uuid)).is_some();
                if force_tags || mark_fields_updated || (!tags.is_empty() && !had_hlc) {
                    let _ = set_meta(conn, &format!("tags_hlc:{}", trade_uuid), &hlc);
                    ops.push(SyncOp {
                        op_id: random_uuid(),
                        device_id: device_id.clone(),
                        hlc: hlc.clone(),
                        ts: now,
                        payload: SyncEntityOp::TradeTagsReplace { trade_uuid, tags },
                    });
                }
            }
        }

        self.write_ops(conn, storage, &ops)
    }

    pub fn emit_trade_tombstone_if_connected(
        &self,
        conn: &Connection,
        trade_id: i64,
    ) -> Result<(), String> {
        let Some(storage) = self.active_storage() else {
            return Ok(());
        };
        self.emit_trade_snapshot_to_storage(conn, storage.as_ref(), trade_id, true)
    }

    /// Memperbarui HLC per-field hanya untuk kolom trade/journal/risk yang nilainya benar-benar berubah,
    /// lalu memancarkan snapshot op ke Sync Vault bila terhubung.
    pub fn emit_trade_update_diff_if_connected(
        &self,
        conn: &Connection,
        trade_id: i64,
        before: Option<&crate::models::TradeDetail>,
        after: Option<&crate::models::TradeDetail>,
    ) -> Result<(), String> {
        let (Some(b), Some(a)) = (before, after) else {
            return self.emit_trade_snapshot_if_connected(conn, trade_id, true);
        };

        let hlc = self.next_hlc(conn);

        // 1. Diff field Trade
        let mut t_clocks = parse_field_clocks(
            conn.query_row(
                "SELECT field_clocks FROM trades WHERE id = ?1",
                params![trade_id],
                |r| r.get::<_, Option<String>>(0),
            )
            .ok()
            .flatten(),
        );
        let mut t_changed = false;
        macro_rules! bump_if_diff {
            ($clocks:expr, $flag:expr, $key:expr, $cond:expr) => {
                if $cond {
                    $clocks.insert($key.to_string(), hlc.clone());
                    $flag = true;
                }
            };
        }
        bump_if_diff!(
            t_clocks,
            t_changed,
            "exchange",
            b.trade.exchange != a.trade.exchange
        );
        bump_if_diff!(
            t_clocks,
            t_changed,
            "external_id",
            b.trade.external_id != a.trade.external_id
        );
        bump_if_diff!(
            t_clocks,
            t_changed,
            "symbol",
            b.trade.symbol != a.trade.symbol
        );
        bump_if_diff!(
            t_clocks,
            t_changed,
            "direction",
            b.trade.direction != a.trade.direction
        );
        bump_if_diff!(
            t_clocks,
            t_changed,
            "entry_price",
            (b.trade.entry_price - a.trade.entry_price).abs() > 1e-12
        );
        bump_if_diff!(
            t_clocks,
            t_changed,
            "exit_price",
            (b.trade.exit_price - a.trade.exit_price).abs() > 1e-12
        );
        bump_if_diff!(
            t_clocks,
            t_changed,
            "entry_time",
            b.trade.entry_time != a.trade.entry_time
        );
        bump_if_diff!(
            t_clocks,
            t_changed,
            "exit_time",
            b.trade.exit_time != a.trade.exit_time
        );
        bump_if_diff!(
            t_clocks,
            t_changed,
            "size",
            (b.trade.size - a.trade.size).abs() > 1e-12
        );
        bump_if_diff!(
            t_clocks,
            t_changed,
            "leverage",
            (b.trade.leverage - a.trade.leverage).abs() > 1e-12
        );
        bump_if_diff!(
            t_clocks,
            t_changed,
            "margin_mode",
            b.trade.margin_mode != a.trade.margin_mode
        );
        bump_if_diff!(
            t_clocks,
            t_changed,
            "realized_pnl",
            (b.trade.realized_pnl - a.trade.realized_pnl).abs() > 1e-12
        );
        bump_if_diff!(
            t_clocks,
            t_changed,
            "fee_open",
            (b.trade.fee_open - a.trade.fee_open).abs() > 1e-12
        );
        bump_if_diff!(
            t_clocks,
            t_changed,
            "fee_close",
            (b.trade.fee_close - a.trade.fee_close).abs() > 1e-12
        );
        bump_if_diff!(
            t_clocks,
            t_changed,
            "funding_fee",
            (b.trade.funding_fee - a.trade.funding_fee).abs() > 1e-12
        );

        if t_changed {
            let _ = conn.execute(
                "UPDATE trades SET hlc = ?1, field_clocks = ?2 WHERE id = ?3",
                params![hlc, serialize_field_clocks(&t_clocks), trade_id],
            );
        }

        // 2. Diff field Journal
        let mut j_clocks = parse_field_clocks(
            conn.query_row(
                "SELECT field_clocks FROM trade_journal WHERE trade_id = ?1",
                params![trade_id],
                |r| r.get::<_, Option<String>>(0),
            )
            .ok()
            .flatten(),
        );
        let bj = b.journal.as_ref();
        let aj = a.journal.as_ref();
        let mut j_changed = false;
        bump_if_diff!(
            j_clocks,
            j_changed,
            "setup_tag",
            bj.and_then(|x| x.setup_tag.as_ref()) != aj.and_then(|x| x.setup_tag.as_ref())
        );
        bump_if_diff!(
            j_clocks,
            j_changed,
            "pre_trade_thesis",
            bj.and_then(|x| x.pre_trade_thesis.as_ref())
                != aj.and_then(|x| x.pre_trade_thesis.as_ref())
        );
        bump_if_diff!(
            j_clocks,
            j_changed,
            "post_trade_review",
            bj.and_then(|x| x.post_trade_review.as_ref())
                != aj.and_then(|x| x.post_trade_review.as_ref())
        );
        bump_if_diff!(
            j_clocks,
            j_changed,
            "emotion_tag",
            bj.and_then(|x| x.emotion_tag.as_ref()) != aj.and_then(|x| x.emotion_tag.as_ref())
        );
        bump_if_diff!(
            j_clocks,
            j_changed,
            "execution_grade",
            bj.and_then(|x| x.execution_grade.as_ref())
                != aj.and_then(|x| x.execution_grade.as_ref())
        );
        bump_if_diff!(
            j_clocks,
            j_changed,
            "screenshot_path",
            bj.and_then(|x| x.screenshot_path.as_ref())
                != aj.and_then(|x| x.screenshot_path.as_ref())
        );

        if j_changed {
            let _ = conn.execute(
                "UPDATE trade_journal SET hlc = ?1, field_clocks = ?2 WHERE trade_id = ?3",
                params![hlc, serialize_field_clocks(&j_clocks), trade_id],
            );
        }

        // 3. Diff field Planned Risk
        let mut pr_clocks = parse_field_clocks(
            conn.query_row(
                "SELECT field_clocks FROM planned_risk WHERE trade_id = ?1",
                params![trade_id],
                |r| r.get::<_, Option<String>>(0),
            )
            .ok()
            .flatten(),
        );
        let bpr = b.planned_risk.as_ref();
        let apr = a.planned_risk.as_ref();
        let mut pr_changed = false;
        bump_if_diff!(
            pr_clocks,
            pr_changed,
            "planned_stop",
            bpr.and_then(|x| x.planned_stop) != apr.and_then(|x| x.planned_stop)
        );
        bump_if_diff!(
            pr_clocks,
            pr_changed,
            "planned_target",
            bpr.and_then(|x| x.planned_target) != apr.and_then(|x| x.planned_target)
        );
        bump_if_diff!(
            pr_clocks,
            pr_changed,
            "risk_amount",
            bpr.and_then(|x| x.risk_amount) != apr.and_then(|x| x.risk_amount)
        );
        bump_if_diff!(
            pr_clocks,
            pr_changed,
            "planned_rr",
            bpr.and_then(|x| x.planned_rr) != apr.and_then(|x| x.planned_rr)
        );

        if pr_changed {
            let _ = conn.execute(
                "UPDATE planned_risk SET hlc = ?1, field_clocks = ?2 WHERE trade_id = ?3",
                params![hlc, serialize_field_clocks(&pr_clocks), trade_id],
            );
        }

        let checklist_changed = b.checklist.len() != a.checklist.len()
            || b.checklist
                .iter()
                .zip(a.checklist.iter())
                .any(|(x, y)| x.label != y.label || x.checked != y.checked);
        let tags_changed = {
            let bt: Vec<&str> = b.tags.iter().map(|t| t.name.as_str()).collect();
            let at: Vec<&str> = a.tags.iter().map(|t| t.name.as_str()).collect();
            bt != at
        };

        let Some(storage) = self.active_storage() else {
            return Ok(());
        };
        self.emit_trade_snapshot_to_storage_with_opts(
            conn,
            storage.as_ref(),
            trade_id,
            false,
            checklist_changed,
            tags_changed,
        )
    }

    pub fn emit_setting_if_connected(
        &self,
        conn: &Connection,
        key: &str,
        value: &Value,
    ) -> Result<(), String> {
        if is_local_only_setting_key(key) {
            return Ok(());
        }
        let hlc = self.next_hlc(conn);
        let now = now_millis();
        let _ = conn.execute(
            "UPDATE settings SET updated_at = ?1, hlc = ?2, deleted_at = NULL WHERE key = ?3",
            params![now, hlc, key],
        );

        let Some(storage) = self.active_storage() else {
            return Ok(());
        };
        let device_id = self.runtime.lock().unwrap().device_id.clone();
        let op = SyncOp {
            op_id: random_uuid(),
            device_id,
            hlc,
            ts: now,
            payload: SyncEntityOp::SettingUpsert {
                key: key.to_string(),
                value: value.clone(),
                updated_at: now,
                deleted_at: None,
            },
        };
        self.write_ops(conn, storage.as_ref(), &[op])
    }

    pub fn emit_balances_if_connected(
        &self,
        conn: &Connection,
        balances: &[AccountBalance],
    ) -> Result<(), String> {
        let Some(storage) = self.active_storage() else {
            return Ok(());
        };
        if balances.is_empty() {
            return Ok(());
        }
        let device_id = self.runtime.lock().unwrap().device_id.clone();
        let now = now_millis();
        let mut ops = Vec::with_capacity(balances.len());
        for b in balances {
            let hlc = self.next_hlc(conn);
            let _ = conn.execute(
                "UPDATE account_balances SET hlc = ?1 WHERE exchange = ?2 AND asset = ?3",
                params![hlc, b.exchange, b.asset],
            );
            ops.push(SyncOp {
                op_id: random_uuid(),
                device_id: device_id.clone(),
                hlc,
                ts: now,
                payload: SyncEntityOp::AccountBalanceUpsert {
                    exchange: b.exchange.clone(),
                    asset: b.asset.clone(),
                    total: b.total,
                    available: b.available,
                    unrealized_pnl: b.unrealized_pnl,
                    updated_at: b.updated_at,
                },
            });
        }
        self.write_ops(conn, storage.as_ref(), &ops)
    }

    pub fn emit_sync_state_if_connected(
        &self,
        conn: &Connection,
        exchange: &str,
    ) -> Result<(), String> {
        let Some(storage) = self.active_storage() else {
            return Ok(());
        };
        let state = get_sync_state(conn, exchange)
            .map_err(|e| format!("Gagal membaca sync_state {}: {}", exchange, e))?;
        let hlc = self.next_hlc(conn);
        let _ = conn.execute(
            "UPDATE sync_state SET hlc = ?1 WHERE exchange = ?2",
            params![hlc, exchange],
        );
        let device_id = self.runtime.lock().unwrap().device_id.clone();
        let op = SyncOp {
            op_id: random_uuid(),
            device_id,
            hlc,
            ts: now_millis(),
            payload: SyncEntityOp::SyncStateUpsert {
                exchange: state.exchange,
                last_exit_time: state.last_exit_time,
                last_external_id: state.last_external_id,
                last_fill_time: state.last_fill_time,
                last_fill_id: state.last_fill_id,
                last_funding_time: state.last_funding_time,
                last_sync_at: state.last_sync_at,
                last_status: state.last_status,
                last_error: state.last_error,
            },
        };
        self.write_ops(conn, storage.as_ref(), &[op])
    }

    pub fn emit_media_upsert(
        &self,
        conn: &Connection,
        sha256: &str,
        bytes_opt: Option<&[u8]>,
    ) -> Result<(), String> {
        let Some(storage) = self.active_storage() else {
            return Ok(());
        };
        self.emit_media_to_storage(conn, storage.as_ref(), sha256, bytes_opt)
    }

    fn emit_media_to_storage(
        &self,
        conn: &Connection,
        storage: &dyn VaultStorage,
        sha256: &str,
        bytes_opt: Option<&[u8]>,
    ) -> Result<(), String> {
        let Some(rec) = get_media_record(conn, sha256) else {
            return Ok(());
        };
        if rec.deleted_at.is_none() {
            if let Some(bytes) = bytes_opt {
                let fname = media_file_name(&rec.sha256, &rec.ext);
                if !storage.has_media(&fname) {
                    storage.write_media(&fname, bytes)?;
                }
            }
        }
        let hlc = self.next_hlc(conn);
        let device_id = self.runtime.lock().unwrap().device_id.clone();
        let op = SyncOp {
            op_id: random_uuid(),
            device_id,
            hlc,
            ts: now_millis(),
            payload: SyncEntityOp::MediaAssetUpsert {
                sha256: rec.sha256,
                kind: rec.kind,
                ext: rec.ext,
                mime: rec.mime,
                size_bytes: rec.size_bytes,
                original_name: rec.original_name,
                created_at: rec.created_at,
                deleted_at: rec.deleted_at,
            },
        };
        self.write_ops(conn, storage, &[op])
    }

    pub fn emit_credential_if_connected(
        &self,
        conn: &Connection,
        slot: &str,
        plaintext_bytes: Option<&[u8]>,
        key_hint: Option<&str>,
    ) -> Result<(), String> {
        let master_key = {
            let rt = self.runtime.lock().unwrap();
            rt.master_key
        };
        let Some(mk) = master_key else {
            return Ok(());
        };
        let Some(storage) = self.active_storage() else {
            return Ok(());
        };
        self.emit_credential_to_storage(conn, storage.as_ref(), &mk, slot, plaintext_bytes, key_hint, None)
    }

    fn emit_credential_to_storage(
        &self,
        conn: &Connection,
        storage: &dyn VaultStorage,
        master_key: &[u8; 32],
        slot: &str,
        plaintext_bytes: Option<&[u8]>,
        key_hint: Option<&str>,
        custom_hlc: Option<String>,
    ) -> Result<(), String> {
        let now = now_millis();
        let hlc = custom_hlc.unwrap_or_else(|| self.next_hlc(conn));
        let (encrypted_payload_b64, deleted_at) = match plaintext_bytes {
            Some(bytes) => (Some(encrypt_bytes_b64(master_key, bytes)?), None),
            None => (None, Some(now)),
        };

        let _ = set_meta(conn, &format!("cred_hlc:{}", slot), &hlc);
        let device_id = self.runtime.lock().unwrap().device_id.clone();

        let op = SyncOp {
            op_id: random_uuid(),
            device_id,
            hlc,
            ts: now,
            payload: SyncEntityOp::CredentialUpsert {
                slot: slot.to_string(),
                encrypted_payload_b64,
                key_hint: key_hint.map(|s| s.to_string()),
                updated_at: now,
                deleted_at,
            },
        };
        self.write_ops(conn, storage, &[op])
    }

    fn write_ops(
        &self,
        conn: &Connection,
        storage: &dyn VaultStorage,
        ops: &[SyncOp],
    ) -> Result<(), String> {
        if ops.is_empty() {
            return Ok(());
        }
        let device_id = self.runtime.lock().unwrap().device_id.clone();
        let mut lines = Vec::with_capacity(ops.len());
        for op in ops {
            lines.push(
                serde_json::to_string(op)
                    .map_err(|e| format!("Gagal serialisasi op-log: {}", e))?,
            );
        }
        storage.append_op_lines(&device_id, &lines)?;
        let now = now_millis();
        let _ = set_meta(conn, META_LAST_SYNC_AT, &now.to_string());
        if let Ok(mut rt) = self.runtime.lock() {
            rt.last_sync_at = Some(now);
            rt.last_error = None;
        }
        Ok(())
    }

    /// Memberi stempel clock lokal historis ke field jurnal non-null yang belum ber-HLC
    /// sebelum pull perdana dari Sync Vault, agar op remote kosong/lebih lama tidak menimpa data lokal.
    fn stamp_unclocked_local_records(
        &self,
        conn: &Connection,
        device_id: &str,
    ) -> Result<(), String> {
        let mut pending = Vec::new();
        if let Ok(mut stmt) = conn.prepare(
            "SELECT j.trade_id, j.setup_tag, j.pre_trade_thesis, j.post_trade_review,
                    j.emotion_tag, j.execution_grade, j.screenshot_path, j.updated_at
             FROM trade_journal j
             WHERE j.hlc IS NULL OR TRIM(j.hlc) = ''",
        ) {
            if let Ok(rows) = stmt.query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, Option<String>>(1)?,
                    r.get::<_, Option<String>>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, Option<String>>(4)?,
                    r.get::<_, Option<String>>(5)?,
                    r.get::<_, Option<String>>(6)?,
                    r.get::<_, i64>(7)?,
                ))
            }) {
                for row in rows.flatten() {
                    pending.push(row);
                }
            }
        }

        for (tid, st, ptt, ptr, em, eg, ss, upd) in pending {
            let hlc = format_hlc(upd.max(1), 0, device_id);
            let mut clocks = BTreeMap::new();
            for (k, has_val) in [
                ("setup_tag", st.is_some()),
                ("pre_trade_thesis", ptt.is_some()),
                ("post_trade_review", ptr.is_some()),
                ("emotion_tag", em.is_some()),
                ("execution_grade", eg.is_some()),
                ("screenshot_path", ss.is_some()),
            ] {
                if has_val {
                    clocks.insert(k.to_string(), hlc.clone());
                }
            }
            if !clocks.is_empty() {
                let _ = conn.execute(
                    "UPDATE trade_journal SET hlc = ?1, field_clocks = ?2 WHERE trade_id = ?3",
                    params![hlc, serialize_field_clocks(&clocks), tid],
                );
            }
        }
        Ok(())
    }

    /// Mengekspor data lokal yang ada (saat pertama kali menghubungkan Sync Vault).
    fn bootstrap_local_to_storage(
        &self,
        conn: &Connection,
        db_path: &Path,
        storage: &dyn VaultStorage,
        master_key: &[u8; 32],
    ) -> Result<(usize, usize), String> {
        let mut emitted_ops = 0;
        let mut media_copied = 0;
        let device_id = self.runtime.lock().unwrap().device_id.clone();

        // 0. Migrasi screenshot legacy di folder `screenshots/` ke `media/`
        let legacy_ss_dir = crate::screenshots::get_screenshot_dir(db_path);
        if legacy_ss_dir.exists() {
            let mut ss_updates = Vec::new();
            if let Ok(mut stmt) = conn.prepare(
                "SELECT trade_id, screenshot_path FROM trade_journal
                 WHERE screenshot_path IS NOT NULL AND TRIM(screenshot_path) <> ''",
            ) {
                if let Ok(rows) =
                    stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
                {
                    for r in rows.flatten() {
                        ss_updates.push(r);
                    }
                }
            }
            for (tid, rel) in ss_updates {
                let p = legacy_ss_dir.join(&rel);
                if p.exists() && p.is_file() {
                    if let Ok(bytes) = std::fs::read(&p) {
                        if bytes.len() <= MAX_SCREENSHOT_BYTES {
                            let upload = crate::media::MediaUploadPayload {
                                kind: "screenshot".to_string(),
                                file_name: rel.clone(),
                                data: bytes.clone(),
                            };
                            if let Ok(info) = crate::media::save_media_asset(conn, db_path, &upload)
                            {
                                let new_name = media_file_name(&info.sha256, &info.ext);
                                let _ = conn.execute(
                                    "UPDATE trade_journal SET screenshot_path = ?1 WHERE trade_id = ?2",
                                    params![new_name, tid],
                                );
                            }
                        }
                    }
                }
            }
        }

        // 1. Media assets lokal
        let mut media_hashes = Vec::new();
        if let Ok(mut stmt) = conn.prepare("SELECT sha256, ext FROM media_assets") {
            if let Ok(rows) =
                stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            {
                for r in rows.flatten() {
                    media_hashes.push(r);
                }
            }
        }
        for (sha, ext) in media_hashes {
            if let Ok(Some(bytes)) = read_media_bytes_for_sync(db_path, &sha, &ext) {
                let fname = media_file_name(&sha, &ext);
                if !storage.has_media(&fname) {
                    storage.write_media(&fname, &bytes)?;
                    media_copied += 1;
                }
                self.emit_media_to_storage(conn, storage, &sha, Some(&bytes))?;
                emitted_ops += 1;
            }
        }

        // 2. Trades yang belum memiliki HLC
        let pending_trade_ids: Vec<i64> = {
            let mut stmt = conn
                .prepare("SELECT id FROM trades WHERE hlc IS NULL OR TRIM(hlc) = ''")
                .map_err(|e| format!("Gagal query bootstrap trades: {}", e))?;
            let rows = stmt
                .query_map([], |r| r.get::<_, i64>(0))
                .map_err(|e| format!("Gagal map bootstrap trades: {}", e))?;
            rows.filter_map(Result::ok).collect()
        };
        for tid in pending_trade_ids {
            self.emit_trade_snapshot_to_storage(conn, storage, tid, false)?;
            emitted_ops += 1;
        }

        // 3. Settings yang belum memiliki HLC (abaikan kunci lokal)
        if let Ok(all_settings) = get_all_settings(conn) {
            let mut ops = Vec::new();
            let mut keys_without_hlc = HashSet::new();
            if let Ok(mut stmt) =
                conn.prepare("SELECT key FROM settings WHERE hlc IS NULL OR TRIM(hlc) = ''")
            {
                if let Ok(rows) = stmt.query_map([], |r| r.get::<_, String>(0)) {
                    for k in rows.flatten() {
                        keys_without_hlc.insert(k);
                    }
                }
            }

            let now = now_millis();
            for (k, v) in all_settings {
                if is_local_only_setting_key(&k) || !keys_without_hlc.contains(&k) {
                    continue;
                }
                // Gunakan timestamp historis awal (1) agar bootstrap default tidak menimpa setting dari vault remote yang lebih baru
                let hlc = format_hlc(1, emitted_ops as u16, &device_id);
                let _ = conn.execute(
                    "UPDATE settings SET hlc = ?1 WHERE key = ?2",
                    params![hlc, k],
                );
                ops.push(SyncOp {
                    op_id: random_uuid(),
                    device_id: device_id.clone(),
                    hlc,
                    ts: now,
                    payload: SyncEntityOp::SettingUpsert {
                        key: k,
                        value: v,
                        updated_at: 1,
                        deleted_at: None,
                    },
                });
            }
            if !ops.is_empty() {
                emitted_ops += ops.len();
                self.write_ops(conn, storage, &ops)?;
            }
        }

        // 4. Balances
        if let Ok(balances) = get_all_balances(conn) {
            let mut ops = Vec::new();
            for b in balances {
                let has_hlc: Option<String> = conn
                    .query_row(
                        "SELECT hlc FROM account_balances WHERE exchange = ?1 AND asset = ?2",
                        params![b.exchange, b.asset],
                        |r| r.get(0),
                    )
                    .ok()
                    .flatten();
                if has_hlc.is_some() {
                    continue;
                }
                let hlc = format_hlc(b.updated_at.max(1), 0, &device_id);
                let _ = conn.execute(
                    "UPDATE account_balances SET hlc = ?1 WHERE exchange = ?2 AND asset = ?3",
                    params![hlc, b.exchange, b.asset],
                );
                ops.push(SyncOp {
                    op_id: random_uuid(),
                    device_id: device_id.clone(),
                    hlc,
                    ts: b.updated_at,
                    payload: SyncEntityOp::AccountBalanceUpsert {
                        exchange: b.exchange,
                        asset: b.asset,
                        total: b.total,
                        available: b.available,
                        unrealized_pnl: b.unrealized_pnl,
                        updated_at: b.updated_at,
                    },
                });
            }
            if !ops.is_empty() {
                emitted_ops += ops.len();
                self.write_ops(conn, storage, &ops)?;
            }
        }

        // 5. Kredensial Exchange & AI
        for &ex in SUPPORTED_EXCHANGES {
            let slot = format!("exchange:{}", ex);
            if get_meta(conn, &format!("cred_hlc:{}", slot)).is_some() {
                continue;
            }
            if let Some((creds, updated_at, hint)) = load_credentials_with_meta(ex) {
                if let Ok(bytes) = serde_json::to_vec(&creds) {
                    let hlc = format_hlc(updated_at.max(1), 0, &device_id);
                    self.emit_credential_to_storage(
                        conn,
                        storage,
                        master_key,
                        &slot,
                        Some(&bytes),
                        Some(&hint),
                        Some(hlc),
                    )?;
                    emitted_ops += 1;
                }
            }
        }

        if get_meta(conn, "cred_hlc:ai_openai").is_none() {
            if let Some((api_key, updated_at, hint)) = load_ai_api_key_with_meta() {
                let hlc = format_hlc(updated_at.max(1), 0, &device_id);
                self.emit_credential_to_storage(
                    conn,
                    storage,
                    master_key,
                    "ai_openai",
                    Some(api_key.as_bytes()),
                    Some(&hint),
                    Some(hlc),
                )?;
                emitted_ops += 1;
            }
        }

        // 6. Sync State per exchange (yang belum memiliki HLC dan pernah sinkron)
        for &ex in SUPPORTED_EXCHANGES {
            let row_meta: Option<(Option<String>, Option<i64>)> = conn
                .query_row(
                    "SELECT hlc, last_sync_at FROM sync_state WHERE exchange = ?1",
                    params![ex],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()
                .ok()
                .flatten();
            if let Some((None, Some(sync_at))) = row_meta {
                if let Ok(state) = get_sync_state(conn, ex) {
                    let hlc = format_hlc(sync_at.max(1), 0, &device_id);
                    let _ = conn.execute(
                        "UPDATE sync_state SET hlc = ?1 WHERE exchange = ?2",
                        params![hlc, ex],
                    );
                    let op = SyncOp {
                        op_id: random_uuid(),
                        device_id: device_id.clone(),
                        hlc,
                        ts: sync_at,
                        payload: SyncEntityOp::SyncStateUpsert {
                            exchange: state.exchange,
                            last_exit_time: state.last_exit_time,
                            last_external_id: state.last_external_id,
                            last_fill_time: state.last_fill_time,
                            last_fill_id: state.last_fill_id,
                            last_funding_time: state.last_funding_time,
                            last_sync_at: state.last_sync_at,
                            last_status: state.last_status,
                            last_error: state.last_error,
                        },
                    };
                    self.write_ops(conn, storage, &[op])?;
                    emitted_ops += 1;
                }
            }
        }

        Ok((emitted_ops, media_copied))
    }

    pub fn run_device_sync_now(
        &self,
        conn: &mut Connection,
        db_path: &Path,
    ) -> Result<DeviceSyncRunResult, String> {
        let Some(storage) = self.active_storage() else {
            return Ok(DeviceSyncRunResult {
                status: "skipped".to_string(),
                applied_ops: 0,
                emitted_ops: 0,
                media_synced: 0,
                credentials_synced: 0,
                duration_ms: 0,
                error: None,
            });
        };
        self.pull_from_storage(conn, db_path, storage.as_ref())
    }

    /// Membaca dan menggabungkan op baru dari seluruh perangkat lain di Sync Vault.
    pub fn pull_from_storage(
        &self,
        conn: &mut Connection,
        db_path: &Path,
        storage: &dyn VaultStorage,
    ) -> Result<DeviceSyncRunResult, String> {
        let start = Instant::now();
        let (local_device_id, master_key) = {
            let rt = self.runtime.lock().unwrap();
            (rt.device_id.clone(), rt.master_key)
        };

        let remote_files = storage.list_remote_op_files(&local_device_id)?;
        let mut applied_ops = 0;
        let mut media_synced = 0;
        let mut credentials_synced = 0;

        for file_info in remote_files {
            let prev_line: usize = conn
                .query_row(
                    "SELECT last_line FROM device_sync_cursors WHERE device_id = ?1 AND file_name = ?2",
                    params![file_info.device_id, file_info.file_name],
                    |r| r.get::<_, i64>(0),
                )
                .unwrap_or(0)
                .max(0) as usize;

            let (lines, next_line) =
                storage.read_op_lines(&file_info.device_id, &file_info.file_name, prev_line)?;
            if lines.is_empty() && next_line == prev_line {
                continue;
            }

            let mut cursor_to_save = next_line;
            for (line_idx, line) in lines {
                let op: SyncOp = match serde_json::from_str(&line) {
                    Ok(v) => v,
                    Err(e) => {
                        log::warn!(
                            "[device-sync] Menahan kursor di baris {} ({}/{}): baris JSON belum utuh/rusak ({})",
                            line_idx,
                            file_info.device_id,
                            file_info.file_name,
                            e
                        );
                        cursor_to_save = line_idx;
                        break;
                    }
                };
                self.observe_hlc(conn, &op.hlc);

                let (did_apply, did_media, did_cred) =
                    self.apply_remote_op(conn, db_path, storage, master_key.as_ref(), &op)?;
                if did_apply {
                    applied_ops += 1;
                }
                if did_media {
                    media_synced += 1;
                }
                if did_cred {
                    credentials_synced += 1;
                }
            }

            let now = now_millis();
            conn.execute(
                "INSERT INTO device_sync_cursors (device_id, file_name, last_line, updated_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(device_id, file_name) DO UPDATE SET
                   last_line = excluded.last_line,
                   updated_at = excluded.updated_at",
                params![
                    file_info.device_id,
                    file_info.file_name,
                    cursor_to_save as i64,
                    now
                ],
            )
            .map_err(|e| format!("Gagal menyimpan cursor device sync: {}", e))?;
        }

        // Rekonsiliasi berkas media yang metadatanya sudah tercatat namun file fisiknya
        // baru selesai diunduh Syncthing di folder `media/` Sync Vault.
        media_synced += self.reconcile_missing_local_media(conn, db_path, storage)?;

        let now = now_millis();
        let _ = set_meta(conn, META_LAST_SYNC_AT, &now.to_string());
        if applied_ops > 0 || media_synced > 0 || credentials_synced > 0 {
            let _ = set_meta(conn, META_LAST_REMOTE_SYNC_AT, &now.to_string());
        }
        del_meta(conn, META_LAST_SYNC_ERROR);
        if let Ok(mut rt) = self.runtime.lock() {
            rt.last_sync_at = Some(now);
            if applied_ops > 0 || media_synced > 0 || credentials_synced > 0 {
                rt.last_remote_sync_at = Some(now);
            }
            rt.last_error = None;
        }

        Ok(DeviceSyncRunResult {
            status: "ok".to_string(),
            applied_ops,
            emitted_ops: 0,
            media_synced,
            credentials_synced,
            duration_ms: start.elapsed().as_millis() as i64,
            error: None,
        })
    }

    /// Menarik ulang berkas media (avatar, wallpaper, screenshot, logo) yang metadatanya
    /// sudah ada di `media_assets` tetapi berkas fisiknya belum tersedia secara lokal
    /// (misalnya karena file oplog selesai disinkronkan Syncthing lebih dulu dari folder `media/`).
    fn reconcile_missing_local_media(
        &self,
        conn: &Connection,
        db_path: &Path,
        storage: &dyn VaultStorage,
    ) -> Result<usize, String> {
        let mut stmt = conn
            .prepare("SELECT sha256, ext FROM media_assets WHERE deleted_at IS NULL")
            .map_err(|e| format!("Gagal memeriksa daftar media_assets lokal: {}", e))?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| format!("Gagal membaca baris media_assets lokal: {}", e))?;

        let mut recovered = 0usize;
        for row in rows.flatten() {
            let (sha256, ext) = row;
            if matches!(read_media_bytes_for_sync(db_path, &sha256, &ext), Ok(Some(_))) {
                continue;
            }
            let fname = media_file_name(&sha256, &ext);
            if let Ok(Some(bytes)) = storage.read_media(&fname) {
                if crate::media::compute_sha256_hex(&bytes) == sha256 {
                    write_synced_media_bytes(db_path, &sha256, &ext, &bytes)?;
                    recovered += 1;
                }
            }
        }
        Ok(recovered)
    }

    fn apply_remote_op(
        &self,
        conn: &mut Connection,
        db_path: &Path,
        storage: &dyn VaultStorage,
        master_key: Option<&[u8; 32]>,
        op: &SyncOp,
    ) -> Result<(bool, bool, bool), String> {
        match &op.payload {
            SyncEntityOp::TradeUpsert {
                uuid,
                exchange,
                external_id,
                symbol,
                direction,
                entry_price,
                exit_price,
                entry_time,
                exit_time,
                size,
                leverage,
                margin_mode,
                realized_pnl,
                pnl_source,
                fee_open,
                fee_close,
                fee_open_maker,
                fee_close_maker,
                funding_fee,
                created_at,
                updated_at,
                deleted_at,
                field_clocks,
            } => {
                // Cari trade lokal berdasarkan uuid atau (exchange, external_id)
                let existing = conn
                    .query_row(
                        "SELECT id, exchange, external_id, symbol, direction,
                                entry_price, exit_price, entry_time, exit_time,
                                size, leverage, margin_mode, realized_pnl, pnl_source,
                                fee_open, fee_close, fee_open_maker, fee_close_maker,
                                funding_fee, updated_at, deleted_at, hlc, field_clocks
                         FROM trades
                         WHERE uuid = ?1 OR (?2 IS NOT NULL AND exchange = ?3 AND external_id = ?2)
                         LIMIT 1",
                        params![uuid, external_id, exchange],
                        |r| {
                            Ok((
                                r.get::<_, i64>(0)?,
                                r.get::<_, String>(1)?,
                                r.get::<_, Option<String>>(2)?,
                                r.get::<_, String>(3)?,
                                r.get::<_, String>(4)?,
                                r.get::<_, f64>(5)?,
                                r.get::<_, f64>(6)?,
                                r.get::<_, i64>(7)?,
                                r.get::<_, i64>(8)?,
                                r.get::<_, f64>(9)?,
                                r.get::<_, f64>(10)?,
                                r.get::<_, Option<String>>(11)?,
                                r.get::<_, f64>(12)?,
                                r.get::<_, String>(13)?,
                                r.get::<_, f64>(14)?,
                                r.get::<_, f64>(15)?,
                                r.get::<_, Option<f64>>(16)?,
                                r.get::<_, Option<f64>>(17)?,
                                r.get::<_, f64>(18)?,
                                r.get::<_, i64>(19)?,
                                r.get::<_, Option<i64>>(20)?,
                                r.get::<_, Option<String>>(21)?,
                                r.get::<_, Option<String>>(22)?,
                            ))
                        },
                    )
                    .optional()
                    .map_err(|e| format!("Gagal query trade merge: {}", e))?;

                if let Some((
                    id,
                    mut cur_ex,
                    mut cur_ext,
                    mut cur_sym,
                    mut cur_dir,
                    mut cur_ep,
                    mut cur_xp,
                    mut cur_et,
                    mut cur_xt,
                    mut cur_sz,
                    mut cur_lev,
                    mut cur_mm,
                    mut cur_pnl,
                    mut cur_ps,
                    mut cur_fo,
                    mut cur_fc,
                    mut cur_fom,
                    mut cur_fcm,
                    mut cur_ff,
                    mut cur_upd,
                    mut cur_del,
                    cur_hlc,
                    cur_fc_raw,
                )) = existing
                {
                    let mut local_clocks = parse_field_clocks(cur_fc_raw);
                    let mut any_changed = false;

                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        any_changed,
                        "exchange",
                        cur_ex,
                        exchange.clone()
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        any_changed,
                        "external_id",
                        cur_ext,
                        external_id.clone()
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        any_changed,
                        "symbol",
                        cur_sym,
                        symbol.clone()
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        any_changed,
                        "direction",
                        cur_dir,
                        direction.clone()
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        any_changed,
                        "entry_price",
                        cur_ep,
                        *entry_price
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        any_changed,
                        "exit_price",
                        cur_xp,
                        *exit_price
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        any_changed,
                        "entry_time",
                        cur_et,
                        *entry_time
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        any_changed,
                        "exit_time",
                        cur_xt,
                        *exit_time
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        any_changed,
                        "size",
                        cur_sz,
                        *size
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        any_changed,
                        "leverage",
                        cur_lev,
                        *leverage
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        any_changed,
                        "margin_mode",
                        cur_mm,
                        margin_mode.clone()
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        any_changed,
                        "realized_pnl",
                        cur_pnl,
                        *realized_pnl
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        any_changed,
                        "pnl_source",
                        cur_ps,
                        pnl_source.clone()
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        any_changed,
                        "fee_open",
                        cur_fo,
                        *fee_open
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        any_changed,
                        "fee_close",
                        cur_fc,
                        *fee_close
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        any_changed,
                        "fee_open_maker",
                        cur_fom,
                        *fee_open_maker
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        any_changed,
                        "fee_close_maker",
                        cur_fcm,
                        *fee_close_maker
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        any_changed,
                        "funding_fee",
                        cur_ff,
                        *funding_fee
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        any_changed,
                        "deleted_at",
                        cur_del,
                        *deleted_at
                    );

                    if !any_changed {
                        return Ok((false, false, false));
                    }
                    cur_upd = cur_upd.max(*updated_at);
                    let next_hlc = if is_hlc_newer(&op.hlc, cur_hlc.as_deref()) {
                        op.hlc.clone()
                    } else {
                        cur_hlc.unwrap_or_else(|| op.hlc.clone())
                    };

                    conn.execute(
                        "UPDATE trades SET
                           uuid = ?1, exchange = ?2, external_id = ?3, symbol = ?4, direction = ?5,
                           entry_price = ?6, exit_price = ?7, entry_time = ?8, exit_time = ?9,
                           size = ?10, leverage = ?11, margin_mode = ?12, realized_pnl = ?13,
                           pnl_source = ?14, fee_open = ?15, fee_close = ?16,
                           fee_open_maker = ?17, fee_close_maker = ?18, funding_fee = ?19,
                           updated_at = ?20, deleted_at = ?21, hlc = ?22, field_clocks = ?23
                         WHERE id = ?24",
                        params![
                            uuid,
                            cur_ex,
                            cur_ext,
                            cur_sym,
                            cur_dir,
                            cur_ep,
                            cur_xp,
                            cur_et,
                            cur_xt,
                            cur_sz,
                            cur_lev,
                            cur_mm,
                            cur_pnl,
                            cur_ps,
                            cur_fo,
                            cur_fc,
                            cur_fom,
                            cur_fcm,
                            cur_ff,
                            cur_upd,
                            cur_del,
                            next_hlc,
                            serialize_field_clocks(&local_clocks),
                            id
                        ],
                    )
                    .map_err(|e| format!("Gagal update trade hasil merge: {}", e))?;
                    Ok((true, false, false))
                } else {
                    conn.execute(
                        "INSERT INTO trades (
                           uuid, exchange, external_id, symbol, direction,
                           entry_price, exit_price, entry_time, exit_time,
                           size, leverage, margin_mode, realized_pnl, pnl_source,
                           fee_open, fee_close, fee_open_maker, fee_close_maker,
                           funding_fee, created_at, updated_at, deleted_at, hlc, field_clocks
                         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14,
                                   ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24)",
                        params![
                            uuid,
                            exchange,
                            external_id,
                            symbol,
                            direction,
                            entry_price,
                            exit_price,
                            entry_time,
                            exit_time,
                            size,
                            leverage,
                            margin_mode,
                            realized_pnl,
                            pnl_source,
                            fee_open,
                            fee_close,
                            fee_open_maker,
                            fee_close_maker,
                            funding_fee,
                            created_at,
                            updated_at,
                            deleted_at,
                            op.hlc,
                            serialize_field_clocks(field_clocks)
                        ],
                    )
                    .map_err(|e| format!("Gagal insert trade baru dari Sync Vault: {}", e))?;
                    Ok((true, false, false))
                }
            }
            SyncEntityOp::TradeJournalUpsert {
                trade_uuid,
                setup_tag,
                pre_trade_thesis,
                post_trade_review,
                emotion_tag,
                execution_grade,
                screenshot_path,
                updated_at,
                field_clocks,
            } => {
                let Some(trade_id) = find_trade_id_by_uuid(conn, trade_uuid) else {
                    return Ok((false, false, false));
                };

                let existing = conn
                    .query_row(
                        "SELECT setup_tag, pre_trade_thesis, post_trade_review, emotion_tag,
                                execution_grade, screenshot_path, updated_at, hlc, field_clocks
                         FROM trade_journal WHERE trade_id = ?1",
                        params![trade_id],
                        |r| {
                            Ok((
                                r.get::<_, Option<String>>(0)?,
                                r.get::<_, Option<String>>(1)?,
                                r.get::<_, Option<String>>(2)?,
                                r.get::<_, Option<String>>(3)?,
                                r.get::<_, Option<String>>(4)?,
                                r.get::<_, Option<String>>(5)?,
                                r.get::<_, i64>(6)?,
                                r.get::<_, Option<String>>(7)?,
                                r.get::<_, Option<String>>(8)?,
                            ))
                        },
                    )
                    .optional()
                    .map_err(|e| format!("Gagal baca trade_journal lokal: {}", e))?;

                if let Some((
                    mut cur_setup,
                    mut cur_thesis,
                    mut cur_review,
                    mut cur_emotion,
                    mut cur_grade,
                    mut cur_ss,
                    mut cur_upd,
                    cur_hlc,
                    cur_fc_raw,
                )) = existing
                {
                    let mut local_clocks = parse_field_clocks(cur_fc_raw);
                    let mut changed = false;

                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        changed,
                        "setup_tag",
                        cur_setup,
                        setup_tag.clone()
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        changed,
                        "pre_trade_thesis",
                        cur_thesis,
                        pre_trade_thesis.clone()
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        changed,
                        "post_trade_review",
                        cur_review,
                        post_trade_review.clone()
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        changed,
                        "emotion_tag",
                        cur_emotion,
                        emotion_tag.clone()
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        changed,
                        "execution_grade",
                        cur_grade,
                        execution_grade.clone()
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        changed,
                        "screenshot_path",
                        cur_ss,
                        screenshot_path.clone()
                    );

                    if !changed {
                        return Ok((false, false, false));
                    }
                    cur_upd = cur_upd.max(*updated_at);
                    let next_hlc = if is_hlc_newer(&op.hlc, cur_hlc.as_deref()) {
                        op.hlc.clone()
                    } else {
                        cur_hlc.unwrap_or_else(|| op.hlc.clone())
                    };

                    conn.execute(
                        "UPDATE trade_journal SET
                           setup_tag = ?1, pre_trade_thesis = ?2, post_trade_review = ?3,
                           emotion_tag = ?4, execution_grade = ?5, screenshot_path = ?6,
                           updated_at = ?7, hlc = ?8, field_clocks = ?9
                         WHERE trade_id = ?10",
                        params![
                            cur_setup,
                            cur_thesis,
                            cur_review,
                            cur_emotion,
                            cur_grade,
                            cur_ss,
                            cur_upd,
                            next_hlc,
                            serialize_field_clocks(&local_clocks),
                            trade_id
                        ],
                    )
                    .map_err(|e| format!("Gagal update trade_journal merge: {}", e))?;
                    Ok((true, false, false))
                } else {
                    conn.execute(
                        "INSERT INTO trade_journal (
                           trade_id, setup_tag, pre_trade_thesis, post_trade_review,
                           emotion_tag, execution_grade, screenshot_path, updated_at, hlc, field_clocks
                         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                        params![
                            trade_id,
                            setup_tag,
                            pre_trade_thesis,
                            post_trade_review,
                            emotion_tag,
                            execution_grade,
                            screenshot_path,
                            updated_at,
                            op.hlc,
                            serialize_field_clocks(field_clocks)
                        ],
                    )
                    .map_err(|e| format!("Gagal insert trade_journal dari Sync Vault: {}", e))?;
                    Ok((true, false, false))
                }
            }
            SyncEntityOp::PlannedRiskUpsert {
                trade_uuid,
                planned_stop,
                planned_target,
                risk_amount,
                planned_rr,
                field_clocks,
            } => {
                let Some(trade_id) = find_trade_id_by_uuid(conn, trade_uuid) else {
                    return Ok((false, false, false));
                };

                let existing = conn
                    .query_row(
                        "SELECT planned_stop, planned_target, risk_amount, planned_rr, hlc, field_clocks
                         FROM planned_risk WHERE trade_id = ?1",
                        params![trade_id],
                        |r| {
                            Ok((
                                r.get::<_, Option<f64>>(0)?,
                                r.get::<_, Option<f64>>(1)?,
                                r.get::<_, Option<f64>>(2)?,
                                r.get::<_, Option<f64>>(3)?,
                                r.get::<_, Option<String>>(4)?,
                                r.get::<_, Option<String>>(5)?,
                            ))
                        },
                    )
                    .optional()
                    .map_err(|e| format!("Gagal baca planned_risk lokal: {}", e))?;

                if let Some((
                    mut cur_stop,
                    mut cur_target,
                    mut cur_risk,
                    mut cur_rr,
                    cur_hlc,
                    cur_fc_raw,
                )) = existing
                {
                    let mut local_clocks = parse_field_clocks(cur_fc_raw);
                    let mut changed = false;

                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        changed,
                        "planned_stop",
                        cur_stop,
                        *planned_stop
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        changed,
                        "planned_target",
                        cur_target,
                        *planned_target
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        changed,
                        "risk_amount",
                        cur_risk,
                        *risk_amount
                    );
                    merge_lww_field!(
                        field_clocks,
                        op.hlc,
                        local_clocks,
                        cur_hlc,
                        changed,
                        "planned_rr",
                        cur_rr,
                        *planned_rr
                    );

                    if !changed {
                        return Ok((false, false, false));
                    }
                    let next_hlc = if is_hlc_newer(&op.hlc, cur_hlc.as_deref()) {
                        op.hlc.clone()
                    } else {
                        cur_hlc.unwrap_or_else(|| op.hlc.clone())
                    };

                    conn.execute(
                        "UPDATE planned_risk SET
                           planned_stop = ?1, planned_target = ?2, risk_amount = ?3, planned_rr = ?4,
                           hlc = ?5, field_clocks = ?6
                         WHERE trade_id = ?7",
                        params![
                            cur_stop,
                            cur_target,
                            cur_risk,
                            cur_rr,
                            next_hlc,
                            serialize_field_clocks(&local_clocks),
                            trade_id
                        ],
                    )
                    .map_err(|e| format!("Gagal update planned_risk merge: {}", e))?;
                    Ok((true, false, false))
                } else {
                    conn.execute(
                        "INSERT INTO planned_risk (trade_id, planned_stop, planned_target, risk_amount, planned_rr, hlc, field_clocks)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                        params![
                            trade_id,
                            planned_stop,
                            planned_target,
                            risk_amount,
                            planned_rr,
                            op.hlc,
                            serialize_field_clocks(field_clocks)
                        ],
                    )
                    .map_err(|e| format!("Gagal insert planned_risk dari Sync Vault: {}", e))?;
                    Ok((true, false, false))
                }
            }
            SyncEntityOp::TradeChecklistReplace { trade_uuid, items } => {
                let Some(trade_id) = find_trade_id_by_uuid(conn, trade_uuid) else {
                    return Ok((false, false, false));
                };
                let cur_clk = get_meta(conn, &format!("checklist_hlc:{}", trade_uuid));
                if !is_hlc_newer(&op.hlc, cur_clk.as_deref()) {
                    return Ok((false, false, false));
                }
                let tx = conn
                    .transaction()
                    .map_err(|e| format!("Gagal memulai tx checklist sync: {}", e))?;
                tx.execute(
                    "DELETE FROM journal_checklist WHERE trade_id = ?1",
                    params![trade_id],
                )
                .map_err(|e| format!("Gagal membersihkan checklist lama: {}", e))?;
                {
                    let mut ins = tx
                        .prepare("INSERT INTO journal_checklist (trade_id, label, checked, sort_order) VALUES (?1, ?2, ?3, ?4)")
                        .map_err(|e| format!("Gagal prepare checklist sync: {}", e))?;
                    for item in items {
                        ins.execute(params![
                            trade_id,
                            item.label,
                            if item.checked { 1 } else { 0 },
                            item.sort_order
                        ])
                        .map_err(|e| format!("Gagal insert checklist sync: {}", e))?;
                    }
                }
                tx.commit()
                    .map_err(|e| format!("Gagal commit checklist sync: {}", e))?;
                let _ = set_meta(conn, &format!("checklist_hlc:{}", trade_uuid), &op.hlc);
                Ok((true, false, false))
            }
            SyncEntityOp::TradeTagsReplace { trade_uuid, tags } => {
                let Some(trade_id) = find_trade_id_by_uuid(conn, trade_uuid) else {
                    return Ok((false, false, false));
                };
                let cur_clk = get_meta(conn, &format!("tags_hlc:{}", trade_uuid));
                if !is_hlc_newer(&op.hlc, cur_clk.as_deref()) {
                    return Ok((false, false, false));
                }
                let now = now_millis();
                let tx = conn
                    .transaction()
                    .map_err(|e| format!("Gagal memulai tx tags sync: {}", e))?;
                tx.execute(
                    "DELETE FROM trade_journal_tags WHERE trade_id = ?1",
                    params![trade_id],
                )
                .map_err(|e| format!("Gagal bersihkan tags lama: {}", e))?;
                for raw_name in tags {
                    let clean = crate::db::repositories::trades::normalize_tag_name(raw_name);
                    if clean.is_empty() {
                        continue;
                    }
                    let tag_id: i64 = match tx.query_row(
                        "SELECT id FROM journal_tags WHERE name = ?1 COLLATE NOCASE",
                        params![&clean],
                        |r| r.get(0),
                    ) {
                        Ok(id) => id,
                        Err(_) => {
                            tx.execute(
                                "INSERT INTO journal_tags (name, created_at) VALUES (?1, ?2)",
                                params![&clean, now],
                            )
                            .map_err(|e| format!("Gagal insert tag baru: {}", e))?;
                            tx.last_insert_rowid()
                        }
                    };
                    tx.execute(
                        "INSERT OR IGNORE INTO trade_journal_tags (trade_id, tag_id) VALUES (?1, ?2)",
                        params![trade_id, tag_id],
                    )
                    .map_err(|e| format!("Gagal tautkan tag sync: {}", e))?;
                }
                tx.commit()
                    .map_err(|e| format!("Gagal commit tags sync: {}", e))?;
                let _ = set_meta(conn, &format!("tags_hlc:{}", trade_uuid), &op.hlc);
                Ok((true, false, false))
            }
            SyncEntityOp::AccountBalanceUpsert {
                exchange,
                asset,
                total,
                available,
                unrealized_pnl,
                updated_at,
            } => {
                let cur_hlc: Option<String> = conn
                    .query_row(
                        "SELECT hlc FROM account_balances WHERE exchange = ?1 AND asset = ?2",
                        params![exchange, asset],
                        |r| r.get(0),
                    )
                    .ok()
                    .flatten();
                if !is_hlc_newer(&op.hlc, cur_hlc.as_deref()) {
                    return Ok((false, false, false));
                }
                conn.execute(
                    "INSERT INTO account_balances (exchange, asset, total, available, unrealized_pnl, updated_at, hlc)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                     ON CONFLICT(exchange, asset) DO UPDATE SET
                       total = excluded.total,
                       available = excluded.available,
                       unrealized_pnl = excluded.unrealized_pnl,
                       updated_at = excluded.updated_at,
                       hlc = excluded.hlc",
                    params![exchange, asset, total, available, unrealized_pnl, updated_at, op.hlc],
                )
                .map_err(|e| format!("Gagal merge account_balance: {}", e))?;
                Ok((true, false, false))
            }
            SyncEntityOp::SyncStateUpsert {
                exchange,
                last_exit_time,
                last_external_id,
                last_fill_time,
                last_fill_id,
                last_funding_time,
                last_sync_at,
                last_status,
                last_error,
            } => {
                let cur_hlc: Option<String> = conn
                    .query_row(
                        "SELECT hlc FROM sync_state WHERE exchange = ?1",
                        params![exchange],
                        |r| r.get(0),
                    )
                    .ok()
                    .flatten();
                if !is_hlc_newer(&op.hlc, cur_hlc.as_deref()) {
                    return Ok((false, false, false));
                }
                conn.execute(
                    "INSERT INTO sync_state (
                       exchange, last_exit_time, last_external_id, last_fill_time, last_fill_id,
                       last_funding_time, last_sync_at, last_status, last_error, hlc
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                     ON CONFLICT(exchange) DO UPDATE SET
                       last_exit_time = COALESCE(excluded.last_exit_time, sync_state.last_exit_time),
                       last_external_id = COALESCE(excluded.last_external_id, sync_state.last_external_id),
                       last_fill_time = COALESCE(excluded.last_fill_time, sync_state.last_fill_time),
                       last_fill_id = COALESCE(excluded.last_fill_id, sync_state.last_fill_id),
                       last_funding_time = COALESCE(excluded.last_funding_time, sync_state.last_funding_time),
                       last_sync_at = excluded.last_sync_at,
                       last_status = excluded.last_status,
                       last_error = excluded.last_error,
                       hlc = excluded.hlc",
                    params![
                        exchange,
                        last_exit_time,
                        last_external_id,
                        last_fill_time,
                        last_fill_id,
                        last_funding_time,
                        last_sync_at,
                        last_status,
                        last_error,
                        op.hlc
                    ],
                )
                .map_err(|e| format!("Gagal merge sync_state: {}", e))?;
                Ok((true, false, false))
            }
            SyncEntityOp::SettingUpsert {
                key,
                value,
                updated_at,
                deleted_at,
            } => {
                if is_local_only_setting_key(key) {
                    return Ok((false, false, false));
                }
                let cur_hlc: Option<String> = conn
                    .query_row(
                        "SELECT hlc FROM settings WHERE key = ?1",
                        params![key],
                        |r| r.get(0),
                    )
                    .ok()
                    .flatten();
                if !is_hlc_newer(&op.hlc, cur_hlc.as_deref()) {
                    return Ok((false, false, false));
                }
                if deleted_at.is_some() {
                    conn.execute(
                        "UPDATE settings SET deleted_at = ?1, updated_at = ?2, hlc = ?3 WHERE key = ?4",
                        params![deleted_at, updated_at, op.hlc, key],
                    )
                    .map_err(|e| format!("Gagal hapus lunak setting: {}", e))?;
                } else {
                    set_setting(conn, key, value)
                        .map_err(|e| format!("Gagal set setting dari Sync Vault: {}", e))?;
                    conn.execute(
                        "UPDATE settings SET updated_at = ?1, hlc = ?2, deleted_at = NULL WHERE key = ?3",
                        params![updated_at, op.hlc, key],
                    )
                    .map_err(|e| format!("Gagal update clock setting: {}", e))?;
                }
                Ok((true, false, false))
            }
            SyncEntityOp::MediaAssetUpsert {
                sha256,
                kind,
                ext,
                mime,
                size_bytes,
                original_name,
                created_at,
                deleted_at,
            } => {
                conn.execute(
                    "INSERT INTO media_assets (sha256, kind, ext, mime, size_bytes, original_name, created_at, deleted_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                     ON CONFLICT(sha256) DO UPDATE SET
                       deleted_at = COALESCE(excluded.deleted_at, media_assets.deleted_at)",
                    params![sha256, kind, ext, mime, size_bytes, original_name, created_at, deleted_at],
                )
                .map_err(|e| format!("Gagal merge metadata media: {}", e))?;

                let mut synced_file = false;
                if deleted_at.is_none() {
                    let fname = media_file_name(sha256, ext);
                    if let Ok(Some(bytes)) = storage.read_media(&fname) {
                        if crate::media::compute_sha256_hex(&bytes) == *sha256 {
                            write_synced_media_bytes(db_path, sha256, ext, &bytes)?;
                            synced_file = true;
                        }
                    }
                }
                Ok((true, synced_file, false))
            }
            SyncEntityOp::CredentialUpsert {
                slot,
                encrypted_payload_b64,
                deleted_at,
                ..
            } => {
                let Some(mk) = master_key else {
                    return Ok((false, false, false));
                };
                let cur_clk = get_meta(conn, &format!("cred_hlc:{}", slot));
                if !is_hlc_newer(&op.hlc, cur_clk.as_deref()) {
                    return Ok((false, false, false));
                }

                if deleted_at.is_some() {
                    if let Some(ex) = slot.strip_prefix("exchange:") {
                        delete_credentials(ex)?;
                    } else if slot == "ai_openai" {
                        delete_ai_api_key()?;
                    }
                } else if let Some(enc_b64) = encrypted_payload_b64 {
                    let decrypted = decrypt_bytes_b64(mk, enc_b64)?;
                    if let Some(ex) = slot.strip_prefix("exchange:") {
                        let creds: ExchangeCredentials = serde_json::from_slice(&decrypted)
                            .map_err(|e| {
                                format!("Gagal parse kredensial exchange {}: {}", ex, e)
                            })?;
                        save_credentials(ex, &creds.api_key, &creds.api_secret)?;
                    } else if slot == "ai_openai" {
                        let api_key = String::from_utf8(decrypted)
                            .map_err(|_| "API Key AI terdekripsi bukan UTF-8 valid.".to_string())?;
                        save_ai_api_key(&api_key)?;
                    }
                }
                let _ = set_meta(conn, &format!("cred_hlc:{}", slot), &op.hlc);
                Ok((true, false, true))
            }
        }
    }
}

fn find_trade_id_by_uuid(conn: &Connection, uuid: &str) -> Option<i64> {
    conn.query_row(
        "SELECT id FROM trades WHERE uuid = ?1",
        params![uuid],
        |r| r.get::<_, i64>(0),
    )
    .ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::run_migrations;
    use crate::db::repositories::trades::{create_trade, delete_trade, get_trade, update_trade};
    use crate::models::{JournalInput, TradeInput};
    use std::fs;

    fn setup_device_db(temp_root: &Path, name: &str) -> (Connection, PathBuf, VaultState) {
        let dir = temp_root.join(name);
        let _ = fs::create_dir_all(&dir);
        let db_path = dir.join("trading-journal.sqlite");
        let mut conn = Connection::open(&db_path).unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        run_migrations(&mut conn).unwrap();
        let state = VaultState::from_db(&conn, &db_path);
        (conn, db_path, state)
    }

    #[test]
    fn test_two_device_sync_field_level_lww_dedup_tombstone_and_credentials() {
        let temp_root =
            std::env::temp_dir().join(format!("nitirekso-vault-test-{}", rand::random::<u64>()));
        let vault_dir = temp_root.join("shared-vault");
        let storage = FsVaultStorage::new(vault_dir.clone());

        let (mut conn_pc, path_pc, vault_pc) = setup_device_db(&temp_root, "pc");
        let (mut conn_hp, path_hp, vault_hp) = setup_device_db(&temp_root, "android");

        // 1. PC buat trade manual + connect Sync Vault dengan passphrase
        let trade_in = TradeInput {
            exchange: "manual".to_string(),
            external_id: None,
            symbol: "BTCUSDT".to_string(),
            direction: "long".to_string(),
            entry_price: 60000.0,
            exit_price: 62000.0,
            entry_time: 1700000000000,
            exit_time: 1700003600000,
            size: 0.5,
            leverage: 10.0,
            margin_mode: Some("isolated".to_string()),
            realized_pnl: 1000.0,
            fee_open: 2.0,
            fee_close: 2.0,
            funding_fee: 0.0,
        };
        let j_in = JournalInput {
            setup_tag: Some("Breakout".to_string()),
            emotion_tag: Some("calm".to_string()),
            ..Default::default()
        };
        let pc_tid = create_trade(&mut conn_pc, &trade_in, Some(&j_in), None).unwrap();

        let connect_pc = vault_pc
            .connect_with_storage(
                &mut conn_pc,
                &path_pc,
                &storage,
                vault_dir.to_str().unwrap(),
                "passphrase-aman-123",
            )
            .unwrap();
        assert_eq!(connect_pc.status, "ok");
        assert!(connect_pc.emitted_ops >= 1);

        // 2. Android gagal connect jika passphrase salah
        let bad_hp = vault_hp.connect_with_storage(
            &mut conn_hp,
            &path_hp,
            &storage,
            vault_dir.to_str().unwrap(),
            "salah-sandi",
        );
        assert!(bad_hp.is_err());

        // 3. Android connect dengan passphrase benar -> trade dari PC tersinkron
        let ok_hp = vault_hp
            .connect_with_storage(
                &mut conn_hp,
                &path_hp,
                &storage,
                vault_dir.to_str().unwrap(),
                "passphrase-aman-123",
            )
            .unwrap();
        assert!(ok_hp.applied_ops >= 1);

        let hp_tid: i64 = conn_hp
            .query_row("SELECT id FROM trades WHERE symbol = 'BTCUSDT'", [], |r| {
                r.get(0)
            })
            .unwrap();

        // 4. Edit offline bersamaan pada kolom berbeda di kedua perangkat
        // PC ubah setup_tag
        let j_pc_edit = JournalInput {
            setup_tag: Some("Liquidity Sweep".to_string()),
            emotion_tag: Some("calm".to_string()),
            ..Default::default()
        };
        update_trade(&mut conn_pc, pc_tid, &trade_in, Some(&j_pc_edit), None).unwrap();
        // Simulasikan hanya kolom setup_tag di PC yang ber-HLC baru (HLC lebih lama sedikit dari HP)
        let hlc_pc = vault_pc.next_hlc(&conn_pc);
        let mut fc_pc = parse_field_clocks(
            conn_pc
                .query_row(
                    "SELECT field_clocks FROM trade_journal WHERE trade_id = ?1",
                    params![pc_tid],
                    |r| r.get(0),
                )
                .unwrap(),
        );
        fc_pc.insert("setup_tag".to_string(), hlc_pc.clone());
        let _ = conn_pc.execute(
            "UPDATE trade_journal SET field_clocks = ?1 WHERE trade_id = ?2",
            params![serialize_field_clocks(&fc_pc), pc_tid],
        );
        vault_pc
            .emit_trade_snapshot_to_storage(&conn_pc, &storage, pc_tid, false)
            .unwrap();

        // Android ubah emotion_tag dengan HLC lebih baru
        std::thread::sleep(std::time::Duration::from_millis(5));
        let j_hp_edit = JournalInput {
            setup_tag: Some("Breakout".to_string()),
            emotion_tag: Some("disciplined".to_string()),
            ..Default::default()
        };
        update_trade(&mut conn_hp, hp_tid, &trade_in, Some(&j_hp_edit), None).unwrap();
        let hlc_hp = vault_hp.next_hlc(&conn_hp);
        let mut fc_hp = parse_field_clocks(
            conn_hp
                .query_row(
                    "SELECT field_clocks FROM trade_journal WHERE trade_id = ?1",
                    params![hp_tid],
                    |r| r.get(0),
                )
                .unwrap(),
        );
        fc_hp.insert("emotion_tag".to_string(), hlc_hp.clone());
        let _ = conn_hp.execute(
            "UPDATE trade_journal SET field_clocks = ?1 WHERE trade_id = ?2",
            params![serialize_field_clocks(&fc_hp), hp_tid],
        );
        vault_hp
            .emit_trade_snapshot_to_storage(&conn_hp, &storage, hp_tid, false)
            .unwrap();

        // Pull di kedua perangkat: keduanya harus memiliki setup_tag = "Liquidity Sweep" AND emotion_tag = "disciplined"
        vault_pc
            .pull_from_storage(&mut conn_pc, &path_pc, &storage)
            .unwrap();
        vault_hp
            .pull_from_storage(&mut conn_hp, &path_hp, &storage)
            .unwrap();

        let pc_detail = get_trade(&conn_pc, pc_tid).unwrap().unwrap();
        let hp_detail = get_trade(&conn_hp, hp_tid).unwrap().unwrap();

        assert_eq!(
            pc_detail.journal.as_ref().unwrap().setup_tag.as_deref(),
            Some("Liquidity Sweep")
        );
        assert_eq!(
            pc_detail.journal.as_ref().unwrap().emotion_tag.as_deref(),
            Some("disciplined")
        );
        assert_eq!(
            hp_detail.journal.as_ref().unwrap().setup_tag.as_deref(),
            Some("Liquidity Sweep")
        );
        assert_eq!(
            hp_detail.journal.as_ref().unwrap().emotion_tag.as_deref(),
            Some("disciplined")
        );

        // 5. Anti-duplikasi Exchange Sync (UUIDv5 deterministik dari exchange + external_id)
        let ex_pos = TradeInput {
            exchange: "mexc".to_string(),
            external_id: Some("mexc-pos-777".to_string()),
            ..trade_in.clone()
        };
        let pc_ex_id = create_trade(&mut conn_pc, &ex_pos, None, None).unwrap();
        let hp_ex_id = create_trade(&mut conn_hp, &ex_pos, None, None).unwrap();
        vault_pc
            .emit_trade_snapshot_to_storage(&conn_pc, &storage, pc_ex_id, true)
            .unwrap();
        vault_hp
            .emit_trade_snapshot_to_storage(&conn_hp, &storage, hp_ex_id, true)
            .unwrap();
        vault_pc
            .pull_from_storage(&mut conn_pc, &path_pc, &storage)
            .unwrap();
        vault_hp
            .pull_from_storage(&mut conn_hp, &path_hp, &storage)
            .unwrap();

        let count_pc: i64 = conn_pc
            .query_row(
                "SELECT COUNT(*) FROM trades WHERE external_id = 'mexc-pos-777' AND deleted_at IS NULL",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let count_hp: i64 = conn_hp
            .query_row(
                "SELECT COUNT(*) FROM trades WHERE external_id = 'mexc-pos-777' AND deleted_at IS NULL",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count_pc, 1);
        assert_eq!(count_hp, 1);

        // 6. Tombstone soft-delete tersinkron
        delete_trade(&conn_pc, pc_tid).unwrap();
        vault_pc
            .emit_trade_snapshot_to_storage(&conn_pc, &storage, pc_tid, true)
            .unwrap();
        vault_hp
            .pull_from_storage(&mut conn_hp, &path_hp, &storage)
            .unwrap();
        assert!(get_trade(&conn_hp, hp_tid).unwrap().is_none());

        // 7. File sementara Syncthing diabaikan
        let ops_pc_dir = vault_dir
            .join("ops")
            .join(vault_pc.runtime.lock().unwrap().device_id.clone());
        fs::write(
            ops_pc_dir.join(".syncthing.2026-11-22-001.jsonl.tmp"),
            b"{corrupt",
        )
        .unwrap();
        let remote_files = storage
            .list_remote_op_files(&vault_hp.runtime.lock().unwrap().device_id)
            .unwrap();
        assert!(
            !remote_files
                .iter()
                .any(|f| f.file_name.contains(".syncthing."))
        );

        let _ = fs::remove_dir_all(&temp_root);
    }

    #[test]
    fn test_regression_exchange_sync_preserves_journal_empty_checklist_partial_line_and_snapshot_meta()
     {
        use crate::backup::restore_backup_from_path;
        use crate::models::ChecklistInputItem;

        let temp_root =
            std::env::temp_dir().join(format!("nitirekso-vault-reg-{}", rand::random::<u64>()));
        let vault_dir = temp_root.join("shared-vault");
        let storage = FsVaultStorage::new(vault_dir.clone());

        let (mut conn_pc, path_pc, vault_pc) = setup_device_db(&temp_root, "pc");
        let (mut conn_hp, path_hp, vault_hp) = setup_device_db(&temp_root, "android");

        // 1. Exchange trade dibuat di kedua perangkat + checklist & tags di Android
        let trade_in = TradeInput {
            exchange: "mexc".to_string(),
            external_id: Some("mexc-reg-1".to_string()),
            symbol: "ETHUSDT".to_string(),
            direction: "long".to_string(),
            entry_price: 3000.0,
            exit_price: 3100.0,
            entry_time: 1700000000000,
            exit_time: 1700003600000,
            size: 1.0,
            leverage: 5.0,
            margin_mode: Some("isolated".to_string()),
            realized_pnl: 100.0,
            fee_open: 1.0,
            fee_close: 1.0,
            funding_fee: 0.0,
        };
        let pc_tid = create_trade(&mut conn_pc, &trade_in, None, None).unwrap();
        let j_hp = JournalInput {
            post_trade_review: Some("Review offline dari HP".to_string()),
            tags: Some(vec!["Scalp".to_string()]),
            checklist: Some(vec![ChecklistInputItem {
                label: "Cek tren".to_string(),
                checked: true,
            }]),
            ..Default::default()
        };
        let hp_tid = create_trade(&mut conn_hp, &trade_in, Some(&j_hp), None).unwrap();

        vault_pc
            .connect_with_storage(
                &mut conn_pc,
                &path_pc,
                &storage,
                vault_dir.to_str().unwrap(),
                "pass-reg-123",
            )
            .unwrap();
        vault_hp
            .connect_with_storage(
                &mut conn_hp,
                &path_hp,
                &storage,
                vault_dir.to_str().unwrap(),
                "pass-reg-123",
            )
            .unwrap();

        // PC menjalankan emit_trade_only_if_connected (simulasi Exchange Sync belakangan di PC)
        std::thread::sleep(std::time::Duration::from_millis(5));
        conn_pc
            .execute(
                "UPDATE trades SET funding_fee = -2.5 WHERE id = ?1",
                params![pc_tid],
            )
            .unwrap();
        vault_pc
            .emit_trade_only_if_connected(&conn_pc, pc_tid)
            .unwrap();

        vault_hp
            .pull_from_storage(&mut conn_hp, &path_hp, &storage)
            .unwrap();
        let hp_after_ex = get_trade(&conn_hp, hp_tid).unwrap().unwrap();
        assert_eq!(hp_after_ex.trade.funding_fee, -2.5);
        assert_eq!(
            hp_after_ex
                .journal
                .as_ref()
                .unwrap()
                .post_trade_review
                .as_deref(),
            Some("Review offline dari HP")
        );

        // 2. Mengosongkan checklist & tags pada edit di HP harus tersinkron ke PC
        std::thread::sleep(std::time::Duration::from_millis(5));
        let before_hp = get_trade(&conn_hp, hp_tid).unwrap();
        let j_empty = JournalInput {
            post_trade_review: Some("Review offline dari HP".to_string()),
            tags: Some(vec![]),
            checklist: Some(vec![]),
            ..Default::default()
        };
        update_trade(&mut conn_hp, hp_tid, &trade_in, Some(&j_empty), None).unwrap();
        let after_hp = get_trade(&conn_hp, hp_tid).unwrap();
        vault_hp
            .emit_trade_update_diff_if_connected(
                &conn_hp,
                hp_tid,
                before_hp.as_ref(),
                after_hp.as_ref(),
            )
            .unwrap();

        vault_pc
            .pull_from_storage(&mut conn_pc, &path_pc, &storage)
            .unwrap();
        let pc_after_clear = get_trade(&conn_pc, pc_tid).unwrap().unwrap();
        assert!(pc_after_clear.checklist.is_empty());
        assert!(pc_after_clear.tags.is_empty());

        // 3. Baris JSON parsial di akhir file op-log tidak memajukan cursor melewati baris tersebut
        let pc_dev_id = vault_pc.runtime.lock().unwrap().device_id.clone();
        let partial_file = vault_dir
            .join("ops")
            .join(&pc_dev_id)
            .join("2099-01-01-001.jsonl");
        let valid_op_json = serde_json::to_string(&SyncOp {
            op_id: random_uuid(),
            device_id: pc_dev_id.clone(),
            hlc: vault_pc.next_hlc(&conn_pc),
            ts: now_millis(),
            payload: SyncEntityOp::SettingUpsert {
                key: "theme".to_string(),
                value: serde_json::json!("light"),
                updated_at: now_millis(),
                deleted_at: None,
            },
        })
        .unwrap();
        fs::write(
            &partial_file,
            format!("{}\n{{\"half_written\":", valid_op_json),
        )
        .unwrap();

        vault_hp
            .pull_from_storage(&mut conn_hp, &path_hp, &storage)
            .unwrap();
        let saved_cursor: i64 = conn_hp
            .query_row(
                "SELECT last_line FROM device_sync_cursors WHERE device_id = ?1 AND file_name = '2099-01-01-001.jsonl'",
                params![pc_dev_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            saved_cursor, 1,
            "Kursor harus tertahan pada baris JSON parsial"
        );

        // Lengkapi baris kedua lalu pull ulang -> harus terbaca dan cursor maju ke 2
        let valid_op_2 = serde_json::to_string(&SyncOp {
            op_id: random_uuid(),
            device_id: pc_dev_id.clone(),
            hlc: vault_pc.next_hlc(&conn_pc),
            ts: now_millis(),
            payload: SyncEntityOp::SettingUpsert {
                key: "hidePnl".to_string(),
                value: serde_json::json!(true),
                updated_at: now_millis(),
                deleted_at: None,
            },
        })
        .unwrap();
        fs::write(
            &partial_file,
            format!("{}\n{}\n", valid_op_json, valid_op_2),
        )
        .unwrap();
        vault_hp
            .pull_from_storage(&mut conn_hp, &path_hp, &storage)
            .unwrap();
        let saved_cursor_2: i64 = conn_hp
            .query_row(
                "SELECT last_line FROM device_sync_cursors WHERE device_id = ?1 AND file_name = '2099-01-01-001.jsonl'",
                params![pc_dev_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(saved_cursor_2, 2);

        // 4. Restore Local Snapshot tidak menimpa device_id atau sync_vault_path milik perangkat ini
        let snap_dir = temp_root.join("snap");
        fs::create_dir_all(&snap_dir).unwrap();
        let foreign_db = temp_root.join("foreign.sqlite");
        let mut foreign_conn = Connection::open(&foreign_db).unwrap();
        run_migrations(&mut foreign_conn).unwrap();
        fs::copy(&foreign_db, snap_dir.join("trading-journal-database.db")).unwrap();

        let original_hp_dev = get_meta(&conn_hp, META_DEVICE_ID).unwrap();
        restore_backup_from_path(&mut conn_hp, &path_hp, Some(&snap_dir)).unwrap();
        assert_eq!(get_meta(&conn_hp, META_DEVICE_ID).unwrap(), original_hp_dev);
        assert!(get_meta(&conn_hp, META_SYNC_VAULT_PATH).is_some());

        let _ = fs::remove_dir_all(&temp_root);
    }

    #[test]
    fn test_reconcile_missing_local_media_recovers_delayed_vault_media() {
        let temp_root = std::env::temp_dir().join(format!(
            "nitirekso-vault-delayed-media-test-{}",
            rand::random::<u32>()
        ));
        let vault_dir = temp_root.join("vault");
        let pc_dir = temp_root.join("pc");
        let hp_dir = temp_root.join("hp");
        let path_pc = pc_dir.join("pc.sqlite");
        let path_hp = hp_dir.join("hp.sqlite");
        fs::create_dir_all(&vault_dir).unwrap();
        fs::create_dir_all(&pc_dir).unwrap();
        fs::create_dir_all(&hp_dir).unwrap();

        let mut conn_pc = Connection::open(&path_pc).unwrap();
        let mut conn_hp = Connection::open(&path_hp).unwrap();
        run_migrations(&mut conn_pc).unwrap();
        run_migrations(&mut conn_hp).unwrap();

        let storage = FsVaultStorage::new(vault_dir.clone());
        let vault_pc = VaultState::from_db(&conn_pc, &path_pc);
        let vault_hp = VaultState::from_db(&conn_hp, &path_hp);
        vault_pc
            .connect_with_storage(&mut conn_pc, &path_pc, &storage, vault_dir.to_str().unwrap(), "test-pass")
            .unwrap();
        vault_hp
            .connect_with_storage(&mut conn_hp, &path_hp, &storage, vault_dir.to_str().unwrap(), "test-pass")
            .unwrap();

        // Buat aset PNG valid di PC lalu hapus file fisiknya di vault sementara untuk simulasi
        // kondisi Syncthing: oplog datang duluan sebelum folder `media/` selesai disinkronkan.
        let png_bytes = vec![
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00,
            0x00, 0x90, 0x77, 0x53, 0xDE,
        ];
        let media_info = crate::media::save_media_asset(
            &conn_pc,
            &path_pc,
            &crate::media::MediaUploadPayload {
                kind: "share_media".to_string(),
                file_name: "wallpaper.png".to_string(),
                data: png_bytes.clone(),
            },
        )
        .unwrap();
        vault_pc
            .emit_media_upsert(&conn_pc, &media_info.sha256, Some(&png_bytes))
            .unwrap();

        let fname = media_file_name(&media_info.sha256, &media_info.ext);
        let vault_media_file = vault_dir.join("media").join(&fname);
        let backup_bytes = fs::read(&vault_media_file).unwrap();
        fs::remove_file(&vault_media_file).unwrap();

        // Sync pertama di HP: oplog MediaAssetUpsert diterapkan, tapi file fisik belum ada di vault
        let res1 = vault_hp.run_device_sync_now(&mut conn_hp, &path_hp).unwrap();
        assert_eq!(res1.media_synced, 0);
        assert!(
            read_media_bytes_for_sync(&path_hp, &media_info.sha256, &media_info.ext)
                .unwrap()
                .is_none()
        );

        // Syncthing kemudian menyelesaikan transfer berkas ke folder `media/` vault
        fs::write(&vault_media_file, &backup_bytes).unwrap();

        // Sync kedua di HP: rekonsiliasi media otomatis menarik berkas fisik yang tertunda
        let res2 = vault_hp.run_device_sync_now(&mut conn_hp, &path_hp).unwrap();
        assert_eq!(res2.media_synced, 1);
        assert_eq!(
            read_media_bytes_for_sync(&path_hp, &media_info.sha256, &media_info.ext)
                .unwrap()
                .unwrap(),
            png_bytes
        );

        let _ = fs::remove_dir_all(&temp_root);
    }
}
