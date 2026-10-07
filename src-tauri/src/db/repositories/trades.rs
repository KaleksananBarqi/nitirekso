use crate::models::{
    ChecklistItem, JournalInput, PlannedRisk, PlannedRiskInput, Trade, TradeDetail, TradeFilter,
    TradeInput, TradeJournal, TradeMeta, TradeTag,
};
use rusqlite::{params, Connection, Result};
use std::collections::{HashMap, HashSet};

pub const DEFAULT_CHECKLIST_TEMPLATE: &[&str] = &[
    "Sesuai rencana risk %",
    "Tidak entry saat news besar",
    "Setup sesuai playbook",
    "Stop loss sudah ditentukan sebelum entry",
];

pub fn normalize_tag_name(raw: &str) -> String {
    let mut val = raw.trim();
    while val.starts_with('#') {
        val = &val[1..];
    }
    val.trim().to_string()
}

fn compute_r(realized_pnl: f64, risk_amount: Option<f64>) -> Option<f64> {
    match risk_amount {
        Some(risk) if risk.abs() > 0.0000001 => Some(realized_pnl / risk),
        _ => None,
    }
}

fn normalize_text(val: Option<String>) -> Option<String> {
    match val {
        Some(s) => {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        }
        None => None,
    }
}

struct RelatedData {
    journals: HashMap<i64, TradeJournal>,
    risks: HashMap<i64, PlannedRisk>,
    checklists: HashMap<i64, Vec<ChecklistItem>>,
    tags: HashMap<i64, Vec<TradeTag>>,
}

fn load_related(conn: &Connection, trade_ids: &[i64]) -> Result<RelatedData> {
    let mut journals = HashMap::new();
    let mut risks = HashMap::new();
    let mut checklists = HashMap::new();
    let mut tags = HashMap::new();

    if trade_ids.is_empty() {
        return Ok(RelatedData {
            journals,
            risks,
            checklists,
            tags,
        });
    }

    let id_list = trade_ids
        .iter()
        .map(|id| id.to_string())
        .collect::<Vec<_>>()
        .join(",");

    // 1. Journals
    let journal_sql = format!(
        "SELECT trade_id, setup_tag, pre_trade_thesis, post_trade_review,
                emotion_tag, execution_grade, screenshot_path, updated_at
         FROM trade_journal WHERE trade_id IN ({})",
        id_list
    );
    let mut stmt = conn.prepare(&journal_sql)?;
    let j_rows = stmt.query_map([], |row| {
        Ok(TradeJournal {
            trade_id: row.get(0)?,
            setup_tag: row.get(1)?,
            pre_trade_thesis: row.get(2)?,
            post_trade_review: row.get(3)?,
            emotion_tag: row.get(4)?,
            execution_grade: row.get(5)?,
            screenshot_path: row.get(6)?,
            updated_at: row.get(7)?,
        })
    })?;
    for j in j_rows {
        let item = j?;
        journals.insert(item.trade_id, item);
    }

    // 2. Planned Risks
    let risk_sql = format!(
        "SELECT trade_id, planned_stop, planned_target, risk_amount, planned_rr
         FROM planned_risk WHERE trade_id IN ({})",
        id_list
    );
    let mut stmt = conn.prepare(&risk_sql)?;
    let r_rows = stmt.query_map([], |row| {
        Ok(PlannedRisk {
            trade_id: row.get(0)?,
            planned_stop: row.get(1)?,
            planned_target: row.get(2)?,
            risk_amount: row.get(3)?,
            planned_rr: row.get(4)?,
        })
    })?;
    for r in r_rows {
        let item = r?;
        risks.insert(item.trade_id, item);
    }

    // 3. Checklists
    let check_sql = format!(
        "SELECT id, trade_id, label, checked, sort_order
         FROM journal_checklist WHERE trade_id IN ({})
         ORDER BY trade_id, sort_order, id",
        id_list
    );
    let mut stmt = conn.prepare(&check_sql)?;
    let c_rows = stmt.query_map([], |row| {
        let checked_int: i64 = row.get(3)?;
        Ok(ChecklistItem {
            id: row.get(0)?,
            trade_id: row.get(1)?,
            label: row.get(2)?,
            checked: checked_int == 1,
            sort_order: row.get(4)?,
        })
    })?;
    for c in c_rows {
        let item = c?;
        checklists
            .entry(item.trade_id)
            .or_insert_with(Vec::new)
            .push(item);
    }

    // 4. Tags
    let tag_sql = format!(
        "SELECT jt.trade_id, jt2.id, jt2.name
         FROM trade_journal_tags jt
         JOIN journal_tags jt2 ON jt2.id = jt.tag_id
         WHERE jt.trade_id IN ({})
         ORDER BY jt.trade_id, jt2.name COLLATE NOCASE",
        id_list
    );
    let mut stmt = conn.prepare(&tag_sql)?;
    let t_rows = stmt.query_map([], |row| {
        let trade_id: i64 = row.get(0)?;
        let tag = TradeTag {
            id: row.get(1)?,
            name: row.get(2)?,
        };
        Ok((trade_id, tag))
    })?;
    for t in t_rows {
        let (trade_id, tag) = t?;
        tags.entry(trade_id).or_insert_with(Vec::new).push(tag);
    }

    Ok(RelatedData {
        journals,
        risks,
        checklists,
        tags,
    })
}

