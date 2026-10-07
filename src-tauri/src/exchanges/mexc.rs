use super::types::{RawAccountBalance, RawClosedPosition, RawFill, RawFundingFee, SyncCursor};
use crate::credentials::ExchangeCredentials;
use hmac::{Hmac, Mac};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE};
use serde_json::Value;
use sha2::Sha256;
use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

type HmacSha256 = Hmac<Sha256>;

const BASE_URL: &str = "https://contract.mexc.com";
const DEFAULT_PAGE_SIZE: usize = 100;
const MAX_PAGES: usize = 200;

fn get_timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .to_string()
}

pub fn generate_mexc_signature(
    api_key: &str,
    secret_key: &str,
    timestamp: &str,
    query_or_body: &str,
) -> Result<String, String> {
    let mut mac = HmacSha256::new_from_slice(secret_key.as_bytes())
        .map_err(|e| format!("Inisialisasi HMAC gagal: {}", e))?;
    let auth = format!("{}{}{}", api_key, timestamp, query_or_body);
    mac.update(auth.as_bytes());
    Ok(hex::encode(mac.finalize().into_bytes()))
}

pub struct MexcClient {
    api_key: String,
    api_secret: String,
    http_client: reqwest::Client,
}

impl MexcClient {
    pub fn new(credentials: &ExchangeCredentials) -> Self {
        Self {
            api_key: credentials.api_key.trim().to_string(),
            api_secret: credentials.api_secret.trim().to_string(),
            http_client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap_or_default(),
        }
    }

