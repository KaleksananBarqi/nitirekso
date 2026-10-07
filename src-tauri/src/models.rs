use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Trade {
    pub id: i64,
    pub exchange: String,
    pub external_id: Option<String>,
    pub symbol: String,
    pub direction: String,
    pub entry_price: f64,
    pub exit_price: f64,
    pub entry_time: i64,
    pub exit_time: i64,
    pub size: f64,
    pub leverage: f64,
    pub margin_mode: Option<String>,
    pub realized_pnl: f64,
    pub pnl_source: String,
    pub fee_open: f64,
    pub fee_close: f64,
    pub fee_open_maker: Option<f64>,
    pub fee_close_maker: Option<f64>,
    pub funding_fee: f64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeJournal {
    pub trade_id: i64,
    pub setup_tag: Option<String>,
    pub pre_trade_thesis: Option<String>,
    pub post_trade_review: Option<String>,
    pub emotion_tag: Option<String>,
    pub execution_grade: Option<String>,
    pub screenshot_path: Option<String>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecklistItem {
    pub id: i64,
    pub trade_id: i64,
    pub label: String,
    pub checked: bool,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeTag {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedRisk {
    pub trade_id: i64,
    pub planned_stop: Option<f64>,
    pub planned_target: Option<f64>,
    pub risk_amount: Option<f64>,
    pub planned_rr: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeDetail {
    pub trade: Trade,
    pub journal: Option<TradeJournal>,
    pub planned_risk: Option<PlannedRisk>,
    pub checklist: Vec<ChecklistItem>,
    pub tags: Vec<TradeTag>,
    pub r_multiple: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TradeFilter {
    pub exchange: Option<String>,
    pub symbol: Option<String>,
    pub from: Option<i64>,
    pub to: Option<i64>,
    pub setup_tag: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeInput {
    pub exchange: String,
    pub external_id: Option<String>,
    pub symbol: String,
    pub direction: String,
    pub entry_price: f64,
    pub exit_price: f64,
    pub entry_time: i64,
    pub exit_time: i64,
    pub size: f64,
    pub leverage: f64,
    pub margin_mode: Option<String>,
    pub realized_pnl: f64,
    pub fee_open: f64,
    pub fee_close: f64,
    pub funding_fee: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChecklistInputItem {
    pub label: String,
    pub checked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct JournalInput {
    pub setup_tag: Option<String>,
    pub pre_trade_thesis: Option<String>,
    pub post_trade_review: Option<String>,
    pub emotion_tag: Option<String>,
    pub execution_grade: Option<String>,
    pub screenshot_path: Option<String>,
    pub tags: Option<Vec<String>>,
    pub checklist: Option<Vec<ChecklistInputItem>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PlannedRiskInput {
    pub planned_stop: Option<f64>,
    pub planned_target: Option<f64>,
    pub risk_amount: Option<f64>,
    pub planned_rr: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTradePayload {
    pub trade: TradeInput,
    pub journal: Option<JournalInput>,
    pub planned_risk: Option<PlannedRiskInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTradePayload {
    pub trade: TradeInput,
    pub journal: Option<JournalInput>,
    pub planned_risk: Option<PlannedRiskInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeMeta {
    pub symbols: Vec<String>,
    pub setup_tags: Vec<String>,
    pub emotion_tags: Vec<String>,
    pub tags: Vec<String>,
    pub checklist_template: Vec<String>,
    pub total_trades: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountBalance {
    pub exchange: String,
    pub asset: String,
    pub total: f64,
    pub available: f64,
    pub unrealized_pnl: f64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppHealth {
    pub ok: bool,
    pub details: Vec<String>,
    pub db_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationResult<T> {
    pub ok: bool,
    pub error: Option<String>,
    pub data: Option<T>,
}

impl<T> MutationResult<T> {
    pub fn success(data: T) -> Self {
        Self {
            ok: true,
            error: None,
            data: Some(data),
        }
    }

    pub fn fail(err: impl Into<String>) -> Self {
        Self {
            ok: false,
            error: Some(err.into()),
            data: None,
        }
    }
}

impl MutationResult<()> {
    pub fn ok_unit() -> Self {
        Self {
            ok: true,
            error: None,
            data: None,
        }
    }
}

impl From<crate::exchanges::types::RawAccountBalance> for AccountBalance {
    fn from(r: crate::exchanges::types::RawAccountBalance) -> Self {
        Self {
            exchange: r.exchange,
            asset: r.asset,
            total: r.total,
            available: r.available,
            unrealized_pnl: r.unrealized_pnl,
            updated_at: r.updated_at,
        }
    }
}
