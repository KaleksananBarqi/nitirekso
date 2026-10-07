use crate::models::{TradeDetail, TradeFilter};
use crate::db::repositories::trades::list_trades;
use rusqlite::Connection;
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

pub type ExportFormat = String; // "csv" | "json" | "pdf"

fn format_date_time(timestamp_ms: i64) -> String {
    let secs = (timestamp_ms / 1000).max(0) as u64;
    let days = secs / 86400;
    let z = days + 719468;
    let era = z / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64) + (era as i64) * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let final_y = if m <= 2 { y + 1 } else { y };

    let rem_secs = secs % 86400;
    let hours = rem_secs / 3600;
    let mins = (rem_secs % 3600) / 60;
    let seconds = rem_secs % 60;

    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
        final_y, m, d, hours, mins, seconds
    )
}

fn csv_escape(val: &str) -> String {
    if val.contains(',') || val.contains('"') || val.contains('\n') || val.contains('\r') {
        format!("\"{}\"", val.replace('"', "\"\""))
    } else {
        val.to_string()
    }
}

pub fn to_csv(trades: &[TradeDetail]) -> String {
    let bom = "\u{FEFF}";
    let headers = [
        "ID",
        "Exchange",
        "Symbol",
        "Direction",
        "Entry Price",
        "Exit Price",
        "Entry Time",
        "Exit Time",
        "Size",
        "Leverage",
        "Margin Mode",
        "Realized PnL",
        "Fee Open",
        "Fee Close",
        "Funding Fee",
        "Setup Tag",
        "Emotion Tag",
        "Execution Grade",
        "Tags",
        "Planned Stop",
        "Planned Target",
        "Risk Amount",
        "Planned RR",
        "R Multiple",
        "Pre-Trade Thesis",
        "Post-Trade Review",
        "Screenshot",
    ];

    let mut rows = vec![headers.join(",")];

    for d in trades {
        let t = &d.trade;
        let j = d.journal.as_ref();
        let pr = d.planned_risk.as_ref();

        let tags_str = d
            .tags
            .iter()
            .map(|tg| tg.name.as_str())
            .collect::<Vec<_>>()
            .join("; ");

        let row_values = [
            t.id.to_string(),
            t.exchange.clone(),
            t.symbol.clone(),
            t.direction.clone(),
            t.entry_price.to_string(),
            t.exit_price.to_string(),
            format_date_time(t.entry_time),
            format_date_time(t.exit_time),
            t.size.to_string(),
            t.leverage.to_string(),
            t.margin_mode.clone().unwrap_or_default(),
            t.realized_pnl.to_string(),
            t.fee_open.to_string(),
            t.fee_close.to_string(),
            t.funding_fee.to_string(),
            j.and_then(|x| x.setup_tag.clone()).unwrap_or_default(),
            j.and_then(|x| x.emotion_tag.clone()).unwrap_or_default(),
            j.and_then(|x| x.execution_grade.clone()).unwrap_or_default(),
            tags_str,
            pr.and_then(|x| x.planned_stop).map(|v| v.to_string()).unwrap_or_default(),
            pr.and_then(|x| x.planned_target).map(|v| v.to_string()).unwrap_or_default(),
            pr.and_then(|x| x.risk_amount).map(|v| v.to_string()).unwrap_or_default(),
            pr.and_then(|x| x.planned_rr).map(|v| v.to_string()).unwrap_or_default(),
            d.r_multiple.map(|v| format!("{:.2}R", v)).unwrap_or_default(),
            j.and_then(|x| x.pre_trade_thesis.clone()).unwrap_or_default(),
            j.and_then(|x| x.post_trade_review.clone()).unwrap_or_default(),
            j.and_then(|x| x.screenshot_path.clone()).unwrap_or_default(),
        ];

        let escaped_row: Vec<String> = row_values.iter().map(|s| csv_escape(s)).collect();
        rows.push(escaped_row.join(","));
    }

    format!("{}{}", bom, rows.join("\r\n"))
}