fn assemble_detail(trade: Trade, related: &mut RelatedData) -> TradeDetail {
    let trade_id = trade.id;
    let journal = related.journals.remove(&trade_id);
    let planned_risk = related.risks.remove(&trade_id);
    let checklist = related.checklists.remove(&trade_id).unwrap_or_default();
    let tags = related.tags.remove(&trade_id).unwrap_or_default();
    let r_multiple = compute_r(
        trade.realized_pnl,
        planned_risk.as_ref().and_then(|r| r.risk_amount),
    );

    TradeDetail {
        trade,
        journal,
        planned_risk,
        checklist,
        tags,
        r_multiple,
    }
}

pub fn list_trades(conn: &Connection, filter: &TradeFilter) -> Result<Vec<TradeDetail>> {
    let mut conditions = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(ref ex) = filter.exchange {
        conditions.push("t.exchange = ?".to_string());
        params_vec.push(Box::new(ex.clone()));
    }
    if let Some(ref sym) = filter.symbol {
        conditions.push("t.symbol = ?".to_string());
        params_vec.push(Box::new(sym.clone()));
    }
    if let Some(from) = filter.from {
        conditions.push("t.exit_time >= ?".to_string());
        params_vec.push(Box::new(from));
    }
    if let Some(to) = filter.to {
        conditions.push("t.exit_time <= ?".to_string());
        params_vec.push(Box::new(to));
    }

    let mut join_clause = String::new();
    if let Some(ref st) = filter.setup_tag {
        join_clause = "LEFT JOIN trade_journal j ON j.trade_id = t.id".to_string();
        conditions.push("j.setup_tag = ?".to_string());
        params_vec.push(Box::new(st.clone()));
    }

    let mut sql = format!("SELECT t.* FROM trades t {}", join_clause);
    if !conditions.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&conditions.join(" AND "));
    }
    sql.push_str(" ORDER BY t.exit_time DESC, t.id DESC");

    if let Some(limit) = filter.limit {
        sql.push_str(" LIMIT ?");
        params_vec.push(Box::new(limit));
        if let Some(offset) = filter.offset {
            sql.push_str(" OFFSET ?");
            params_vec.push(Box::new(offset));
        }
    }

    let mut stmt = conn.prepare(&sql)?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

    let rows = stmt.query_map(param_refs.as_slice(), |row| {
        Ok(Trade {
            id: row.get(0)?,
            exchange: row.get(1)?,
            external_id: row.get(2)?,
            symbol: row.get(3)?,
            direction: row.get(4)?,
            entry_price: row.get(5)?,
            exit_price: row.get(6)?,
            entry_time: row.get(7)?,
            exit_time: row.get(8)?,
            size: row.get(9)?,
            leverage: row.get(10)?,
            margin_mode: row.get(11)?,
            realized_pnl: row.get(12)?,
            pnl_source: row.get(13)?,
            fee_open: row.get(14)?,
            fee_close: row.get(15)?,
            fee_open_maker: row.get(16)?,
            fee_close_maker: row.get(17)?,
            funding_fee: row.get(18)?,
            created_at: row.get(19)?,
            updated_at: row.get(20)?,
        })
    })?;

    let mut trades = Vec::new();
    for t in rows {
        trades.push(t?);
    }

    let trade_ids: Vec<i64> = trades.iter().map(|t| t.id).collect();
    let mut related = load_related(conn, &trade_ids)?;

    let result = trades
        .into_iter()
        .map(|t| assemble_detail(t, &mut related))
        .collect();

    Ok(result)
}

