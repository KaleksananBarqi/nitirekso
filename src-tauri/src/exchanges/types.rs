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

/// Cursor inkremental sinkronisasi per exchange dengan pelacakan independen per-stream
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncCursor {
    /// Waktu penutupan posisi terakhir (epoch ms UTC) untuk stream posisi
    pub last_exit_time: Option<i64>,
    /// ID posisi terakhir dari exchange untuk stream posisi
    pub last_external_id: Option<String>,
    /// Waktu eksekusi order terakhir (epoch ms UTC) untuk stream fills
    pub last_fill_time: Option<i64>,
    /// ID fill eksternal terakhir dari exchange untuk stream fills
    pub last_fill_id: Option<String>,
    /// Waktu pemotongan funding fee terakhir (epoch ms UTC) untuk stream funding
    pub last_funding_time: Option<i64>,
}

impl SyncCursor {
    /// Membuat kursor inkremental kosong baru
    pub fn new() -> Self {
        Self::default()
    }

    /// Menetapkan kursor untuk stream posisi tertutup
    pub fn with_positions(mut self, last_exit_time: Option<i64>, last_external_id: Option<String>) -> Self {
        self.last_exit_time = last_exit_time;
        self.last_external_id = last_external_id;
        self
    }

    /// Menetapkan kursor untuk stream riwayat eksekusi (fills)
    pub fn with_fills(mut self, last_fill_time: Option<i64>, last_fill_id: Option<String>) -> Self {
        self.last_fill_time = last_fill_time;
        self.last_fill_id = last_fill_id;
        self
    }

    /// Menetapkan kursor untuk stream biaya funding (funding fees)
    pub fn with_funding(mut self, last_funding_time: Option<i64>) -> Self {
        self.last_funding_time = last_funding_time;
        self
    }
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
