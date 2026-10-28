pub mod bitunix;
pub mod mexc;
pub mod mock;
pub mod types;

pub use mock::MockExchangeAdapter;
pub use types::{RawAccountBalance, RawClosedPosition, RawFill, RawFundingFee, SyncCursor};

use bitunix::BitunixClient;
use mexc::MexcClient;

/// Abstraksi kontrak adapter bursa (exchange) untuk penarikan data transaksi
#[allow(async_fn_in_trait)]
pub trait ExchangeAdapter: Send + Sync {
    /// Pengenal unik bursa (contoh: "mexc", "bitunix")
    fn id(&self) -> &str;

    /// Nama label tampilan bursa (contoh: "MEXC Futures")
    fn display_name(&self) -> &str;

    /// Mengambil riwayat posisi tertutup dari bursa berdasarkan kursor inkremental
    async fn fetch_closed_positions(
        &self,
        cursor: &SyncCursor,
    ) -> Result<Vec<RawClosedPosition>, String>;

    /// Mengambil riwayat eksekusi pesanan (fills) dari bursa
    async fn fetch_fills(
        &self,
        cursor: &SyncCursor,
    ) -> Result<Vec<RawFill>, String>;

    /// Mengambil riwayat biaya pendanaan (funding fees) dari bursa
    async fn fetch_funding_fees(
        &self,
        cursor: &SyncCursor,
    ) -> Result<Vec<RawFundingFee>, String>;

    /// Mengambil saldo akun terkini dari bursa
    async fn fetch_balances(&self) -> Result<Vec<RawAccountBalance>, String>;
}

impl ExchangeAdapter for MexcClient {
    fn id(&self) -> &str {
        "mexc"
    }

    fn display_name(&self) -> &str {
        "MEXC Futures"
    }

    async fn fetch_closed_positions(
        &self,
        cursor: &SyncCursor,
    ) -> Result<Vec<RawClosedPosition>, String> {
        self.fetch_closed_positions(cursor).await
    }

    async fn fetch_fills(
        &self,
        cursor: &SyncCursor,
    ) -> Result<Vec<RawFill>, String> {
        self.fetch_fills(cursor).await
    }

    async fn fetch_funding_fees(
        &self,
        cursor: &SyncCursor,
    ) -> Result<Vec<RawFundingFee>, String> {
        self.fetch_funding_fees(cursor).await
    }

    async fn fetch_balances(&self) -> Result<Vec<RawAccountBalance>, String> {
        self.fetch_balances().await
    }
}

impl ExchangeAdapter for BitunixClient {
    fn id(&self) -> &str {
        "bitunix"
    }

    fn display_name(&self) -> &str {
        "Bitunix Futures"
    }

    async fn fetch_closed_positions(
        &self,
        cursor: &SyncCursor,
    ) -> Result<Vec<RawClosedPosition>, String> {
        self.fetch_closed_positions(cursor).await
    }

    async fn fetch_fills(
        &self,
        cursor: &SyncCursor,
    ) -> Result<Vec<RawFill>, String> {
        self.fetch_fills(cursor).await
    }

    async fn fetch_funding_fees(
        &self,
        cursor: &SyncCursor,
    ) -> Result<Vec<RawFundingFee>, String> {
        self.fetch_funding_fees(cursor).await
    }

    async fn fetch_balances(&self) -> Result<Vec<RawAccountBalance>, String> {
        self.fetch_balances().await
    }
}

/// Enum pembungkus adapter bursa untuk polimorfisme statis (zero-cost abstraction)
pub enum AnyExchangeAdapter {
    Mexc(MexcClient),
    Bitunix(BitunixClient),
    Mock(Box<MockExchangeAdapter>),
}

impl AnyExchangeAdapter {
    pub fn id(&self) -> &str {
        match self {
            Self::Mexc(client) => client.id(),
            Self::Bitunix(client) => client.id(),
            Self::Mock(mock) => mock.id(),
        }
    }

    pub fn display_name(&self) -> &str {
        match self {
            Self::Mexc(client) => client.display_name(),
            Self::Bitunix(client) => client.display_name(),
            Self::Mock(mock) => mock.display_name(),
        }
    }