pub fn get_trade(conn: &Connection, id: i64) -> Result<Option<TradeDetail>> {
    let mut stmt = conn.prepare("SELECT * FROM trades WHERE id = ?")?;
    let mut rows = stmt.query_map(params![id], |row| {
        Ok(Trade {
            id: row.get(0)?,
            exchange: row.get(1)?,
            external_id: row.get(2)?,
            symbol: row.get(3)?,
            direction: row.get(4)?,
            entry_price: row.get(5)?,
            exit_price: row.get(6)?,
            entry_time: row.get(7)?,
            exit_time: row.get(8)?,
            size: row.get(9)?,
            leverage: row.get(10)?,
            margin_mode: row.get(11)?,
            realized_pnl: row.get(12)?,
            pnl_source: row.get(13)?,
            fee_open: row.get(14)?,
            fee_close: row.get(15)?,
            fee_open_maker: row.get(16)?,
            fee_close_maker: row.get(17)?,
            funding_fee: row.get(18)?,
            created_at: row.get(19)?,
            updated_at: row.get(20)?,
        })
    })?;

    if let Some(trade) = rows.next() {
        let t = trade?;
        let mut related = load_related(conn, &[t.id])?;
        Ok(Some(assemble_detail(t, &mut related)))
    } else {
        Ok(None)
    }
}

pub fn create_trade(
    conn: &mut Connection,
    trade_input: &TradeInput,
    journal_input: Option<&JournalInput>,
    risk_input: Option<&PlannedRiskInput>,
) -> Result<i64> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let tx = conn.transaction()?;

    tx.execute(
        "INSERT INTO trades
         (exchange, external_id, symbol, direction, entry_price, exit_price,
          entry_time, exit_time, size, leverage, margin_mode, realized_pnl,
          pnl_source, fee_open, fee_close, fee_open_maker, fee_close_maker,
          funding_fee, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            trade_input.exchange,
            normalize_text(trade_input.external_id.clone()),
            trade_input.symbol.trim(),
            trade_input.direction,
            trade_input.entry_price,
            trade_input.exit_price,
            trade_input.entry_time,
            trade_input.exit_time,
            trade_input.size,
            trade_input.leverage,
            trade_input.margin_mode,
            trade_input.realized_pnl,
            "manual",
            trade_input.fee_open,
            trade_input.fee_close,
            Option::<f64>::None,
            Option::<f64>::None,
            trade_input.funding_fee,
            now,
            now
        ],
    )?;

    let trade_id = tx.last_insert_rowid();

    // Tulis jurnal
    write_journal_tx(&tx, trade_id, journal_input, now)?;
    // Tulis planned risk
    write_planned_risk_tx(&tx, trade_id, risk_input)?;

    tx.commit()?;
    Ok(trade_id)
}

