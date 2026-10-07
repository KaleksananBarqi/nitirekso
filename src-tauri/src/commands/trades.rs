use crate::db::repositories::trades;
use crate::db::DbState;
use crate::models::{
    CreateTradePayload, MutationResult, TradeDetail, TradeFilter, TradeMeta, UpdateTradePayload,
};
use tauri::State;

#[tauri::command]
pub fn list_trades(
    state: State<'_, DbState>,
    filter: Option<TradeFilter>,
) -> Result<Vec<TradeDetail>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let f = filter.unwrap_or_default();
    trades::list_trades(&conn, &f).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_trade(state: State<'_, DbState>, id: i64) -> Result<Option<TradeDetail>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    trades::get_trade(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_trade(
    state: State<'_, DbState>,
    payload: CreateTradePayload,
) -> Result<MutationResult<i64>, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    match trades::create_trade(
        &mut conn,
        &payload.trade,
        payload.journal.as_ref(),
        payload.planned_risk.as_ref(),
    ) {
        Ok(id) => Ok(MutationResult::success(id)),
        Err(e) => Ok(MutationResult::fail(format!(
            "Gagal membuat transaksi: {}",
            e
        ))),
    }
}

#[tauri::command]
pub fn update_trade(
    state: State<'_, DbState>,
    id: i64,
    payload: UpdateTradePayload,
) -> Result<MutationResult<()>, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    match trades::update_trade(
        &mut conn,
        id,
        &payload.trade,
        payload.journal.as_ref(),
        payload.planned_risk.as_ref(),
    ) {
        Ok(true) => Ok(MutationResult::ok_unit()),
        Ok(false) => Ok(MutationResult::fail(format!(
            "Transaksi dengan ID {} tidak ditemukan",
            id
        ))),
        Err(e) => Ok(MutationResult::fail(format!(
            "Gagal memperbarui transaksi: {}",
            e
        ))),
    }
}

#[tauri::command]
pub fn delete_trade(state: State<'_, DbState>, id: i64) -> Result<MutationResult<()>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // Bersihkan file screenshot terkait jika ada sebelum trade dihapus
    if let Ok(Some(detail)) = trades::get_trade(&conn, id) {
        if let Some(journal) = detail.journal {
            if let Some(screenshot_path) = journal.screenshot_path {
                crate::screenshots::delete_screenshot(&state.db_path, &screenshot_path);
            }
        }
    }

    match trades::delete_trade(&conn, id) {
        Ok(true) => Ok(MutationResult::ok_unit()),
        Ok(false) => Ok(MutationResult::fail(format!(
            "Transaksi dengan ID {} tidak ditemukan",
            id
        ))),
        Err(e) => Ok(MutationResult::fail(format!(
            "Gagal menghapus transaksi: {}",
            e
        ))),
    }
}

#[tauri::command]
pub fn get_trade_meta(state: State<'_, DbState>) -> Result<TradeMeta, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    trades::get_trade_meta(&conn).map_err(|e| e.to_string())
}