    async fn get(
        &self,
        path: &str,
        params: &BTreeMap<String, String>,
    ) -> Result<Value, String> {
        let timestamp = get_timestamp();

        let query_str = params
            .iter()
            .map(|(k, v)| format!("{}={}", urlencoding::encode(k), urlencoding::encode(v)))
            .collect::<Vec<_>>()
            .join("&");

        let signature = generate_mexc_signature(
            &self.api_key,
            &self.api_secret,
            &timestamp,
            &query_str,
        )?;

        let mut headers = HeaderMap::new();
        headers.insert(
            HeaderName::from_static("apikey"),
            HeaderValue::from_str(&self.api_key).map_err(|e| e.to_string())?,
        );
        headers.insert(
            HeaderName::from_static("request-time"),
            HeaderValue::from_str(&timestamp).map_err(|e| e.to_string())?,
        );
        headers.insert(
            HeaderName::from_static("signature"),
            HeaderValue::from_str(&signature).map_err(|e| e.to_string())?,
        );
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let url = if query_str.is_empty() {
            format!("{}{}", BASE_URL, path)
        } else {
            format!("{}{}?{}", BASE_URL, path, query_str)
        };

        let response = self
            .http_client
            .get(&url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| format!("Gagal menghubungi MEXC: {}", e))?;

        let status = response.status();
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err("Rate limit MEXC tercapai (HTTP 429)".to_string());
        }
        if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
            return Err("MEXC menolak autentikasi — periksa API key dan secret".to_string());
        }
        if !status.is_success() {
            return Err(format!("MEXC HTTP error: {}", status));
        }

        let payload: Value = response
            .json()
            .await
            .map_err(|e| format!("Parsing JSON MEXC gagal: {}", e))?;

        let success = payload.get("success").and_then(|s| s.as_bool()).unwrap_or(false);
        let code = payload.get("code").and_then(|c| {
            if let Some(n) = c.as_i64() {
                Some(n)
            } else if let Some(s) = c.as_str() {
                s.parse::<i64>().ok()
            } else {
                None
            }
        }).unwrap_or(0);

        if !success && code != 0 && code != 200 {
            let msg = payload
                .get("message")
                .or_else(|| payload.get("msg"))
                .and_then(|m| m.as_str())
                .unwrap_or("Unknown MEXC error");
            return Err(format!("MEXC API error (code {}): {}", code, msg));
        }

        Ok(payload.get("data").cloned().unwrap_or(Value::Null))
    }

    pub async fn fetch_closed_positions(
        &self,
        cursor: &SyncCursor,
    ) -> Result<Vec<RawClosedPosition>, String> {
        let max_pages = if cursor.last_exit_time.is_none() {
            MAX_PAGES
        } else {
            3
        };
        let mut collected = Vec::new();

        for page in 1..=max_pages {
            let mut params = BTreeMap::new();
            params.insert("page_num".to_string(), page.to_string());
            params.insert("page_size".to_string(), DEFAULT_PAGE_SIZE.to_string());

            let data = self
                .get("/api/v1/private/position/list/history_positions", &params)
                .await?;

            let list = extract_array(&data);
            if list.is_empty() {
                break;
            }

            let mut reached_cursor = false;
            for item in &list {
                if let Some(pos) = map_closed_position(item) {
                    if let Some(last_exit) = cursor.last_exit_time {
                        if pos.exit_time <= last_exit {
                            reached_cursor = true;
                            continue;
                        }
                    }
                    collected.push(pos);
                }
            }

            if reached_cursor || list.len() < DEFAULT_PAGE_SIZE {
                break;
            }
        }

        Ok(collected)
    }

    pub async fn fetch_fills(
        &self,
        cursor: &SyncCursor,
    ) -> Result<Vec<RawFill>, String> {
        let max_pages = if cursor.last_exit_time.is_none() {
            MAX_PAGES
        } else {
            3
        };
        let mut collected = Vec::new();

        for page in 1..=max_pages {
            let mut params = BTreeMap::new();
            params.insert("page_num".to_string(), page.to_string());
            params.insert("page_size".to_string(), DEFAULT_PAGE_SIZE.to_string());

            let data = self
                .get("/api/v1/private/order/list/order_deals", &params)
                .await?;

            let list = extract_array(&data);
            if list.is_empty() {
                break;
            }

            for item in &list {
                if let Some(fill) = map_fill(item) {
                    if let Some(since) = cursor.last_exit_time {
                        if fill.filled_at <= since {
                            continue;
                        }
                    }
                    collected.push(fill);
                }
            }

            if list.len() < DEFAULT_PAGE_SIZE {
                break;
            }
        }

        Ok(collected)
    }

    pub async fn fetch_funding_fees(
        &self,
        cursor: &SyncCursor,
    ) -> Result<Vec<RawFundingFee>, String> {
        let max_pages = if cursor.last_exit_time.is_none() {
            MAX_PAGES
        } else {
            3
        };
        let mut collected = Vec::new();

        for page in 1..=max_pages {
            let mut params = BTreeMap::new();
            params.insert("page_num".to_string(), page.to_string());
            params.insert("page_size".to_string(), DEFAULT_PAGE_SIZE.to_string());

            let data = self
                .get("/api/v1/private/position/funding_records", &params)
                .await?;

            let list = extract_array(&data);
            if list.is_empty() {
                break;
            }

            for item in &list {
                if let Some(fee) = map_funding_fee(item) {
                    if let Some(since) = cursor.last_exit_time {
                        if fee.charged_at <= since {
                            continue;
                        }
                    }
                    collected.push(fee);
                }
            }

            if list.len() < DEFAULT_PAGE_SIZE {
                break;
            }
        }

        Ok(collected)
    }

    pub async fn fetch_balances(&self) -> Result<Vec<RawAccountBalance>, String> {
        let params = BTreeMap::new();
        let data = self.get("/api/v1/private/account/assets", &params).await?;

        let list = extract_array(&data);
        let mut result = Vec::new();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        for item in &list {
            let asset = get_str(item, &["currency"]).unwrap_or_default();
            let total = get_f64(item, &["equity", "cashBalance"]);
            let available = get_f64(item, &["availableBalance"]);
            let unrealized_pnl = get_f64(item, &["unrealisedPnl", "unrealizedPnl"]);

            if total > 0.0 || asset == "USDT" {
                result.push(RawAccountBalance {
                    exchange: "mexc".to_string(),
                    asset,
                    total,
                    available,
                    unrealized_pnl,
                    updated_at: now,
                });
            }
        }

        if result.is_empty() {
            result.push(RawAccountBalance {
                exchange: "mexc".to_string(),
                asset: "USDT".to_string(),
                total: 0.0,
                available: 0.0,
                unrealized_pnl: 0.0,
                updated_at: now,
            });
        }

        Ok(result)
    }
}

// ---------------------------------------------------------------------------
// Helpers & Mapper MEXC
// ---------------------------------------------------------------------------

fn extract_array(data: &Value) -> Vec<Value> {
    if let Some(arr) = data.as_array() {
        return arr.clone();
    }
    if let Some(obj) = data.as_object() {
        for key in &["resultList", "list", "data"] {
            if let Some(arr) = obj.get(*key).and_then(|v| v.as_array()) {
                return arr.clone();
            }
        }
    }
    Vec::new()
}

fn get_str(val: &Value, keys: &[&str]) -> Option<String> {
    for k in keys {
        if let Some(s) = val.get(*k).and_then(|v| v.as_str()) {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        } else if let Some(n) = val.get(*k).and_then(|v| v.as_i64()) {
            return Some(n.to_string());
        }
    }
    None
}