pub fn update_trade(
    conn: &mut Connection,
    id: i64,
    trade_input: &TradeInput,
    journal_input: Option<&JournalInput>,
    risk_input: Option<&PlannedRiskInput>,
) -> Result<bool> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let tx = conn.transaction()?;

    let rows_affected = tx.execute(
        "UPDATE trades SET
         exchange = ?, external_id = ?, symbol = ?, direction = ?,
         entry_price = ?, exit_price = ?, entry_time = ?, exit_time = ?,
         size = ?, leverage = ?, margin_mode = ?, realized_pnl = ?,
         fee_open = ?, fee_close = ?, funding_fee = ?, updated_at = ?
         WHERE id = ?",
        params![
            trade_input.exchange,
            normalize_text(trade_input.external_id.clone()),
            trade_input.symbol.trim(),
            trade_input.direction,
            trade_input.entry_price,
            trade_input.exit_price,
            trade_input.entry_time,
            trade_input.exit_time,
            trade_input.size,
            trade_input.leverage,
            trade_input.margin_mode,
            trade_input.realized_pnl,
            trade_input.fee_open,
            trade_input.fee_close,
            trade_input.funding_fee,
            now,
            id
        ],
    )?;

    if rows_affected == 0 {
        return Ok(false);
    }

    write_journal_tx(&tx, id, journal_input, now)?;
    write_planned_risk_tx(&tx, id, risk_input)?;

    tx.commit()?;
    Ok(true)
}

pub fn delete_trade(conn: &Connection, id: i64) -> Result<bool> {
    let rows_affected = conn.execute("DELETE FROM trades WHERE id = ?", params![id])?;
    Ok(rows_affected > 0)
}

