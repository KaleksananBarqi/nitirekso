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
    Migration {
        version: 7,
        name: "007_sync_stream_cursors",
        sql: include_str!("../../migrations/007_sync_stream_cursors.sql"),
    },
    Migration {
        version: 8,
        name: "008_sync_vault_foundation",
        sql: include_str!("../../migrations/008_sync_vault_foundation.sql"),
    },
];

/// Namespace tetap untuk menurunkan UUIDv5 deterministik transaksi hasil Exchange Sync.
pub const TRADE_UUID_NAMESPACE: uuid::Uuid =
    uuid::Uuid::from_u128(0x9f2c7b1e_8a44_4d3e_9c12_6e5f4a3b2c1d);

/// Menghasilkan UUIDv5 deterministik dari pasangan (exchange, external_id) agar tidak duplikat lintas perangkat.
pub fn deterministic_trade_uuid(exchange: &str, external_id: &str) -> String {
    let key = format!("{}:{}", exchange.trim().to_lowercase(), external_id.trim());
    uuid::Uuid::new_v5(&TRADE_UUID_NAMESPACE, key.as_bytes()).to_string()
}

/// Menghasilkan UUIDv4 acak untuk entitas manual maupun device_id.
pub fn random_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

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

    backfill_sync_metadata(conn)?;

    Ok(applied_now)
}

/// Mengisi UUID lintas-perangkat untuk trade lama yang belum memiliki `uuid` serta memastikan `device_id` lokal tersedia.
pub fn backfill_sync_metadata(conn: &mut Connection) -> Result<()> {
    // 1. Pastikan device_id lokal tersedia di local_device_meta
    let has_meta_table: bool = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='local_device_meta'",
            [],
            |_| Ok(true),
        )
        .unwrap_or(false);

    if has_meta_table {
        let existing_device_id: Option<String> = conn
            .query_row(
                "SELECT value FROM local_device_meta WHERE key = 'device_id'",
                [],
                |r| r.get(0),
            )
            .ok();

        if existing_device_id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .is_none()
        {
            let dev_id = random_uuid();
            conn.execute(
                "INSERT INTO local_device_meta (key, value) VALUES ('device_id', ?1)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![dev_id],
            )?;
        }
    }

    // 2. Backfill UUID pada trades yang belum memilikinya
    let has_uuid_col: bool = conn
        .query_row(
            "SELECT 1 FROM pragma_table_info('trades') WHERE name = 'uuid'",
            [],
            |_| Ok(true),
        )
        .unwrap_or(false);

    if has_uuid_col {
        let pending: Vec<(i64, String, Option<String>)> = {
            let mut stmt = conn.prepare(
                "SELECT id, exchange, external_id FROM trades WHERE uuid IS NULL OR TRIM(uuid) = ''",
            )?;
            let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?;
            let mut out = Vec::new();
            for r in rows {
                out.push(r?);
            }
            out
        };

        if !pending.is_empty() {
            let tx = conn.transaction()?;
            {
                let mut upd = tx.prepare("UPDATE trades SET uuid = ?1 WHERE id = ?2")?;
                for (id, exchange, external_id) in pending {
                    let generated = match external_id
                        .as_deref()
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                    {
                        Some(ext) => deterministic_trade_uuid(&exchange, ext),
                        None => random_uuid(),
                    };
                    upd.execute(params![generated, id])?;
                }
            }
            tx.commit()?;
        }
    }

    Ok(())
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
