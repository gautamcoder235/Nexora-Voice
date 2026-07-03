use tauri::{AppHandle, State, Manager};
use uuid::Uuid;

use crate::audio::{AudioRecorder, save_wav_file};
use crate::client::{WhisperClient, ModelInfo};
use crate::injector::inject_text;
use crate::settings::{AppSettings, load_settings, save_settings};

#[tauri::command]
pub fn get_settings(app: AppHandle) -> AppSettings {
    load_settings(&app)
}

#[tauri::command]
pub fn update_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    save_settings(&app, &settings)
}

#[tauri::command]
pub async fn start_recording(
    app: AppHandle,
    recorder: State<'_, AudioRecorder>
) -> Result<(), String> {
    recorder.inner().start(app)
}

#[tauri::command]
pub async fn stop_recording(
    app: AppHandle,
    recorder: State<'_, AudioRecorder>,
    client: State<'_, WhisperClient>
) -> Result<String, String> {
    // 1. Retrieve recorded float samples
    let samples = recorder.inner().stop()?;
    if samples.len() < 1600 {
        return Err("Audio too short".to_string());
    }

    // 2. Load configurations
    let settings = load_settings(&app);

    // 3. Save to a temporary WAV file in app data directory
    let temp_dir = app.path().app_data_dir().map_err(|e: tauri::Error| e.to_string())?;
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    
    let file_id = Uuid::new_v4().to_string();
    let file_path = temp_dir.join(format!("{}.wav", file_id));

    // Save wav file
    save_wav_file(&samples, &file_path)?;

    // 4. Send request to FastAPI backend
    let start_time = std::time::Instant::now();
    let transcription_res = client.transcribe(&file_path).await;
    let elapsed_ms = start_time.elapsed().as_millis() as u32;

    // Delete temp WAV file
    if file_path.exists() {
        let _ = std::fs::remove_file(&file_path);
    }

    // Handle transcription output
    let raw_text = transcription_res?;
    
    // 5. Apply Case Formatting Modifiers
    let formatted_text = format_text(&raw_text, &settings.format_mode);

    // 6. Inject/Type text at focused cursor
    if !formatted_text.is_empty() {
        inject_text(&formatted_text, &settings.injection_method)?;
        let audio_duration_ms = (samples.len() as f32 / 16.0) as u32;
        crate::history::add_history_entry(&app, &formatted_text, elapsed_ms, audio_duration_ms, "Standard");
    }

    Ok(formatted_text)
}

#[tauri::command]
pub async fn switch_backend_model(
    model_size: String,
    client: State<'_, WhisperClient>
) -> Result<(), String> {
    client.select_model(&model_size).await
}

#[tauri::command]
pub async fn get_models_status(
    client: State<'_, WhisperClient>
) -> Result<std::collections::HashMap<String, ModelInfo>, String> {
    client.get_models_status().await
}

#[tauri::command]
pub fn list_microphones() -> Result<Vec<String>, String> {
    use cpal::traits::{HostTrait, DeviceTrait};
    let host = cpal::default_host();
    let devices = host.input_devices()
        .map_err(|e| format!("Failed to enumerate input devices: {}", e))?;
    let names: Vec<String> = devices
        .filter_map(|d| d.name().ok())
        .collect();
    Ok(names)
}

// Text formatters helper
pub fn format_text(text: &str, mode: &str) -> String {
    if text.is_empty() {
        return String::new();
    }
    
    let text_lower = text.to_lowercase().trim_matches(|c: char| c.is_ascii_punctuation() || c.is_whitespace()).to_string();
    let words: Vec<&str> = text_lower.split_whitespace().collect();

    // 1. Spoken Shorthand Prefix Detections
    if words.len() > 2 {
        if words[0] == "camel" && words[1] == "case" {
            return to_camel_case(&words[2..].join(" "));
        }
        if words[0] == "snake" && words[1] == "case" {
            return to_snake_case(&words[2..].join(" "));
        }
        if words[0] == "pascal" && words[1] == "case" {
            return to_pascal_case(&words[2..].join(" "));
        }
        if words[0] == "upper" && words[1] == "case" {
            return words[2..].join(" ").to_uppercase();
        }
    }

    // 2. Configured Mode Formatting
    match mode {
        "camel" => to_camel_case(&text_lower),
        "snake" => to_snake_case(&text_lower),
        "pascal" => to_pascal_case(&text_lower),
        "upper" => text.to_uppercase(),
        _ => text.to_string(),
    }
}

fn to_camel_case(text: &str) -> String {
    let words: Vec<&str> = text.split_whitespace().collect();
    if words.is_empty() {
        return String::new();
    }
    let mut camel = words[0].to_string();
    for word in &words[1..] {
        let mut chars = word.chars();
        if let Some(first) = chars.next() {
            camel.push_str(&first.to_uppercase().to_string());
            camel.push_str(&chars.collect::<String>());
        }
    }
    camel
}

fn to_snake_case(text: &str) -> String {
    text.split_whitespace().collect::<Vec<&str>>().join("_")
}

fn to_pascal_case(text: &str) -> String {
    text.split_whitespace()
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                None => String::new(),
                Some(first) => first.to_uppercase().collect::<String>() + &chars.collect::<String>(),
            }
        })
        .collect()
}

#[tauri::command]
pub fn get_history(app: AppHandle) -> Vec<crate::history::HistoryEntry> {
    crate::history::load_history(&app)
}

#[tauri::command]
pub fn clear_history(app: AppHandle) -> Result<(), String> {
    crate::history::save_history(&app, &Vec::new())
}
