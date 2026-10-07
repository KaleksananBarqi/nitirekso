use rusqlite::{params, Connection, Result};
use std::collections::HashSet;

struct Migration {
    version: i64,
    name: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "001_init",
        sql: include_str!("../../migrations/001_init.sql"),
    },
    Migration {
        version: 2,
        name: "002_sync_support",
        sql: include_str!("../../migrations/002_sync_support.sql"),
    },
    Migration {
        version: 3,
        name: "003_custom_tags",
        sql: include_str!("../../migrations/003_custom_tags.sql"),
    },
    Migration {
        version: 4,
        name: "004_account_balances",
        sql: include_str!("../../migrations/004_account_balances.sql"),
    },
    Migration {
        version: 5,
        name: "005_add_exchanges",
        sql: include_str!("../../migrations/005_add_exchanges.sql"),
    },
    Migration {
        version: 6,
        name: "006_restore_sync_columns",
        sql: include_str!("../../migrations/006_restore_sync_columns.sql"),
    },
];

pub fn run_migrations(conn: &mut Connection) -> Result<Vec<i64>> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version    INTEGER PRIMARY KEY,
            name       TEXT NOT NULL,
            applied_at INTEGER NOT NULL
        );",
    )?;

    let mut applied_versions = HashSet::new();
    {
        let mut stmt = conn.prepare("SELECT version FROM schema_migrations ORDER BY version")?;
        let rows = stmt.query_map([], |row| row.get::<_, i64>(0))?;
        for v in rows {
            applied_versions.insert(v?);
        }
    }

    let mut applied_now = Vec::new();

    for migration in MIGRATIONS {
        if applied_versions.contains(&migration.version) {
            continue;
        }

        log::info!("[db:migrate] Menjalankan migrasi {}...", migration.name);
        let tx = conn.transaction()?;
        execute_migration_sql(&tx, migration.sql, migration.name)?;

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        tx.execute(
            "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
            params![migration.version, migration.name, now],
        )?;

        tx.commit()?;
        applied_now.push(migration.version);
    }

    Ok(applied_now)
}

fn execute_migration_sql(conn: &Connection, sql: &str, migration_name: &str) -> Result<()> {
    match conn.execute_batch(sql) {
        Ok(_) => Ok(()),
        Err(err) => {
            let msg = err.to_string();
            if msg.to_lowercase().contains("duplicate column name") {
                log::warn!(
                    "[db:migrate] Kolom duplikat pada {}, beralih ke eksekusi per-statement: {}",
                    migration_name,
                    msg
                );
                let statements = split_sql_statements(sql);
                for statement in statements {
                    if let Err(e) = conn.execute_batch(&statement) {
                        let e_msg = e.to_string();
                        if !e_msg.to_lowercase().contains("duplicate column name") {
                            return Err(e);
                        }
                        log::info!("[db:migrate] Mengabaikan duplikasi kolom: {}", e_msg);
                    }
                }
                Ok(())
            } else {
                Err(err)
            }
        }
    }
}

fn split_sql_statements(sql: &str) -> Vec<String> {
    let clean: Vec<&str> = sql
        .lines()
        .filter(|line| !line.trim_start().starts_with("--"))
        .collect();

    let combined = clean.join("\n");
    combined
        .split(';')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}
