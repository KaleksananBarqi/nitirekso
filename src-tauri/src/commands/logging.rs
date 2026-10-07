use crate::logging::{clear_logs as log_clear, open_log_folder as log_open, read_logs, LogEntry};
use crate::models::MutationResult;

#[tauri::command]
pub fn get_logs(limit: Option<usize>) -> MutationResult<Vec<LogEntry>> {
    MutationResult::success(read_logs(limit))
}

#[tauri::command]
pub fn clear_logs() -> MutationResult<()> {
    match log_clear() {
        Ok(_) => MutationResult::ok_unit(),
        Err(e) => MutationResult::fail(e),
    }
}

#[tauri::command]
pub fn open_log_folder() -> MutationResult<()> {
    match log_open() {
        Ok(_) => MutationResult::ok_unit(),
        Err(e) => MutationResult::fail(e),
    }
}

#[tauri::command]
pub fn write_log(level: String, message: String, details: Option<String>) {
    let full_msg = match details {
        Some(d) if !d.is_empty() => format!("{} | details: {}", message, d),
        _ => message,
    };
    crate::logging::append_log(&level, &format!("[Renderer] {}", full_msg));
}