    pub async fn fetch_closed_positions(
        &self,
        cursor: &SyncCursor,
    ) -> Result<Vec<RawClosedPosition>, String> {
        match self {
            Self::Mexc(client) => client.fetch_closed_positions(cursor).await,
            Self::Bitunix(client) => client.fetch_closed_positions(cursor).await,
            Self::Mock(mock) => mock.fetch_closed_positions(cursor).await,
        }
    }

    pub async fn fetch_fills(
        &self,
        cursor: &SyncCursor,
    ) -> Result<Vec<RawFill>, String> {
        match self {
            Self::Mexc(client) => client.fetch_fills(cursor).await,
            Self::Bitunix(client) => client.fetch_fills(cursor).await,
            Self::Mock(mock) => mock.fetch_fills(cursor).await,
        }
    }

    pub async fn fetch_funding_fees(
        &self,
        cursor: &SyncCursor,
    ) -> Result<Vec<RawFundingFee>, String> {
        match self {
            Self::Mexc(client) => client.fetch_funding_fees(cursor).await,
            Self::Bitunix(client) => client.fetch_funding_fees(cursor).await,
            Self::Mock(mock) => mock.fetch_funding_fees(cursor).await,
        }
    }

    pub async fn fetch_balances(&self) -> Result<Vec<RawAccountBalance>, String> {
        match self {
            Self::Mexc(client) => client.fetch_balances().await,
            Self::Bitunix(client) => client.fetch_balances().await,
            Self::Mock(mock) => mock.fetch_balances().await,
        }
    }
}

impl ExchangeAdapter for AnyExchangeAdapter {
    fn id(&self) -> &str {
        self.id()
    }

    fn display_name(&self) -> &str {
        self.display_name()
    }

    async fn fetch_closed_positions(
        &self,
        cursor: &SyncCursor,
    ) -> Result<Vec<RawClosedPosition>, String> {
        self.fetch_closed_positions(cursor).await
    }

    async fn fetch_fills(
        &self,
        cursor: &SyncCursor,
    ) -> Result<Vec<RawFill>, String> {
        self.fetch_fills(cursor).await
    }

    async fn fetch_funding_fees(
        &self,
        cursor: &SyncCursor,
    ) -> Result<Vec<RawFundingFee>, String> {
        self.fetch_funding_fees(cursor).await
    }

