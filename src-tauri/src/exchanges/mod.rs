pub mod bitunix;
pub mod mexc;
pub mod types;

use bitunix::BitunixClient;
use mexc::MexcClient;
use types::{RawAccountBalance, RawClosedPosition, RawFill, RawFundingFee, SyncCursor};

pub enum AnyExchangeAdapter {
    Mexc(MexcClient),
    Bitunix(BitunixClient),
}

impl AnyExchangeAdapter {
    pub fn id(&self) -> &str {
        match self {
            Self::Mexc(_) => "mexc",
            Self::Bitunix(_) => "bitunix",
        }
    }

    pub fn display_name(&self) -> &str {
        match self {
            Self::Mexc(_) => "MEXC Futures",
            Self::Bitunix(_) => "Bitunix Futures",
        }
    }

    pub async fn fetch_closed_positions(
        &self,
        cursor: &SyncCursor,
    ) -> Result<Vec<RawClosedPosition>, String> {
        match self {
            Self::Mexc(client) => client.fetch_closed_positions(cursor).await,
            Self::Bitunix(client) => client.fetch_closed_positions(cursor).await,
        }
    }

    pub async fn fetch_fills(
        &self,
        cursor: &SyncCursor,
    ) -> Result<Vec<RawFill>, String> {
        match self {
            Self::Mexc(client) => client.fetch_fills(cursor).await,
            Self::Bitunix(client) => client.fetch_fills(cursor).await,
        }
    }

    pub async fn fetch_funding_fees(
        &self,
        cursor: &SyncCursor,
    ) -> Result<Vec<RawFundingFee>, String> {
        match self {
            Self::Mexc(client) => client.fetch_funding_fees(cursor).await,
            Self::Bitunix(client) => client.fetch_funding_fees(cursor).await,
        }
    }

    pub async fn fetch_balances(&self) -> Result<Vec<RawAccountBalance>, String> {
        match self {
            Self::Mexc(client) => client.fetch_balances().await,
            Self::Bitunix(client) => client.fetch_balances().await,
        }
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
}
