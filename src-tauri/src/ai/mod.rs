use crate::credentials::{delete_ai_api_key, get_ai_key_hint, load_ai_api_key, save_ai_api_key};
use crate::db::repositories::settings::{get_setting, set_setting};
use crate::db::repositories::trades::list_trades;
use crate::models::{TradeDetail, TradeFilter};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const DEFAULT_MODEL: &str = "gpt-4o";
const DEFAULT_BASE_URL: &str = "https://api.openai.com/v1";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfigPayload {
    pub api_key: String,
    pub model: String,
    pub base_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfigStatus {
    pub configured: bool,
    pub model: Option<String>,
    pub base_url: Option<String>,
    pub key_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricItem {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalAnalysisResult {
    pub summary: String,
    pub weaknesses: Vec<String>,
    pub suggestions: Vec<String>,
    pub metrics: Option<Vec<MetricItem>>,
}

pub fn get_ai_config(conn: &Connection) -> AiConfigStatus {
    let model = get_setting(conn, "aiModel")
        .unwrap_or_else(|_| Some(json!(DEFAULT_MODEL)))
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| DEFAULT_MODEL.to_string());

    let base_url = get_setting(conn, "aiBaseUrl")
        .unwrap_or_else(|_| Some(json!(DEFAULT_BASE_URL)))
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| DEFAULT_BASE_URL.to_string());

    let key_hint = get_ai_key_hint();

    AiConfigStatus {
        configured: key_hint.is_some(),
        model: Some(model),
        base_url: Some(base_url),
        key_hint,
    }
}

pub fn save_ai_config(conn: &Connection, payload: &AiConfigPayload) -> Result<(), String> {
    save_ai_api_key(&payload.api_key)?;

    if !payload.model.trim().is_empty() {
        set_setting(conn, "aiModel", &json!(payload.model.trim()))
            .map_err(|e| format!("Gagal menyimpan model AI: {}", e))?;
    }

    if let Some(ref base) = payload.base_url {
        if !base.trim().is_empty() {
            set_setting(conn, "aiBaseUrl", &json!(base.trim()))
                .map_err(|e| format!("Gagal menyimpan base URL AI: {}", e))?;
        }
    }

    log::info!("[ai] Konfigurasi AI berhasil disimpan");
    Ok(())
}

pub fn delete_ai_config() -> Result<(), String> {
    delete_ai_api_key()
}

#[derive(Debug, Clone)]
pub struct AnalysisContext {
    pub api_key: String,
    pub model: String,
    pub base_url: String,
    pub trades: Vec<TradeDetail>,
}

pub fn prepare_analysis(
    conn: &Connection,
    filter: Option<&TradeFilter>,
) -> Result<AnalysisContext, String> {
    let api_key = load_ai_api_key()
        .ok_or_else(|| "API key AI belum dikonfigurasi. Atur di Settings terlebih dahulu.".to_string())?;

    let config = get_ai_config(conn);
    let model = config.model.unwrap_or_else(|| DEFAULT_MODEL.to_string());
    let base_url = config.base_url.unwrap_or_else(|| DEFAULT_BASE_URL.to_string());

    let default_filter = TradeFilter::default();
    let effective_filter = filter.unwrap_or(&default_filter);
    let trades = list_trades(conn, effective_filter)
        .map_err(|e| format!("Gagal membaca riwayat trade: {}", e))?;

    if trades.is_empty() {
        return Err("Tidak ada data trade yang sesuai untuk dianalisis.".to_string());
    }

    Ok(AnalysisContext {
        api_key,
        model,
        base_url,
        trades,
    })
}

pub async fn execute_analysis(ctx: AnalysisContext) -> Result<JournalAnalysisResult, String> {
    log::info!(
        "[ai] Menganalisis {} trade dengan model '{}' di '{}'",
        ctx.trades.len(),
        ctx.model,
        ctx.base_url
    );

    let prompt = build_prompt(&ctx.trades);
    let response_text = call_openai(&ctx.api_key, &ctx.model, &ctx.base_url, &prompt).await?;
    let parsed = parse_ai_response(&response_text);

    Ok(parsed)
}

pub async fn analyze_journal(
    conn: &Connection,
    filter: Option<&TradeFilter>,
) -> Result<JournalAnalysisResult, String> {
    let ctx = prepare_analysis(conn, filter)?;
    execute_analysis(ctx).await
}

fn build_prompt(trades: &[TradeDetail]) -> String {
    let trade_data = trades
        .iter()
        .map(|d| {
            json!({
                "symbol": d.trade.symbol,
                "direction": d.trade.direction,
                "entryPrice": d.trade.entry_price,
                "exitPrice": d.trade.exit_price,
                "realizedPnl": d.trade.realized_pnl,
                "rMultiple": d.r_multiple,
                "plannedRr": d.planned_risk.as_ref().and_then(|r| r.planned_rr),
                "feeTotal": d.trade.fee_open + d.trade.fee_close + d.trade.funding_fee,
                "setupTag": d.journal.as_ref().and_then(|j| j.setup_tag.clone()),
                "emotionTag": d.journal.as_ref().and_then(|j| j.emotion_tag.clone()),
                "executionGrade": d.journal.as_ref().and_then(|j| j.execution_grade.clone()),
                "tags": d.tags.iter().map(|t| t.name.clone()).collect::<Vec<_>>(),
                "thesis": d.journal.as_ref().and_then(|j| j.pre_trade_thesis.clone()),
                "review": d.journal.as_ref().and_then(|j| j.post_trade_review.clone())
            })
        })
        .collect::<Vec<_>>();

    let total_trades = trades.len();
    let wins = trades.iter().filter(|d| d.trade.realized_pnl > 0.0).count();
    let losses = trades.iter().filter(|d| d.trade.realized_pnl < 0.0).count();
    let net_pnl: f64 = trades.iter().map(|d| d.trade.realized_pnl).sum();

    let r_trades: Vec<f64> = trades.iter().filter_map(|d| d.r_multiple).collect();
    let avg_r = if !r_trades.is_empty() {
        Some(r_trades.iter().sum::<f64>() / (r_trades.len() as f64))
    } else {
        None
    };

    let avg_r_str = avg_r.map(|r| format!("{:.2}", r)).unwrap_or_else(|| "tidak tersedia".to_string());

    format!(
        r#"Anda adalah analis trading profesional. Analisa journal trading berikut dan berikan wawasan dalam Bahasa Indonesia yang lugas dan tajam.

STATISTIK RINGKAS:
- Total trade: {}
- Win/Loss: {}/{}
- P&L bersih total: {:.2}
- Rata-rata R-multiple: {}

DATA TRADE:
{}

Instruksi:
1. Identifikasi pola kelemahan nyata (mis. sering revenge trade setelah loss, win rate rendah di sesi/setup tertentu, ketidakdisiplinan stop loss, atau grade eksekusi buruk).
2. Berikan saran perbaikan yang konkret dan dapat langsung ditindaklanjuti.
3. Jangan mengulang teori umum — fokus pada pola yang terbukti dari data di atas.

Format respons WAJIB JSON:
{{
  "summary": "Ringkasan satu paragraf",
  "weaknesses": ["Kelemahan 1", "Kelemahan 2"],
  "suggestions": ["Saran 1", "Saran 2"],
  "metrics": [{{"label": "Win Rate", "value": "45%"}}]
}}"#,
        total_trades,
        wins,
        losses,
        net_pnl,
        avg_r_str,
        serde_json::to_string_pretty(&trade_data).unwrap_or_default()
    )
}

async fn call_openai(
    api_key: &str,
    model: &str,
    base_url: &str,
    prompt: &str,
) -> Result<String, String> {
    let clean_base = base_url.trim_end_matches('/');
    let url = format!("{}/chat/completions", clean_base);

    let body = json!({
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "Anda adalah asisten analisis trading journal. Selalu respons dengan format JSON valid sesuai skema yang diminta."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        "temperature": 0.7,
        "response_format": { "type": "json_object" }
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .unwrap_or_default();

    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Gagal menghubungi provider AI: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("AI API HTTP {}: {}", status, err_text));
    }

    let payload: Value = res
        .json()
        .await
        .map_err(|e| format!("Gagal membaca JSON dari respons AI: {}", e))?;

    let content = payload
        .get("choices")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|msg| msg.get("content"))
        .and_then(|cnt| cnt.as_str())
        .ok_or_else(|| "Respons AI tidak memuat field message.content".to_string())?;

    Ok(content.to_string())
}