    async fn fetch_balances(&self) -> Result<Vec<RawAccountBalance>, String> {
        self.fetch_balances().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{migrations, repositories};
    use rusqlite::Connection;
    use serde_json::json;
    use std::collections::BTreeMap;

    #[test]
    fn test_bitunix_signing_and_params() {
        let mut params = BTreeMap::new();
        params.insert("symbol".to_string(), "BTCUSDT".to_string());
        params.insert("pageSize".to_string(), "100".to_string());
        params.insert("page".to_string(), "1".to_string());

        let sorted = bitunix::sort_params(&params);
        assert_eq!(sorted, "page1pageSize100symbolBTCUSDT");

        let api_key = "test_api_key";
        let secret = "test_secret_key";
        let nonce = "1234567890abcdef1234567890abcdef";
        let timestamp = "1700000000000";

        let signature = bitunix::generate_signature(api_key, secret, nonce, timestamp, &sorted, "");
        assert_eq!(signature.len(), 64, "SHA-256 hex harus 64 karakter");
    }

    #[test]
    fn test_mexc_signing() {
        let api_key = "mx0abc123";
        let secret = "mx_secret_456";
        let timestamp = "1700000000000";
        let query = "page_num=1&page_size=100";

        let sig = mexc::generate_mexc_signature(api_key, secret, timestamp, query).unwrap();
        assert_eq!(sig.len(), 64, "HMAC-SHA256 hex harus 64 karakter");
    }

    #[test]
    fn test_bitunix_mapper() {
        let raw = json!({
            "positionId": "pos-9988",
            "symbol": "ETH_USDT",
            "side": "SHORT",
            "entryPrice": "3200.5",
            "closePrice": "3100.0",
            "ctime": 1700001000000i64,
            "mtime": 1700005000000i64,
            "qty": "2.5",
            "leverage": 20,
            "marginMode": "ISOLATED",
            "realizedPNL": "251.25",
            "fee": "3.5",
            "funding": "0.5"
        });

        let pos = bitunix::map_closed_position(&raw).expect("Posisi harus berhasil diparsing");
        assert_eq!(pos.external_id, "pos-9988");
        assert_eq!(pos.symbol, "ETHUSDT");
        assert_eq!(pos.direction, "short");
        assert_eq!(pos.entry_price, 3200.5);
        assert_eq!(pos.exit_price, 3100.0);
        assert_eq!(pos.realized_pnl, 251.25);
        assert_eq!(pos.margin_mode.as_deref(), Some("isolated"));
    }

    #[test]
    fn test_mexc_mapper() {
        let raw = json!({
            "positionId": "mexc-pos-111",
            "symbol": "SOL_USDT",
            "positionType": "1", // 1 = long
            "openType": "2",     // 2 = cross
            "openAvgPrice": "150.25",
            "closeAvgPrice": "165.50",
            "closeVol": "10.0",
            "leverage": "10",
            "realised": "152.50",
            "fee": "1.25",
            "createTime": 1700002000000i64,
            "updateTime": 1700006000000i64
        });

        let pos = mexc::map_closed_position(&raw).expect("Posisi MEXC harus berhasil diparsing");
        assert_eq!(pos.external_id, "mexc-pos-111");
        assert_eq!(pos.symbol, "SOLUSDT");
        assert_eq!(pos.direction, "long");
        assert_eq!(pos.margin_mode.as_deref(), Some("cross"));
        assert_eq!(pos.realized_pnl, 152.50);
        assert_eq!(pos.size, 10.0);
    }

    #[test]
    fn test_sync_repository_flow() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&mut conn).unwrap();

        let exchange = "bitunix";
        let positions = vec![
            RawClosedPosition {
                external_id: "pos-sync-1".to_string(),
                symbol: "BTCUSDT".to_string(),
                direction: "long".to_string(),
                entry_price: 60000.0,
                exit_price: 61000.0,
                entry_time: 1700000000000,
                exit_time: 1700003600000,
                size: 0.5,
                leverage: 10.0,
                margin_mode: Some("isolated".to_string()),
                realized_pnl: 500.0,
                fee_open: 0.0,
                fee_close: 10.0,
                funding_fee: 0.0,
                raw: None,
            },
        ];

        // 1. Upsert posisi
        let res = repositories::sync::upsert_positions(&mut conn, exchange, &positions).unwrap();
        assert_eq!(res.inserted, 1);

        // 2. Upsert ulang (harus unchanged)
        let res_idempotent = repositories::sync::upsert_positions(&mut conn, exchange, &positions).unwrap();
        assert_eq!(res_idempotent.inserted, 0);
        assert_eq!(res_idempotent.unchanged, 1);

        // 3. Upsert funding fee
        let fees = vec![RawFundingFee {
            external_id: "fund-1".to_string(),
            symbol: "BTCUSDT".to_string(),
            amount: -2.5,
            rate: Some(0.0001),
            charged_at: 1700001800000, // berada di rentang entry_time..exit_time
        }];
        let fund_res = repositories::sync::upsert_funding_fees(&mut conn, exchange, &fees).unwrap();
        assert_eq!(fund_res.inserted, 1);

        // 4. Apply funding ke trade
        let applied = repositories::sync::apply_funding_to_trades(&conn, exchange).unwrap();
        assert_eq!(applied, 1);

        // Cek bahwa funding fee masuk ke trade
        let trade: (f64,) = conn
            .query_row(
                "SELECT funding_fee FROM trades WHERE external_id = 'pos-sync-1'",
                [],
                |r| Ok((r.get(0)?,)),
            )
            .unwrap();
        assert_eq!(trade.0, -2.5);

        // 5. Cek update dan query sync state
        repositories::sync::update_sync_state(
            &conn,
            exchange,
            Some(1700003600000),
            Some("pos-sync-1"),
            Some("ok"),
            None,
        )
        .unwrap();