fn get_f64(val: &Value, keys: &[&str]) -> f64 {
    for k in keys {
        if let Some(v) = val.get(*k) {
            if let Some(f) = v.as_f64() {
                return f;
            }
            if let Some(s) = v.as_str() {
                if let Ok(parsed) = s.parse::<f64>() {
                    return parsed;
                }
            }
        }
    }
    0.0
}

fn get_epoch_ms(val: &Value, keys: &[&str]) -> Option<i64> {
    for k in keys {
        if let Some(v) = val.get(*k) {
            let num = if let Some(i) = v.as_i64() {
                Some(i)
            } else if let Some(s) = v.as_str() {
                s.parse::<i64>().ok()
            } else {
                None
            };
            if let Some(n) = num {
                if n > 0 {
                    return Some(if n < 100_000_000_000 { n * 1000 } else { n });
                }
            }
        }
    }
    None
}

fn normalize_symbol(s: &str) -> String {
    s.replace(['_', '-', '/'], "")
}

pub fn map_closed_position(raw: &Value) -> Option<RawClosedPosition> {
    let external_id = get_str(raw, &["positionId", "id"])?;
    let raw_symbol = get_str(raw, &["symbol"])?;
    let entry_time = get_epoch_ms(raw, &["createTime"])?;
    let exit_time = get_epoch_ms(raw, &["updateTime"])?;

    // positionType: 1 = long, 2 = short
    let pos_type = get_str(raw, &["positionType"]).unwrap_or_default();
    let direction = if pos_type == "2" {
        "short"
    } else {
        "long"
    }
    .to_string();

    let entry_price = get_f64(raw, &["openAvgPrice"]);
    let exit_price = get_f64(raw, &["closeAvgPrice"]);

    // closeVol jika posisi closed, fallback holdVol
    let close_vol = get_f64(raw, &["closeVol"]);
    let hold_vol = get_f64(raw, &["holdVol"]);
    let size = if close_vol > 0.0 { close_vol } else { hold_vol };

    let mut leverage = get_f64(raw, &["leverage"]);
    if leverage == 0.0 {
        leverage = 1.0;
    }

    // openType: 1 = isolated, 2 = cross
    let open_type = get_str(raw, &["openType"]).unwrap_or_default();
    let margin_mode = if open_type == "1" {
        Some("isolated".to_string())
    } else if open_type == "2" {
        Some("cross".to_string())
    } else {
        None
    };

    let realized_pnl = get_f64(raw, &["realised", "closeProfitLoss"]);
    let fee_close = get_f64(raw, &["fee"]);

    Some(RawClosedPosition {
        external_id,
        symbol: normalize_symbol(&raw_symbol),
        direction,
        entry_price,
        exit_price,
        entry_time,
        exit_time,
        size,
        leverage,
        margin_mode,
        realized_pnl,
        fee_open: 0.0,
        fee_close,
        funding_fee: 0.0,
        raw: Some(raw.clone()),
    })
}

pub fn map_fill(raw: &Value) -> Option<RawFill> {
    let external_id = get_str(raw, &["id", "tradeId", "orderId"])?;
    let raw_symbol = get_str(raw, &["symbol"])?;
    let filled_at = get_epoch_ms(raw, &["createTime", "timestamp"])?;

    let side_val = get_str(raw, &["side"]).unwrap_or_default().to_lowercase();
    let side = if side_val.contains("sell") || side_val == "2" {
        "sell"
    } else {
        "buy"
    }
    .to_string();

    let price = get_f64(raw, &["price", "dealPrice"]);
    let qty = get_f64(raw, &["vol", "amount", "dealVol"]);
    let fee = get_f64(raw, &["fee"]);

    Some(RawFill {
        external_id,
        symbol: normalize_symbol(&raw_symbol),
        side,
        price,
        qty,
        fee,
        is_maker: None,
        filled_at,
    })
}

pub fn map_funding_fee(raw: &Value) -> Option<RawFundingFee> {
    let external_id = get_str(raw, &["id", "fundingId"])?;
    let raw_symbol = get_str(raw, &["symbol"])?;
    let charged_at = get_epoch_ms(raw, &["settleTime", "timestamp"])?;

    let amount = get_f64(raw, &["funding", "amount"]);
    let rate_opt = raw.get("rate").and_then(|r| r.as_f64());

    Some(RawFundingFee {
        external_id,
        symbol: normalize_symbol(&raw_symbol),
        amount,
        rate: rate_opt,
        charged_at,
    })
}