pub fn parse_ai_response(content: &str) -> JournalAnalysisResult {
    let clean_json = extract_json_from_content(content);

    if let Ok(val) = serde_json::from_str::<Value>(&clean_json) {
        let summary = val
            .get("summary")
            .and_then(|s| s.as_str())
            .unwrap_or("Ringkasan analisis trading.")
            .to_string();

        let weaknesses = val
            .get("weaknesses")
            .and_then(|w| w.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| item.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        let suggestions = val
            .get("suggestions")
            .and_then(|s| s.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| item.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        let metrics = val
            .get("metrics")
            .and_then(|m| m.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| {
                        let label = item.get("label")?.as_str()?.to_string();
                        let value = item.get("value")?.as_str()?.to_string();
                        Some(MetricItem { label, value })
                    })
                    .collect()
            });

        return JournalAnalysisResult {
            summary,
            weaknesses,
            suggestions,
            metrics,
        };
    }

    // Fallback jika model gagal mengembalikan JSON valid
    JournalAnalysisResult {
        summary: content.chars().take(500).collect(),
        weaknesses: vec!["Format respons AI tidak berstruktur JSON baku.".to_string()],
        suggestions: vec!["Silakan coba ulangi analisa atau gunakan model lain di Pengaturan.".to_string()],
        metrics: None,
    }
}