        let state = repositories::sync::get_sync_state(&conn, exchange).unwrap();
        assert_eq!(state.last_exit_time, Some(1700003600000));
        assert_eq!(state.last_external_id.as_deref(), Some("pos-sync-1"));
        assert_eq!(state.last_status.as_deref(), Some("ok"));
        assert_eq!(state.positions_synced, 1);
        assert_eq!(state.funding_synced, 1);
    }

    #[tokio::test]
    async fn test_mock_exchange_adapter_returns_and_records_cursors() {
        let mock = MockExchangeAdapter::new("mexc")
            .with_display_name("Mock MEXC Futures")
            .with_positions(vec![RawClosedPosition {
                external_id: "mexc-pos-1".to_string(),
                symbol: "BTCUSDT".to_string(),
                direction: "long".to_string(),
                entry_price: 60000.0,
                exit_price: 61000.0,
                entry_time: 1700000000000,
                exit_time: 1700003600000,
                size: 0.5,
                leverage: 10.0,
                margin_mode: Some("isolated".to_string()),
                realized_pnl: 500.0,
                fee_open: 5.0,
                fee_close: 5.0,
                funding_fee: 0.0,
                raw: None,
            }])
            .with_fills(vec![RawFill {
                external_id: "mexc-fill-1".to_string(),
                symbol: "BTCUSDT".to_string(),
                side: "buy".to_string(),
                price: 60000.0,
                qty: 0.5,
                fee: 5.0,
                is_maker: Some(true),
                filled_at: 1700000000000,
            }])
            .with_funding_fees(vec![RawFundingFee {
                external_id: "mexc-fund-1".to_string(),
                symbol: "BTCUSDT".to_string(),
                amount: -1.2,
                rate: Some(0.0001),
                charged_at: 1700001800000,
            }])
            .with_balances(vec![RawAccountBalance {
                exchange: "mexc".to_string(),
                asset: "USDT".to_string(),
                total: 10000.0,
                available: 9500.0,
                unrealized_pnl: 150.0,
                updated_at: 1700003600000,
            }]);

        assert_eq!(mock.id(), "mexc");
        assert_eq!(mock.display_name(), "Mock MEXC Futures");

        let pos_cursor = SyncCursor::new().with_positions(Some(1700000000000), Some("prev-pos".to_string()));
        let positions = mock.fetch_closed_positions(&pos_cursor).await.unwrap();
        assert_eq!(positions.len(), 1);
        assert_eq!(positions[0].external_id, "mexc-pos-1");
        assert_eq!(mock.position_calls(), 1);
        assert_eq!(mock.last_position_cursor(), Some(pos_cursor));

        let fill_cursor = SyncCursor::new().with_fills(Some(1700000500000), Some("prev-fill".to_string()));
        let fills = mock.fetch_fills(&fill_cursor).await.unwrap();
        assert_eq!(fills.len(), 1);
        assert_eq!(fills[0].external_id, "mexc-fill-1");
        assert_eq!(mock.fill_calls(), 1);
        assert_eq!(mock.last_fill_cursor(), Some(fill_cursor));

        let fund_cursor = SyncCursor::new().with_funding(Some(1700001000000));
        let fees = mock.fetch_funding_fees(&fund_cursor).await.unwrap();
        assert_eq!(fees.len(), 1);
        assert_eq!(fees[0].external_id, "mexc-fund-1");
        assert_eq!(mock.funding_calls(), 1);
        assert_eq!(mock.last_funding_cursor(), Some(fund_cursor));

        let balances = mock.fetch_balances().await.unwrap();
        assert_eq!(balances.len(), 1);
        assert_eq!(balances[0].asset, "USDT");
    }

    #[tokio::test]
    async fn test_mock_exchange_adapter_error_simulation() {
        let mut mock = MockExchangeAdapter::new("bitunix")
            .with_positions_error("Simulasi error jaringan posisi")
            .with_fills_error("Simulasi error rate limit fills")
            .with_funding_error("Simulasi error timeout funding")
            .with_balances_error("Simulasi error autentikasi saldo");

        let cursor = SyncCursor::default();

        let pos_err = mock.fetch_closed_positions(&cursor).await.unwrap_err();
        assert_eq!(pos_err, "Simulasi error jaringan posisi");

        let fill_err = mock.fetch_fills(&cursor).await.unwrap_err();
        assert_eq!(fill_err, "Simulasi error rate limit fills");

        let fund_err = mock.fetch_funding_fees(&cursor).await.unwrap_err();
        assert_eq!(fund_err, "Simulasi error timeout funding");

        let bal_err = mock.fetch_balances().await.unwrap_err();
        assert_eq!(bal_err, "Simulasi error autentikasi saldo");

        // Pemulihan error secara dinamis
        mock.set_positions_error(None);
        let pos_ok = mock.fetch_closed_positions(&cursor).await.unwrap();
        assert!(pos_ok.is_empty());
    }

    #[tokio::test]
    async fn test_any_exchange_adapter_with_mock() {
        let mock = MockExchangeAdapter::new("bitunix")
            .with_display_name("Bitunix Mock Adapter")
            .with_positions(vec![RawClosedPosition {
                external_id: "pos-any-1".to_string(),
                symbol: "ETHUSDT".to_string(),
                direction: "short".to_string(),
                entry_price: 3500.0,
                exit_price: 3400.0,
                entry_time: 1700000000000,
                exit_time: 1700003600000,
                size: 2.0,
                leverage: 5.0,
                margin_mode: Some("cross".to_string()),
                realized_pnl: 200.0,
                fee_open: 2.0,
                fee_close: 2.0,
                funding_fee: 0.0,
                raw: None,
            }]);

        let adapter = AnyExchangeAdapter::Mock(Box::new(mock));
        assert_eq!(adapter.id(), "bitunix");
        assert_eq!(adapter.display_name(), "Bitunix Mock Adapter");

        let cursor = SyncCursor::new().with_positions(Some(1700000000000), Some("prev-pos".to_string()));
        let positions = adapter.fetch_closed_positions(&cursor).await.unwrap();
        assert_eq!(positions.len(), 1);
        assert_eq!(positions[0].external_id, "pos-any-1");

        let fills = adapter.fetch_fills(&cursor).await.unwrap();
        assert!(fills.is_empty());

        let funding = adapter.fetch_funding_fees(&cursor).await.unwrap();
        assert!(funding.is_empty());

        let balances = adapter.fetch_balances().await.unwrap();
        assert!(balances.is_empty());
    }

    #[test]
    fn test_sync_cursor_per_stream_isolation_and_persistence() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&mut conn).unwrap();

        let exchange = "mexc";

        // Tahap 1: Sinkronisasi posisi berhasil
        let pos_cursor = SyncCursor::new().with_positions(Some(1700001000000), Some("pos-1".to_string()));
        repositories::sync::update_sync_state_cursor(&conn, exchange, &pos_cursor, Some("ok"), None).unwrap();

        let state1 = repositories::sync::get_sync_state(&conn, exchange).unwrap();
        assert_eq!(state1.last_exit_time, Some(1700001000000));
        assert_eq!(state1.last_external_id.as_deref(), Some("pos-1"));
        assert_eq!(state1.last_fill_time, None);
        assert_eq!(state1.last_fill_id, None);
        assert_eq!(state1.last_funding_time, None);

        // Tahap 2: Sinkronisasi fills berhasil (kursor posisi harus tetap utuh via COALESCE)
        let fill_cursor = SyncCursor::new().with_fills(Some(1700002000000), Some("fill-99".to_string()));
        repositories::sync::update_sync_state_cursor(&conn, exchange, &fill_cursor, Some("ok"), None).unwrap();

        let state2 = repositories::sync::get_sync_state(&conn, exchange).unwrap();
        assert_eq!(state2.last_exit_time, Some(1700001000000), "Kursor posisi harus tetap dipertahankan");
        assert_eq!(state2.last_external_id.as_deref(), Some("pos-1"));
        assert_eq!(state2.last_fill_time, Some(1700002000000), "Kursor fills harus diperbarui");
        assert_eq!(state2.last_fill_id.as_deref(), Some("fill-99"));
        assert_eq!(state2.last_funding_time, None);

        // Tahap 3: Sinkronisasi funding gagal (error parsial)
        // Kursor funding tidak dimajukan, kursor posisi dan fills tetap terlindungi
        repositories::sync::update_sync_state_full(
            &conn,
            exchange,
            None,
            None,
            None,
            None,
            None,
            Some("partial"),
            Some("Timeout pada penarikan data funding"),
        ).unwrap();

        let state3 = repositories::sync::get_sync_state(&conn, exchange).unwrap();
        assert_eq!(state3.last_exit_time, Some(1700001000000));
        assert_eq!(state3.last_fill_time, Some(1700002000000));
        assert_eq!(state3.last_funding_time, None);
        assert_eq!(state3.last_status.as_deref(), Some("partial"));
        assert_eq!(state3.last_error.as_deref(), Some("Timeout pada penarikan data funding"));

        // Tahap 4: Sinkronisasi funding pulih dan berhasil
        let fund_cursor = SyncCursor::new().with_funding(Some(1700003000000));
        repositories::sync::update_sync_state_cursor(&conn, exchange, &fund_cursor, Some("ok"), None).unwrap();

        let state4 = repositories::sync::get_sync_state(&conn, exchange).unwrap();
        assert_eq!(state4.last_exit_time, Some(1700001000000));
        assert_eq!(state4.last_fill_time, Some(1700002000000));
        assert_eq!(state4.last_funding_time, Some(1700003000000));
        assert_eq!(state4.last_status.as_deref(), Some("ok"));

        // Pastikan cursor() dari state menghasilkan SyncCursor yang lengkap
        let extracted_cursor = state4.cursor();
        assert_eq!(extracted_cursor.last_exit_time, Some(1700001000000));
        assert_eq!(extracted_cursor.last_external_id.as_deref(), Some("pos-1"));
        assert_eq!(extracted_cursor.last_fill_time, Some(1700002000000));
        assert_eq!(extracted_cursor.last_fill_id.as_deref(), Some("fill-99"));
        assert_eq!(extracted_cursor.last_funding_time, Some(1700003000000));
    }

    #[test]
    fn test_sync_cursor_backward_compatibility_without_stream_columns() {
        let conn = Connection::open_in_memory().unwrap();

        // Buat tabel sync_state dengan skema LAMA (tanpa kolom last_fill_time, dll.)
        conn.execute_batch(
            "CREATE TABLE sync_state (
                exchange         TEXT PRIMARY KEY,
                last_exit_time   INTEGER,
                last_external_id TEXT,
                last_sync_at     INTEGER,
                last_status      TEXT,
                last_error       TEXT
            );
            CREATE TABLE trades (id INTEGER PRIMARY KEY, exchange TEXT);
            CREATE TABLE trade_fills (id INTEGER PRIMARY KEY, exchange TEXT);
            CREATE TABLE funding_fees (id INTEGER PRIMARY KEY, exchange TEXT);"
        ).unwrap();

        let exchange = "mexc";

        // Uji pembaruan sync state pada skema lama (harus berhasil tanpa panic / sql error)
        repositories::sync::update_sync_state(
            &conn,
            exchange,
            Some(1690000000000),
            Some("old-pos-id"),
            Some("ok"),
            None,
        ).unwrap();

        // Uji pembacaan sync state pada skema lama (harus menghasilkan None untuk kursor stream baru)
        let state = repositories::sync::get_sync_state(&conn, exchange).unwrap();
        assert_eq!(state.exchange, "mexc");
        assert_eq!(state.last_exit_time, Some(1690000000000));
        assert_eq!(state.last_external_id.as_deref(), Some("old-pos-id"));
        assert_eq!(state.last_fill_time, None);
        assert_eq!(state.last_fill_id, None);
        assert_eq!(state.last_funding_time, None);
        assert_eq!(state.last_status.as_deref(), Some("ok"));

        let cursor = state.cursor();
        assert_eq!(cursor.last_exit_time, Some(1690000000000));
        assert_eq!(cursor.last_fill_time, None);
    }
}
