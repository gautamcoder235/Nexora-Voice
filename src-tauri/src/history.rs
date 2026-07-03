use serde::{Deserialize, Serialize};
use std::fs::{create_dir_all, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;
use tauri::Emitter;
use chrono::Local;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
pub struct HistoryEntry {
    pub id: String,
    pub timestamp: String,
    pub text: String,
    pub elapsed_ms: u32,
    pub mode: String, // "Standard" or "Streaming"
    pub audio_duration_ms: u32,
}

impl Default for HistoryEntry {
    fn default() -> Self {
        Self {
            id: "".to_string(),
            timestamp: "".to_string(),
            text: "".to_string(),
            elapsed_ms: 0,
            mode: "Standard".to_string(),
            audio_duration_ms: 0,
        }
    }
}

pub fn get_history_path(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app.path().app_config_dir().map_err(|e| e.to_string())?;
    create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path.join("history.json"))
}

pub fn load_history(app: &AppHandle) -> Vec<HistoryEntry> {
    if let Ok(path) = get_history_path(app) {
        if path.exists() {
            if let Ok(mut file) = File::open(path) {
                let mut contents = String::new();
                if file.read_to_string(&mut contents).is_ok() {
                    if let Ok(history) = serde_json::from_str::<Vec<HistoryEntry>>(&contents) {
                        return history;
                    }
                }
            }
        }
    }
    Vec::new()
}

pub fn save_history(app: &AppHandle, history: &[HistoryEntry]) -> Result<(), String> {
    let path = get_history_path(app)?;
    let mut file = File::create(path).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(history).map_err(|e| e.to_string())?;
    file.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn add_history_entry(app: &AppHandle, text: &str, elapsed_ms: u32, audio_duration_ms: u32, mode: &str) {
    if text.trim().is_empty() {
        return;
    }
    let mut history = load_history(app);
    let entry = HistoryEntry {
        id: uuid::Uuid::new_v4().to_string(),
        timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        text: text.trim().to_string(),
        elapsed_ms,
        mode: mode.to_string(),
        audio_duration_ms,
    };
    // Keep last 100 items to prevent history.json from bloating
    history.insert(0, entry);
    if history.len() > 100 {
        history.truncate(100);
    }
    let _ = save_history(app, &history);
    
    // Emit event to frontend that history has updated
    let _ = app.emit("history-updated", history);
}
