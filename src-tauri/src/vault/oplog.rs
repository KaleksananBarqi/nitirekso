use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecklistOpItem {
    pub label: String,
    pub checked: bool,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "entity", rename_all = "snake_case")]
pub enum SyncEntityOp {
    TradeUpsert {
        uuid: String,
        exchange: String,
        external_id: Option<String>,
        symbol: String,
        direction: String,
        entry_price: f64,
        exit_price: f64,
        entry_time: i64,
        exit_time: i64,
        size: f64,
        leverage: f64,
        margin_mode: Option<String>,
        realized_pnl: f64,
        pnl_source: String,
        fee_open: f64,
        fee_close: f64,
        fee_open_maker: Option<f64>,
        fee_close_maker: Option<f64>,
        funding_fee: f64,
        created_at: i64,
        updated_at: i64,
        deleted_at: Option<i64>,
        field_clocks: BTreeMap<String, String>,
    },
    TradeJournalUpsert {
        trade_uuid: String,
        setup_tag: Option<String>,
        pre_trade_thesis: Option<String>,
        post_trade_review: Option<String>,
        emotion_tag: Option<String>,
        execution_grade: Option<String>,
        screenshot_path: Option<String>,
        updated_at: i64,
        field_clocks: BTreeMap<String, String>,
    },
    PlannedRiskUpsert {
        trade_uuid: String,
        planned_stop: Option<f64>,
        planned_target: Option<f64>,
        risk_amount: Option<f64>,
        planned_rr: Option<f64>,
        field_clocks: BTreeMap<String, String>,
    },
    TradeChecklistReplace {
        trade_uuid: String,
        items: Vec<ChecklistOpItem>,
    },
    TradeTagsReplace {
        trade_uuid: String,
        tags: Vec<String>,
    },
    AccountBalanceUpsert {
        exchange: String,
        asset: String,
        total: f64,
        available: f64,
        unrealized_pnl: f64,
        updated_at: i64,
    },
    SyncStateUpsert {
        exchange: String,
        last_exit_time: Option<i64>,
        last_external_id: Option<String>,
        last_fill_time: Option<i64>,
        last_fill_id: Option<String>,
        last_funding_time: Option<i64>,
        last_sync_at: Option<i64>,
        last_status: Option<String>,
        last_error: Option<String>,
    },
    SettingUpsert {
        key: String,
        value: serde_json::Value,
        updated_at: i64,
        deleted_at: Option<i64>,
    },
    MediaAssetUpsert {
        sha256: String,
        kind: String,
        ext: String,
        mime: String,
        size_bytes: i64,
        original_name: Option<String>,
        created_at: i64,
        deleted_at: Option<i64>,
    },
    CredentialUpsert {
        slot: String, // "exchange:<name>" | "ai_openai"
        encrypted_payload_b64: Option<String>,
        key_hint: Option<String>,
        updated_at: i64,
        deleted_at: Option<i64>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncOp {
    pub op_id: String,
    pub device_id: String,
    pub hlc: String,
    pub ts: i64,
    pub payload: SyncEntityOp,
}
