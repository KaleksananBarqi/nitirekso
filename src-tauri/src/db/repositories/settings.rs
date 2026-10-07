use rusqlite::{params, Connection, Result};
use serde_json::Value;

pub fn get_all_settings(conn: &Connection) -> Result<serde_json::Map<String, Value>> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let rows = stmt.query_map([], |row| {
        let key: String = row.get(0)?;
        let val_str: String = row.get(1)?;
        Ok((key, val_str))
    })?;

    let mut map = serde_json::Map::new();
    for r in rows {
        if let Ok((k, v_str)) = r {
            if let Ok(json_val) = serde_json::from_str(&v_str) {
                map.insert(k, json_val);
            }
        }
    }
    Ok(map)
}

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<Value>> {
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?")?;
    let mut rows = stmt.query(params![key])?;
    if let Some(row) = rows.next()? {
        let val_str: String = row.get(0)?;
        if let Ok(json_val) = serde_json::from_str(&val_str) {
            return Ok(Some(json_val));
        }
    }
    Ok(None)
}

pub fn set_setting(conn: &Connection, key: &str, value: &Value) -> Result<()> {
    let val_str = serde_json::to_string(value).unwrap_or_else(|_| "null".to_string());
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, val_str],
    )?;
    Ok(())
}

pub fn set_settings(conn: &Connection, payload: &Value) -> Result<()> {
    if let Some(obj) = payload.as_object() {
        for (k, v) in obj {
            set_setting(conn, k, v)?;
        }
    }
    Ok(())
}
