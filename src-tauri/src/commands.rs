use tauri::{AppHandle, State};

use crate::audio::AudioRecorder;
use crate::model_manager::ModelManager;
use crate::whisper_service::WhisperService;
use crate::injector::inject_text;
use crate::settings::{AppSettings, load_settings, save_settings};

#[derive(serde::Serialize, Clone)]
pub struct ModelInfo {
    pub cached: bool,
    pub active: bool,
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> AppSettings {
    load_settings(&app)
}

#[tauri::command]
pub fn update_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    save_settings(&app, &settings)?;
    
    // Reload shortcuts
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
    use std::str::FromStr;
    
    let _ = app.global_shortcut().unregister_all();
    
    if let Ok(s) = Shortcut::from_str(&settings.hotkey) { let _ = app.global_shortcut().register(s); }
    if let Ok(s) = Shortcut::from_str(&settings.cancel_hotkey) { let _ = app.global_shortcut().register(s); }
    if let Ok(s) = Shortcut::from_str(&settings.settings_hotkey) { let _ = app.global_shortcut().register(s); }
    if let Ok(s) = Shortcut::from_str(&settings.format_hotkey) { let _ = app.global_shortcut().register(s); }
    
    Ok(())
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
    whisper: State<'_, WhisperService>
) -> Result<String, String> {
    // 1. Retrieve recorded float samples
    let samples = recorder.inner().stop()?;
    if samples.len() < 1600 {
        return Err("Audio too short".to_string());
    }

    // 2. Load configurations
    let settings = load_settings(&app);

    // 4. Transcribe using native whisper.cpp
    let start_time = std::time::Instant::now();
    let transcription_res = whisper.transcribe(&samples, settings.filter_hallucinations);
    let elapsed_ms = start_time.elapsed().as_millis() as u32;

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
    app: tauri::AppHandle,
    model_manager: State<'_, ModelManager>,
    whisper: State<'_, WhisperService>
) -> Result<(), String> {
    let path = model_manager.download_model(&model_size, &app).await?;
    whisper.load_model(&path, &model_size)?;
    Ok(())
}

#[tauri::command]
pub fn get_models_dir(model_manager: State<'_, ModelManager>) -> String {
    model_manager.get_models_dir().to_string_lossy().to_string()
}

#[tauri::command]
pub async fn get_models_status(
    model_manager: State<'_, ModelManager>,
    whisper: State<'_, WhisperService>
) -> Result<std::collections::HashMap<String, ModelInfo>, String> {
    let allowed_models = vec!["tiny", "base", "small", "medium"];
    let mut status = std::collections::HashMap::new();
    
    let active_model = whisper.active_model.lock().unwrap().clone();
    
    for m in allowed_models {
        status.insert(m.to_string(), ModelInfo {
            cached: model_manager.is_model_cached(m),
            active: m == active_model,
        });
    }
    
    Ok(status)
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