fn extract_json_from_content(content: &str) -> String {
    let mut text = content.trim();

    // Hapus code fence markdown jika ada (```json ... ```)
    if let Some(start_idx) = text.find("```") {
        let after_fence = &text[start_idx + 3..];
        let content_start = if let Some(newline_idx) = after_fence.find('\n') {
            newline_idx + 1
        } else {
            0
        };
        let body = &after_fence[content_start..];
        if let Some(end_idx) = body.find("```") {
            text = body[..end_idx].trim();
        }
    }

    if let (Some(first_brace), Some(last_brace)) = (text.find('{'), text.rfind('}')) {
        if last_brace > first_brace {
            return text[first_brace..=last_brace].to_string();
        }
    }

    text.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_json_from_markdown_fence() {
        let raw = r#"Tentu, berikut hasil analisa trading Anda:
```json
{
  "summary": "Performa trading konsisten dan profit.",
  "weaknesses": ["Kurang sabar menunggu konfirmasi"],
  "suggestions": ["Gunakan limit order"],
  "metrics": [{"label": "Win Rate", "value": "65%"}]
}
```
Semoga bermanfaat!"#;

        let parsed = parse_ai_response(raw);
        assert_eq!(parsed.summary, "Performa trading konsisten dan profit.");
        assert_eq!(parsed.weaknesses.len(), 1);
        assert_eq!(parsed.weaknesses[0], "Kurang sabar menunggu konfirmasi");
        assert_eq!(parsed.suggestions.len(), 1);
        assert_eq!(parsed.suggestions[0], "Gunakan limit order");
        assert!(parsed.metrics.is_some());
        let metrics = parsed.metrics.unwrap();
        assert_eq!(metrics[0].label, "Win Rate");
        assert_eq!(metrics[0].value, "65%");
    }

    #[test]
    fn test_parse_ai_response_fallback_on_invalid() {
        let raw = "Maaf, server AI sedang mengalami kendala teknis dan tidak dapat memproses.";
        let parsed = parse_ai_response(raw);
        assert!(parsed.summary.contains("Maaf, server AI"));
        assert_eq!(parsed.weaknesses.len(), 1);
        assert!(parsed.weaknesses[0].contains("tidak berstruktur JSON"));
    }
}