fn write_journal_tx(
    tx: &rusqlite::Transaction,
    trade_id: i64,
    journal: Option<&JournalInput>,
    now: i64,
) -> Result<()> {
    let default_input = JournalInput::default();
    let j = journal.unwrap_or(&default_input);

    tx.execute(
        "INSERT INTO trade_journal
         (trade_id, setup_tag, pre_trade_thesis, post_trade_review, emotion_tag,
          execution_grade, screenshot_path, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(trade_id) DO UPDATE SET
           setup_tag         = excluded.setup_tag,
           pre_trade_thesis  = excluded.pre_trade_thesis,
           post_trade_review = excluded.post_trade_review,
           emotion_tag       = excluded.emotion_tag,
           execution_grade   = excluded.execution_grade,
           screenshot_path   = excluded.screenshot_path,
           updated_at        = excluded.updated_at",
        params![
            trade_id,
            normalize_text(j.setup_tag.clone()),
            normalize_text(j.pre_trade_thesis.clone()),
            normalize_text(j.post_trade_review.clone()),
            normalize_text(j.emotion_tag.clone()),
            j.execution_grade.clone(),
            normalize_text(j.screenshot_path.clone()),
            now
        ],
    )?;

    // Checklist
    if let Some(ref checklist) = j.checklist {
        tx.execute(
            "DELETE FROM journal_checklist WHERE trade_id = ?",
            params![trade_id],
        )?;
        let mut insert_stmt = tx.prepare(
            "INSERT INTO journal_checklist (trade_id, label, checked, sort_order) VALUES (?, ?, ?, ?)",
        )?;
        for (idx, item) in checklist.iter().enumerate() {
            insert_stmt.execute(params![
                trade_id,
                item.label,
                if item.checked { 1 } else { 0 },
                idx as i64
            ])?;
        }
    } else if journal.is_none() {
        // Jika pembuatan baru tanpa checklist, isi dengan template default
        tx.execute(
            "DELETE FROM journal_checklist WHERE trade_id = ?",
            params![trade_id],
        )?;
        let mut insert_stmt = tx.prepare(
            "INSERT INTO journal_checklist (trade_id, label, checked, sort_order) VALUES (?, ?, ?, ?)",
        )?;
        for (idx, label) in DEFAULT_CHECKLIST_TEMPLATE.iter().enumerate() {
            insert_stmt.execute(params![trade_id, label, 0, idx as i64])?;
        }
    }

    // Tags
    if let Some(ref tag_names) = j.tags {
        tx.execute(
            "DELETE FROM trade_journal_tags WHERE trade_id = ?",
            params![trade_id],
        )?;
        let mut unique_tags = HashSet::new();
        for raw in tag_names {
            let n = normalize_tag_name(raw);
            if !n.is_empty() {
                unique_tags.insert(n);
            }
        }

        for name in unique_tags {
            // Dapatkan atau buat tag
            let tag_id: i64 = match tx.query_row(
                "SELECT id FROM journal_tags WHERE name = ? COLLATE NOCASE",
                params![&name],
                |r| r.get(0),
            ) {
                Ok(id) => id,
                Err(_) => {
                    tx.execute(
                        "INSERT INTO journal_tags (name, created_at) VALUES (?, ?)",
                        params![&name, now],
                    )?;
                    tx.last_insert_rowid()
                }
            };

            tx.execute(
                "INSERT OR IGNORE INTO trade_journal_tags (trade_id, tag_id) VALUES (?, ?)",
                params![trade_id, tag_id],
            )?;
        }
    }

    Ok(())
}

fn write_planned_risk_tx(
    tx: &rusqlite::Transaction,
    trade_id: i64,
    risk: Option<&PlannedRiskInput>,
) -> Result<()> {
    if let Some(r) = risk {
        tx.execute(
            "INSERT INTO planned_risk (trade_id, planned_stop, planned_target, risk_amount, planned_rr)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(trade_id) DO UPDATE SET
               planned_stop   = excluded.planned_stop,
               planned_target = excluded.planned_target,
               risk_amount    = excluded.risk_amount,
               planned_rr     = excluded.planned_rr",
            params![trade_id, r.planned_stop, r.planned_target, r.risk_amount, r.planned_rr],
        )?;
    }
    Ok(())
}

pub fn get_trade_meta(conn: &Connection) -> Result<TradeMeta> {
    // 1. Symbols
    let mut stmt = conn.prepare("SELECT DISTINCT symbol FROM trades ORDER BY symbol ASC")?;
    let symbols = stmt
        .query_map([], |r| r.get::<_, String>(0))?
        .filter_map(Result::ok)
        .collect();

    // 2. Setup Tags
    let mut stmt = conn.prepare(
        "SELECT DISTINCT setup_tag FROM trade_journal
         WHERE setup_tag IS NOT NULL AND TRIM(setup_tag) <> ''
         ORDER BY setup_tag COLLATE NOCASE",
    )?;
    let setup_tags = stmt
        .query_map([], |r| r.get::<_, String>(0))?
        .filter_map(Result::ok)
        .collect();

    // 3. Emotion Tags
    let mut stmt = conn.prepare(
        "SELECT DISTINCT emotion_tag FROM trade_journal
         WHERE emotion_tag IS NOT NULL AND TRIM(emotion_tag) <> ''
         ORDER BY emotion_tag COLLATE NOCASE",
    )?;
    let emotion_tags = stmt
        .query_map([], |r| r.get::<_, String>(0))?
        .filter_map(Result::ok)
        .collect();

    // 4. Custom Tags
    let mut stmt =
        conn.prepare("SELECT DISTINCT name FROM journal_tags ORDER BY name COLLATE NOCASE")?;
    let tags = stmt
        .query_map([], |r| r.get::<_, String>(0))?
        .filter_map(Result::ok)
        .collect();

    // 5. Total Trades
    let total_trades: i64 = conn.query_row("SELECT COUNT(*) FROM trades", [], |r| r.get(0))?;

    let checklist_template = DEFAULT_CHECKLIST_TEMPLATE
        .iter()
        .map(|s| s.to_string())
        .collect();

    Ok(TradeMeta {
        symbols,
        setup_tags,
        emotion_tags,
        tags,
        checklist_template,
        total_trades,
    })
}
