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

    /// Memperbarui kursor stream posisi tertutup berdasarkan riwayat posisi yang ditarik
    pub fn advance_positions(&mut self, positions: &[RawClosedPosition]) {
        for pos in positions {
            if self.last_exit_time.is_none() || Some(pos.exit_time) > self.last_exit_time {
                self.last_exit_time = Some(pos.exit_time);
                self.last_external_id = Some(pos.external_id.clone());
            }
        }
    }

    /// Memperbarui kursor stream riwayat eksekusi (fills) berdasarkan riwayat eksekusi yang ditarik
    pub fn advance_fills(&mut self, fills: &[RawFill]) {
        for fill in fills {
            if self.last_fill_time.is_none() || Some(fill.filled_at) > self.last_fill_time {
                self.last_fill_time = Some(fill.filled_at);
                self.last_fill_id = Some(fill.external_id.clone());
            }
        }
    }

    /// Memperbarui kursor stream biaya pendanaan berdasarkan catatan funding yang ditarik
    pub fn advance_funding(&mut self, fees: &[RawFundingFee]) {
        for fee in fees {
            if self.last_funding_time.is_none() || Some(fee.charged_at) > self.last_funding_time {
                self.last_funding_time = Some(fee.charged_at);
            }
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sync_cursor_advancement() {
        let mut cursor = SyncCursor::new();

        let pos1 = RawClosedPosition {
            external_id: "pos-1".to_string(),
            symbol: "BTCUSDT".to_string(),
            direction: "long".to_string(),
            entry_price: 50000.0,
            exit_price: 51000.0,
            entry_time: 1000,
            exit_time: 2000,
            size: 1.0,
            leverage: 10.0,
            margin_mode: None,
            realized_pnl: 100.0,
            fee_open: 1.0,
            fee_close: 1.0,
            funding_fee: 0.0,
            raw: None,
        };
        let pos2 = RawClosedPosition {
            external_id: "pos-2".to_string(),
            symbol: "BTCUSDT".to_string(),
            direction: "short".to_string(),
            entry_price: 51000.0,
            exit_price: 50500.0,
            entry_time: 2500,
            exit_time: 3000,
            size: 1.0,
            leverage: 10.0,
            margin_mode: None,
            realized_pnl: 50.0,
            fee_open: 1.0,
            fee_close: 1.0,
            funding_fee: 0.0,
            raw: None,
        };

        cursor.advance_positions(&[pos1, pos2]);
        assert_eq!(cursor.last_exit_time, Some(3000));
        assert_eq!(cursor.last_external_id.as_deref(), Some("pos-2"));

        let fill1 = RawFill {
            external_id: "fill-1".to_string(),
            symbol: "BTCUSDT".to_string(),
            side: "buy".to_string(),
            price: 50000.0,
            qty: 0.5,
            fee: 0.5,
            is_maker: Some(true),
            filled_at: 1500,
        };
        let fill2 = RawFill {
            external_id: "fill-2".to_string(),
            symbol: "BTCUSDT".to_string(),
            side: "buy".to_string(),
            price: 50000.0,
            qty: 0.5,
            fee: 0.5,
            is_maker: Some(false),
            filled_at: 2800,
        };

        cursor.advance_fills(&[fill1, fill2]);
        assert_eq!(cursor.last_fill_time, Some(2800));
        assert_eq!(cursor.last_fill_id.as_deref(), Some("fill-2"));

        let fee1 = RawFundingFee {
            external_id: "fee-1".to_string(),
            symbol: "BTCUSDT".to_string(),
            amount: -1.5,
            rate: Some(0.0001),
            charged_at: 2000,
        };
        let fee2 = RawFundingFee {
            external_id: "fee-2".to_string(),
            symbol: "BTCUSDT".to_string(),
            amount: -2.0,
            rate: Some(0.0001),
            charged_at: 2900,
        };

        cursor.advance_funding(&[fee1, fee2]);
        assert_eq!(cursor.last_funding_time, Some(2900));
    }
}
