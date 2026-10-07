pub mod migrations;
pub mod repositories;

use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct DbState {
    pub conn: Mutex<Connection>,
    pub db_path: PathBuf,
}

pub fn get_db_path() -> PathBuf {
    // Migrasi data mundur / kompatibilitas:
    // Jika database sudah ada di direktori nitirekso/data, gunakan langsung.
    if let Some(appdata) = dirs::data_dir() {
        let candidate = appdata.join("nitirekso").join("data").join("trading-journal.sqlite");
        if candidate.exists() {
            return candidate;
        }

        // Cek folder alternatif dari versi Electron sebelumnya jika ada
        let old_candidates = [
            appdata.join("Aplikasi Trading Journal Otomatis").join("data").join("trading-journal.sqlite"),
            appdata.join("Nitirekso").join("data").join("trading-journal.sqlite"),
        ];

        let target_dir = appdata.join("nitirekso").join("data");
        let _ = std::fs::create_dir_all(&target_dir);
        let target_path = target_dir.join("trading-journal.sqlite");

        for old in &old_candidates {
            if old.exists() {
                let _ = std::fs::copy(old, &target_path);
                let _ = std::fs::copy(format!("{}-wal", old.display()), format!("{}-wal", target_path.display()));
                let _ = std::fs::copy(format!("{}-shm", old.display()), format!("{}-shm", target_path.display()));
                return target_path;
            }
        }

        return target_path;
    }

    PathBuf::from("trading-journal.sqlite")
}

pub fn open_db(path: &Path) -> Result<Connection, rusqlite::Error> {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let conn = Connection::open(path)?;

    // PRAGMA wajib sesuai plans/02-DATA-MODEL.md §8:
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;

    Ok(conn)
}

pub fn initialize_db(path: &Path) -> Result<Connection, rusqlite::Error> {
    let mut conn = open_db(path)?;
    migrations::run_migrations(&mut conn)?;
    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::*;

    #[test]
    fn test_migrations_and_repositories() {
        let mut conn = Connection::open_in_memory().expect("Buka DB in-memory");
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();

        // 1. Uji Migrasi 001..=006
        let applied = migrations::run_migrations(&mut conn).expect("Migrasi berhasil");
        assert_eq!(applied.len(), 6, "Semua 6 migrasi harus terpasang");

        // Jalankan ulang migrasi (idempotent)
        let rerun = migrations::run_migrations(&mut conn).expect("Migrasi ulang berhasil");
        assert_eq!(rerun.len(), 0, "Migrasi ulang tidak boleh menduplikasi");

        // 2. Uji CRUD Transaksi
        let trade_in = TradeInput {
            exchange: "mexc".to_string(),
            external_id: Some("pos-123".to_string()),
            symbol: "BTCUSDT".to_string(),
            direction: "long".to_string(),
            entry_price: 65000.0,
            exit_price: 67000.0,
            entry_time: 1700000000000,
            exit_time: 1700003600000,
            size: 0.1,
            leverage: 10.0,
            margin_mode: Some("isolated".to_string()),
            realized_pnl: 200.0,
            fee_open: 5.0,
            fee_close: 5.0,
            funding_fee: 1.0,
        };

        let journal_in = JournalInput {
            setup_tag: Some("Breakout".to_string()),
            pre_trade_thesis: Some("Bullish flag breakout".to_string()),
            post_trade_review: Some("TP kena sempurna".to_string()),
            emotion_tag: Some("calm".to_string()),
            execution_grade: Some("A".to_string()),
            screenshot_path: None,
            tags: Some(vec!["#BTC_Scalp".to_string(), "TrendFollowing".to_string()]),
            checklist: Some(vec![ChecklistInputItem {
                label: "Setup valid".to_string(),
                checked: true,
            }]),
        };

        let risk_in = PlannedRiskInput {
            planned_stop: Some(64000.0),
            planned_target: Some(67000.0),
            risk_amount: Some(100.0),
            planned_rr: Some(2.0),
        };

        let trade_id = repositories::trades::create_trade(
            &mut conn,
            &trade_in,
            Some(&journal_in),
            Some(&risk_in),
        )
        .expect("Create trade berhasil");
        assert!(trade_id > 0);

        // Ambil detail trade
        let detail = repositories::trades::get_trade(&conn, trade_id)
            .expect("Get trade")
            .expect("Trade harus ada");
        assert_eq!(detail.trade.symbol, "BTCUSDT");
        assert_eq!(detail.journal.as_ref().unwrap().setup_tag.as_deref(), Some("Breakout"));
        assert_eq!(detail.checklist.len(), 1);
        assert_eq!(detail.tags.len(), 2);
        assert_eq!(detail.r_multiple, Some(2.0)); // 200 realized / 100 risk

        // Filter list trades
        let list = repositories::trades::list_trades(
            &conn,
            &TradeFilter {
                symbol: Some("BTCUSDT".to_string()),
                ..Default::default()
            },
        )
        .expect("List trades");
        assert_eq!(list.len(), 1);

        // Meta
        let meta = repositories::trades::get_trade_meta(&conn).expect("Get meta");
        assert_eq!(meta.total_trades, 1);
        assert!(meta.symbols.contains(&"BTCUSDT".to_string()));
        assert!(meta.tags.contains(&"BTC_Scalp".to_string()));

        // 3. Uji Settings
        repositories::settings::set_setting(
            &conn,
            "theme",
            &serde_json::json!("dark"),
        )
        .expect("Set setting");
        let settings = repositories::settings::get_all_settings(&conn).expect("Get settings");
        assert_eq!(settings.get("theme").unwrap(), "dark");

        // 4. Uji Balances
        let b = AccountBalance {
            exchange: "mexc".to_string(),
            asset: "USDT".to_string(),
            total: 1500.0,
            available: 1200.0,
            unrealized_pnl: 50.0,
            updated_at: 1700000000000,
        };
        repositories::balances::upsert_balances(&mut conn, &[b]).expect("Upsert balance");
        let balances = repositories::balances::get_all_balances(&conn).expect("Get balances");
        assert_eq!(balances.len(), 1);
        assert_eq!(balances[0].total, 1500.0);
    }
}
