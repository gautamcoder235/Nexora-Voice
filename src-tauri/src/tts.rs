use serde::{Deserialize, Serialize};
use std::fs::{create_dir_all, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;
use chrono::Local;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TtsLog {
    pub id: String,
    pub timestamp: String,
    pub text: String,
    pub voice: String,
    pub speed: f32,
    pub pitch: f32,
    pub file_path: String,
    pub char_count: u32,
}

pub fn get_tts_history_path(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app.path().app_config_dir().map_err(|e| e.to_string())?;
    create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path.join("tts_history.json"))
}

pub fn load_tts_history(app: &AppHandle) -> Vec<TtsLog> {
    if let Ok(path) = get_tts_history_path(app) {
        if path.exists() {
            if let Ok(mut file) = File::open(path) {
                let mut contents = String::new();
                if file.read_to_string(&mut contents).is_ok() {
                    if let Ok(history) = serde_json::from_str::<Vec<TtsLog>>(&contents) {
                        return history;
                    }
                }
            }
        }
    }
    Vec::new()
}

pub fn save_tts_history(app: &AppHandle, history: &[TtsLog]) -> Result<(), String> {
    let path = get_tts_history_path(app)?;
    let mut file = File::create(path).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(history).map_err(|e| e.to_string())?;
    file.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Deserialize)]
pub struct GenerateTtsPayload {
    pub text: String,
    pub voice: String,
    pub speed: f32,
    pub pitch: f32,
}

#[tauri::command]
pub async fn generate_tts_audio(app: AppHandle, payload: GenerateTtsPayload) -> Result<TtsLog, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let cache_dir = app_dir.join("tts_cache");
    if !cache_dir.exists() {
        std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }

    let log_id = Uuid::new_v4().to_string();
    let filename = format!("{}.mp3", log_id);
    let audio_file_path = cache_dir.join(&filename);

    let api_key = std::env::var("OPENAI_API_KEY").map_err(|_| "OPENAI_API_KEY env variable not set".to_string())?;
    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "model": "tts-1",
        "input": payload.text,
        "voice": payload.voice.to_lowercase(),
        "speed": payload.speed
    });

    let res = client.post("https://api.openai.com/v1/audio/speech")
        .bearer_auth(&api_key)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("API request failed: {}", e))?;

    if !res.status().is_success() {
        let err_body = res.text().await.unwrap_or_default();
        return Err(format!("API Error: {}", err_body));
    }

    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    let mut file = File::create(&audio_file_path).map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;

    let path_str = audio_file_path.to_string_lossy().to_string();
    let char_count = payload.text.len() as u32;

    let log_entry = TtsLog {
        id: log_id,
        timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        text: payload.text,
        voice: payload.voice,
        speed: payload.speed,
        pitch: payload.pitch,
        file_path: path_str,
        char_count,
    };

    let mut history = load_tts_history(&app);
    history.insert(0, log_entry.clone());
    if history.len() > 100 {
        history.truncate(100);
    }
    let _ = save_tts_history(&app, &history);

    // Notify frontend of history updates
    let _ = app.emit("tts-history-updated", history);

    Ok(log_entry)
}

#[tauri::command]
pub fn get_tts_history(app: AppHandle) -> Vec<TtsLog> {
    load_tts_history(&app)
}

#[tauri::command]
pub fn clear_tts_history(app: AppHandle) -> Result<(), String> {
    save_tts_history(&app, &Vec::new())
}