pub fn to_json(trades: &[TradeDetail]) -> Result<String, String> {
    serde_json::to_string_pretty(trades).map_err(|e| format!("Gagal serialize JSON: {}", e))
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

pub fn to_html_report(trades: &[TradeDetail]) -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let mut total_pnl = 0.0;
    let mut table_rows = String::new();

    for d in trades {
        let t = &d.trade;
        total_pnl += t.realized_pnl;
        let j = d.journal.as_ref();
        let tags_str = d
            .tags
            .iter()
            .map(|tg| format!("#{}", tg.name))
            .collect::<Vec<_>>()
            .join(" ");

        let pnl_color = if t.realized_pnl >= 0.0 { "#16a34a" } else { "#dc2626" };
        let r_str = d.r_multiple.map(|r| format!("{:.2}R", r)).unwrap_or_else(|| "-".to_string());

        table_rows.push_str(&format!(
            "<tr>\
                <td>{}</td>\
                <td><strong>{}</strong></td>\
                <td>{}</td>\
                <td style=\"color: {}; font-weight: bold; text-align: right;\">${:.2}</td>\
                <td style=\"text-align: right;\">{}</td>\
                <td>{}</td>\
                <td>{}</td>\
                <td>{}</td>\
                <td>{}</td>\
                <td>{}</td>\
            </tr>",
            format_date_time(t.exit_time),
            escape_html(&t.symbol),
            escape_html(&t.direction),
            pnl_color,
            t.realized_pnl,
            r_str,
            escape_html(&j.and_then(|x| x.setup_tag.clone()).unwrap_or_default()),
            escape_html(&j.and_then(|x| x.emotion_tag.clone()).unwrap_or_default()),
            escape_html(&j.and_then(|x| x.execution_grade.clone()).unwrap_or_default()),
            escape_html(&tags_str),
            escape_html(&j.and_then(|x| x.post_trade_review.clone()).unwrap_or_default()),
        ));
    }

    let summary_color = if total_pnl >= 0.0 { "#16a34a" } else { "#dc2626" };

    format!(
        r#"<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>Trading Journal Report</title>
<style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; color: #1e293b; margin: 0; padding: 24px; }}
    h1 {{ font-size: 20px; margin: 0 0 6px 0; color: #0f172a; }}
    .meta {{ font-size: 11px; color: #64748b; margin-bottom: 20px; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 10px; }}
    th {{ background: #f8fafc; text-align: left; padding: 8px 10px; font-size: 10px; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; color: #475569; }}
    td {{ padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }}
    .summary {{ margin-top: 24px; font-size: 14px; font-weight: bold; padding: 12px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; }}
</style>
</head>
<body>
    <h1>Trading Journal Report</h1>
    <div class="meta">Total {} transaksi · Diekspor pada {}</div>
    <table>
        <thead>
            <tr>
                <th>Waktu Exit</th>
                <th>Simbol</th>
                <th>Posisi</th>
                <th style="text-align: right;">Realized PnL</th>
                <th style="text-align: right;">R-Multiple</th>
                <th>Setup</th>
                <th>Emosi</th>
                <th>Grade</th>
                <th>Tags</th>
                <th>Review</th>
            </tr>
        </thead>
        <tbody>
            {}
        </tbody>
    </table>
    <div class="summary">
        Total Net P&L: <span style="color: {};">${:.2}</span>
    </div>
</body>
</html>"#,
        trades.len(),
        format_date_time(now),
        table_rows,
        summary_color,
        total_pnl
    )
}

pub fn export_journal_to_file(
    conn: &Connection,
    format: &str,
    filter: Option<&TradeFilter>,
) -> Result<String, String> {
    let default_filter = TradeFilter::default();
    let effective_filter = filter.unwrap_or(&default_filter);
    let trades = list_trades(conn, effective_filter)
        .map_err(|e| format!("Gagal mengambil data trade: {}", e))?;

    let default_name = format!("trading-journal-{}.{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs(), match format {
        "csv" => "csv",
        "json" => "json",
        "pdf" => "html", // File HTML dapat langsung dicetak ke PDF di browser apa pun
        _ => "txt",
    });

    let mut dialog = rfd::FileDialog::new()
        .set_title(&format!("Simpan Ekspor Journal ({})", format.to_uppercase()))
        .set_file_name(&default_name);

    dialog = match format {
        "csv" => dialog.add_filter("CSV (UTF-8)", &["csv"]),
        "json" => dialog.add_filter("JSON Document", &["json"]),
        "pdf" => dialog.add_filter("HTML / PDF Report", &["html", "pdf"]),
        _ => dialog,
    };

    let target_path = dialog
        .save_file()
        .ok_or_else(|| "Ekspor dibatalkan oleh pengguna.".to_string())?;

    match format {
        "csv" => {
            let csv_content = to_csv(&trades);
            fs::write(&target_path, csv_content.as_bytes())
                .map_err(|e| format!("Gagal menulis file CSV: {}", e))?;
        }
        "json" => {
            let json_content = to_json(&trades)?;
            fs::write(&target_path, json_content.as_bytes())
                .map_err(|e| format!("Gagal menulis file JSON: {}", e))?;
        }
        "pdf" | "html" => {
            let html_content = to_html_report(&trades);
            fs::write(&target_path, html_content.as_bytes())
                .map_err(|e| format!("Gagal menulis file report: {}", e))?;
        }
        other => return Err(format!("Format ekspor '{}' tidak didukung.", other)),
    }

    let path_str = target_path.to_string_lossy().to_string();
    log::info!("[export] Ekspor ({}) berhasil ke: {}", format, path_str);
    Ok(path_str)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_csv_escape() {
        assert_eq!(csv_escape("normal"), "normal");
        assert_eq!(csv_escape("with,comma"), "\"with,comma\"");
        assert_eq!(csv_escape("with\"quote"), "\"with\"\"quote\"");
    }
}
