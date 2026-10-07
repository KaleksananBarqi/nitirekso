use super::types::{RawAccountBalance, RawClosedPosition, RawFill, RawFundingFee, SyncCursor};
use crate::credentials::ExchangeCredentials;
use rand::Rng;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

const BASE_URL: &str = "https://fapi.bitunix.com";
const DEFAULT_PAGE_SIZE: usize = 100;
const MAX_PAGES: usize = 200;

fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    hex::encode(hasher.finalize())
}

fn get_nonce() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill(&mut bytes);
    hex::encode(bytes)
}

fn get_timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .to_string()
}

/// Urutkan query params secara ASCII lalu gabungkan key dan valuenya tanpa separator
/// Contoh: `{"pageSize": 100, "page": 1}` -> `"page1pageSize100"`
pub fn sort_params(params: &BTreeMap<String, String>) -> String {
    let mut result = String::new();
    for (k, v) in params {
        if !v.trim().is_empty() {
            result.push_str(k);
            result.push_str(v);
        }
    }
    result
}

/// Hitung signature Bitunix:
/// digest = SHA256(nonce + timestamp + apiKey + sortedQueryParams + body)
/// sign = SHA256(digest + secretKey)
pub fn generate_signature(
    api_key: &str,
    secret_key: &str,
    nonce: &str,
    timestamp: &str,
    sorted_params: &str,
    body: &str,
) -> String {
    let raw = format!("{}{}{}{}{}", nonce, timestamp, api_key, sorted_params, body);
    let digest = sha256_hex(&raw);
    sha256_hex(&format!("{}{}", digest, secret_key))
}

pub struct BitunixClient {
    api_key: String,
    api_secret: String,
    http_client: reqwest::Client,
}

impl BitunixClient {
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
        let nonce = get_nonce();
        let timestamp = get_timestamp();
        let sorted_str = sort_params(params);
        let signature = generate_signature(
            &self.api_key,
            &self.api_secret,
            &nonce,
            &timestamp,
            &sorted_str,
            "",
        );

        let mut headers = HeaderMap::new();
        headers.insert(
            HeaderName::from_static("api-key"),
            HeaderValue::from_str(&self.api_key).map_err(|e| e.to_string())?,
        );
        headers.insert(
            HeaderName::from_static("sign"),
            HeaderValue::from_str(&signature).map_err(|e| e.to_string())?,
        );
        headers.insert(
            HeaderName::from_static("nonce"),
            HeaderValue::from_str(&nonce).map_err(|e| e.to_string())?,
        );
        headers.insert(
            HeaderName::from_static("timestamp"),
            HeaderValue::from_str(&timestamp).map_err(|e| e.to_string())?,
        );
        headers.insert(
            HeaderName::from_static("language"),
            HeaderValue::from_static("en-US"),
        );
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let query_str = params
            .iter()
            .map(|(k, v)| format!("{}={}", urlencoding::encode(k), urlencoding::encode(v)))
            .collect::<Vec<_>>()
            .join("&");

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
            .map_err(|e| format!("Gagal menghubungi Bitunix: {}", e))?;

