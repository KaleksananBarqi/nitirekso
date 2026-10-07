use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

pub const CURRENT_APP_VERSION: &str = "1.7.4";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateInfo {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_url: String,
    pub release_notes: Option<String>,
    pub published_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BtcKlinesPayload {
    pub start_time: i64,
    pub end_time: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BtcKlinePoint {
    pub time: i64,
    pub close: f64,
}

pub fn open_external_url(url: &str) -> Result<(), String> {
    let trimmed = url.trim();
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err("Protokol URL tidak diizinkan. Hanya http dan https yang diperbolehkan.".to_string());
    }

    opener::open(trimmed).map_err(|e| format!("Gagal membuka URL di browser: {}", e))
}

fn parse_semver_part(s: &str) -> i64 {
    s.chars().take_while(|c| c.is_ascii_digit()).collect::<String>().parse().unwrap_or(0)
}

fn is_newer_version(latest: &str, current: &str) -> bool {
    let clean_l: Vec<i64> = latest
        .trim_start_matches('v')
        .split('.')
        .map(parse_semver_part)
        .collect();
    let clean_c: Vec<i64> = current
        .trim_start_matches('v')
        .split('.')
        .map(parse_semver_part)
        .collect();

    let max_len = clean_l.len().max(clean_c.len());
    for i in 0..max_len {
        let l = clean_l.get(i).copied().unwrap_or(0);
        let c = clean_c.get(i).copied().unwrap_or(0);
        if l > c {
            return true;
        }
        if l < c {
            return false;
        }
    }
    false
}

pub async fn check_for_updates() -> Result<AppUpdateInfo, String> {
    let current_version = CURRENT_APP_VERSION.to_string();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .user_agent(format!("nitirekso-desktop/{}", current_version))
        .build()
        .unwrap_or_default();

    // 1. Coba lewat GitHub REST API
    let api_url = "https://api.github.com/repos/KaleksananBarqi/nitirekso/releases/latest";
    let resp = client
        .get(api_url)
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await;

    if let Ok(res) = resp {
        if res.status().is_success() {
            if let Ok(data) = res.json::<Value>().await {
                let tag_name = data
                    .get("tag_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or(&current_version)
                    .trim_start_matches('v')
                    .to_string();

                let release_url = data
                    .get("html_url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("https://github.com/KaleksananBarqi/nitirekso/releases")
                    .to_string();

                let release_notes = data
                    .get("body")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let published_at = data
                    .get("published_at")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let has_update = is_newer_version(&tag_name, &current_version);

                return Ok(AppUpdateInfo {
                    has_update,
                    current_version,
                    latest_version: tag_name,
                    release_url,
                    release_notes,
                    published_at,
                });
            }
        }
    }

    // 2. Fallback: Query direct redirect URL
    let fallback_client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap_or_default();

    let fb_resp = fallback_client
        .get("https://github.com/KaleksananBarqi/nitirekso/releases/latest")
        .send()
        .await;

    if let Ok(res) = fb_resp {
        if let Some(loc) = res.headers().get("location").and_then(|h| h.to_str().ok()) {
            if let Some(pos) = loc.rfind("/tag/") {
                let tag = loc[pos + 5..].trim_start_matches('v');
                let has_update = is_newer_version(tag, &current_version);
                return Ok(AppUpdateInfo {
                    has_update,
                    current_version,
                    latest_version: tag.to_string(),
                    release_url: loc.to_string(),
                    release_notes: Some("Catatan rilis dapat dibaca di laman GitHub Releases.".to_string()),
                    published_at: None,
                });
            }
        }
    }

    Ok(AppUpdateInfo {
        has_update: false,
        current_version: current_version.clone(),
        latest_version: current_version,
        release_url: "https://github.com/KaleksananBarqi/nitirekso/releases".to_string(),
        release_notes: None,
        published_at: None,
    })
}

pub async fn get_btc_klines(payload: BtcKlinesPayload) -> Result<Vec<BtcKlinePoint>, String> {
    let adjusted_start = (payload.start_time - 24 * 60 * 60 * 1000).max(0);
    let adjusted_end = payload.end_time + 24 * 60 * 60 * 1000;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .unwrap_or_default();

    // Provider 1: Binance Spot
    let url_binance = format!(
        "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime={}&endTime={}&limit=1000",
        adjusted_start, adjusted_end
    );
    if let Ok(res) = client.get(&url_binance).send().await {
        if res.status().is_success() {
            if let Ok(data) = res.json::<Vec<Vec<Value>>>().await {
                let mut points = Vec::new();
                for row in data {
                    if row.len() >= 5 {
                        let time = row[0].as_i64().unwrap_or(0);
                        let close = row[4].as_str().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
                        if time > 0 && close > 0.0 {
                            points.push(BtcKlinePoint { time, close });
                        }
                    }
                }
                if !points.is_empty() {
                    return Ok(points);
                }
            }
        }
    }

    // Provider 2: Binance Vision (Domain alternatif)
    let url_vision = format!(
        "https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime={}&endTime={}&limit=1000",
        adjusted_start, adjusted_end
    );
    if let Ok(res) = client.get(&url_vision).send().await {
        if res.status().is_success() {
            if let Ok(data) = res.json::<Vec<Vec<Value>>>().await {
                let mut points = Vec::new();
                for row in data {
                    if row.len() >= 5 {
                        let time = row[0].as_i64().unwrap_or(0);
                        let close = row[4].as_str().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
                        if time > 0 && close > 0.0 {
                            points.push(BtcKlinePoint { time, close });
                        }
                    }
                }
                if !points.is_empty() {
                    return Ok(points);
                }
            }
        }
    }

    // Provider 3: Kraken Public OHLC (Sangat ramah di Indonesia dan bebas blokir)
    let since_sec = (adjusted_start / 1000).max(0);
    let url_kraken = format!(
        "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440&since={}",
        since_sec
    );
    if let Ok(res) = client.get(&url_kraken).send().await {
        if res.status().is_success() {
            if let Ok(data) = res.json::<Value>().await {
                if let Some(result_obj) = data.get("result").and_then(|v| v.as_object()) {
                    if let Some((_, ohlc_array)) = result_obj.iter().next() {
                        if let Some(rows) = ohlc_array.as_array() {
                            let mut points = Vec::new();
                            for r in rows {
                                if let Some(arr) = r.as_array() {
                                    if arr.len() >= 5 {
                                        let time = arr[0].as_i64().unwrap_or(0) * 1000;
                                        let close = arr[4].as_str().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
                                        if time >= adjusted_start - 86400000 && time <= adjusted_end + 86400000 {
                                            points.push(BtcKlinePoint { time, close });
                                        }
                                    }
                                }
                            }
                            if !points.is_empty() {
                                return Ok(points);
                            }
                        }
                    }
                }
            }
        }
    }

    // Provider 4: CoinGecko
    let from_sec = adjusted_start / 1000;
    let to_sec = adjusted_end / 1000;
    let url_cg = format!(
        "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart/range?vs_currency=usd&from={}&to={}",
        from_sec, to_sec
    );
    if let Ok(res) = client.get(&url_cg).send().await {
        if res.status().is_success() {
            if let Ok(data) = res.json::<Value>().await {
                if let Some(prices) = data.get("prices").and_then(|v| v.as_array()) {
                    let mut points = Vec::new();
                    for p in prices {
                        if let Some(arr) = p.as_array() {
                            if arr.len() >= 2 {
                                let time = arr[0].as_i64().unwrap_or(0);
                                let close = arr[1].as_f64().unwrap_or(0.0);
                                points.push(BtcKlinePoint { time, close });
                            }
                        }
                    }
                    if !points.is_empty() {
                        return Ok(points);
                    }
                }
            }
        }
    }

    Err("Tidak dapat mengambil data harga historis BTC dari semua provider (Binance, Kraken, CoinGecko). Pastikan koneksi internet aktif.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_semver_comparison() {
        assert!(is_newer_version("1.8.0", "1.7.4"));
        assert!(is_newer_version("2.0.0", "1.7.4"));
        assert!(!is_newer_version("1.7.4", "1.7.4"));
        assert!(!is_newer_version("1.7.3", "1.7.4"));
    }
}
