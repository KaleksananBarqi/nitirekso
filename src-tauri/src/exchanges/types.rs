use serde::{Deserialize, Serialize};

pub type SupportedExchange = String;

/// Representasi posisi tertutup yang sudah dinormalisasi dari exchange
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawClosedPosition {
    /// ID posisi dari exchange — kunci dedup idempotent
    pub external_id: String,
    pub symbol: String,
    pub direction: String, // "long" atau "short"
    pub entry_price: f64,
    pub exit_price: f64,
    /// Epoch ms UTC
    pub entry_time: i64,
    /// Epoch ms UTC
    pub exit_time: i64,
    /// Ukuran posisi dalam base asset
    pub size: f64,
    pub leverage: f64,
    pub margin_mode: Option<String>, // "isolated" atau "cross"
    pub realized_pnl: f64,
    pub fee_open: f64,
    pub fee_close: f64,
    pub funding_fee: f64,
    /// Raw JSON dari exchange untuk audit trail
    pub raw: Option<serde_json::Value>,
}

/// Satu fill / eksekusi individual
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawFill {
    pub external_id: String,
    pub symbol: String,
    pub side: String, // "buy" atau "sell"
    pub price: f64,
    pub qty: f64,
    pub fee: f64,
    pub is_maker: Option<bool>,
    pub filled_at: i64,
}

/// Satu catatan biaya funding fee
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawFundingFee {
    pub external_id: String,
    pub symbol: String,
    pub amount: f64,
    pub rate: Option<f64>,
    pub charged_at: i64,
}

/// Cursor inkremental sinkronisasi per exchange
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncCursor {
    pub last_exit_time: Option<i64>,
    pub last_external_id: Option<String>,
}

/// Saldo akun futures dari exchange
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawAccountBalance {
    pub exchange: String,
    pub asset: String,
    pub total: f64,
    pub available: f64,
    pub unrealized_pnl: f64,
    pub updated_at: i64,
}

/// Opsi fetch data
#[derive(Debug, Clone, Default)]
pub struct FetchOptions {
    pub limit: Option<usize>,
    pub since: Option<i64>,
}