        let status = response.status();
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err("Rate limit Bitunix tercapai (HTTP 429)".to_string());
        }
        if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
            return Err("Bitunix menolak autentikasi — periksa API key dan secret".to_string());
        }
        if !status.is_success() {
            return Err(format!("Bitunix HTTP error: {}", status));
        }

        let payload: Value = response
            .json()
            .await
            .map_err(|e| format!("Parsing JSON Bitunix gagal: {}", e))?;

        let code = payload.get("code").and_then(|c| c.as_i64()).unwrap_or(-1);
        if code != 0 {
            let msg = payload
                .get("msg")
                .and_then(|m| m.as_str())
                .unwrap_or("Unknown error");
            return Err(format!("Bitunix API error (code {}): {}", code, msg));
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
            params.insert("page".to_string(), page.to_string());
            params.insert("pageSize".to_string(), DEFAULT_PAGE_SIZE.to_string());

            let data = self
                .get("/api/v1/futures/position/get_history_positions", &params)
                .await?;

            let list = extract_list(&data);
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
            params.insert("page".to_string(), page.to_string());
            params.insert("pageSize".to_string(), DEFAULT_PAGE_SIZE.to_string());
            if let Some(since) = cursor.last_exit_time {
                params.insert("startTime".to_string(), since.to_string());
            }

            let data = self
                .get("/api/v1/futures/trade/get_history_orders", &params)
                .await?;

            let list = extract_list(&data);
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
        _cursor: &SyncCursor,
    ) -> Result<Vec<RawFundingFee>, String> {
        // Bitunix tidak menyediakan endpoint private funding history per akun
        Ok(Vec::new())
    }

    pub async fn fetch_balances(&self) -> Result<Vec<RawAccountBalance>, String> {
        let coins = ["USDT", "USDC"];
        let mut result = Vec::new();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        for coin in coins {
            let mut params = BTreeMap::new();
            params.insert("marginCoin".to_string(), coin.to_string());

            match self.get("/api/v1/futures/account", &params).await {
                Ok(data) => {
                    let asset = data
                        .get("marginCoin")
                        .and_then(|v| v.as_str())
                        .unwrap_or(coin)
                        .to_string();

                    let available = get_f64(&data, &["available", "availableBalance", "free"]);
                    let frozen = get_f64(&data, &["frozen"]);
                    let margin = get_f64(&data, &["margin", "positionMargin"]);
                    let cross_upl = get_f64(&data, &["crossUnrealizedPNL"]);
                    let iso_upl = get_f64(&data, &["isolationUnrealizedPNL"]);
                    let upl = get_f64(&data, &["unrealizedProfitLoss"]);
                    let unrealized_pnl = cross_upl + iso_upl + upl;

                    let mut total = get_f64(&data, &["total", "equity", "totalBalance"]);
                    if total == 0.0 && (available > 0.0 || frozen > 0.0 || margin > 0.0) {
                        total = available + frozen + margin + unrealized_pnl;
                    }

                    if total > 0.0 || asset == "USDT" {
                        result.push(RawAccountBalance {
                            exchange: "bitunix".to_string(),
                            asset,
                            total,
                            available,
                            unrealized_pnl,
                            updated_at: now,
                        });
                    }
                }
                Err(e) => {
                    if coin == "USDT" {
                        return Err(e);
                    }
                }
            }
        }

        if result.is_empty() {
            result.push(RawAccountBalance {
                exchange: "bitunix".to_string(),
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
// Helpers & Mapper
// ---------------------------------------------------------------------------

fn extract_list(data: &Value) -> Vec<Value> {
    if let Some(arr) = data.as_array() {
        return arr.clone();
    }
    if let Some(obj) = data.as_object() {
        for key in &["positionList", "orderList", "list", "data"] {
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
                    // Deteksi detik vs milidetik
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
    let external_id = get_str(raw, &["positionId", "position_id", "id", "positionNo"])?;
    let raw_symbol = get_str(raw, &["symbol", "tradingPair", "pair"])?;
    let entry_time = get_epoch_ms(raw, &["ctime", "createTime", "openTime", "createdTime", "entryTime"])?;
    let exit_time = get_epoch_ms(raw, &["mtime", "updateTime", "closeTime", "updatedTime", "exitTime"])?;

    let side_str = get_str(raw, &["side", "positionSide", "direction", "posSide"])
        .unwrap_or_default()
        .to_uppercase();
    let direction = if side_str.contains("SHORT") || side_str.contains("SELL") {
        "short"
    } else {
        "long"
    }
    .to_string();

    let entry_price = get_f64(raw, &["entryPrice", "openAvgPrice", "avgOpenPrice", "entryAvgPrice"]);
    let exit_price = get_f64(raw, &["closePrice", "closeAvgPrice", "avgClosePrice", "exitAvgPrice"]);
    let size = get_f64(raw, &["qty", "quantity", "closeQty", "size", "closeVolume", "volume", "qtyClosed"]);
    let mut leverage = get_f64(raw, &["leverage", "lever"]);
    if leverage == 0.0 {
        leverage = 1.0;
    }

    let margin_mode_str = get_str(raw, &["marginMode", "marginType", "margin_mode"])
        .unwrap_or_default()
        .to_uppercase();
    let margin_mode = if margin_mode_str.contains("ISOLATED") {
        Some("isolated".to_string())
    } else if margin_mode_str.contains("CROSS") {
        Some("cross".to_string())
    } else {
        None
    };

    let realized_pnl = get_f64(raw, &["realizedPNL", "realizedPnl", "realized_pnl", "pnl", "profit", "closeProfit"]);
    let fee_close = get_f64(raw, &["fee", "totalFee", "closeFee", "commission"]);
    let funding_fee = get_f64(raw, &["funding", "fundingFee", "totalFunding"]);

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
        funding_fee,
        raw: Some(raw.clone()),
    })
}

pub fn map_fill(raw: &Value) -> Option<RawFill> {
    let external_id = get_str(raw, &["id", "tradeId", "orderId", "tid"])?;
    let raw_symbol = get_str(raw, &["symbol", "tradingPair", "pair"])?;
    let filled_at = get_epoch_ms(raw, &["ctime", "time", "createTime", "timestamp", "filledTime"])?;

    let side_str = get_str(raw, &["side", "tradeSide", "direction"])
        .unwrap_or_default()
        .to_uppercase();
    let side = if side_str.contains("SELL") {
        "sell"
    } else {
        "buy"
    }
    .to_string();

    let price = get_f64(raw, &["avgPrice", "fillPrice", "filledPrice", "price"]);
    let qty = get_f64(raw, &["qty", "quantity", "amount", "size", "filledQty"]);
    let fee = get_f64(raw, &["fee", "commission", "feeAmount"]);

    let maker_str = get_str(raw, &["isMaker", "maker", "liquidity", "role"])
        .unwrap_or_default()
        .to_uppercase();
    let is_maker = if maker_str.contains("MAKER") || maker_str == "TRUE" || maker_str == "1" {
        Some(true)
    } else if maker_str.contains("TAKER") || maker_str == "FALSE" || maker_str == "0" {
        Some(false)
    } else {
        None
    };

    Some(RawFill {
        external_id,
        symbol: normalize_symbol(&raw_symbol),
        side,
        price,
        qty,
        fee,
        is_maker,
        filled_at,
    })
}
