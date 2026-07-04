use serde::{Deserialize, Serialize};
use std::fs::{create_dir_all, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
pub struct AppSettings {
    pub model_size: String,
    pub format_mode: String,
    pub hotkey: String,
    pub cancel_hotkey: String,
    pub settings_hotkey: String,
    pub format_hotkey: String,
    pub injection_method: String,
    pub custom_instructions: String,
    pub streaming_mode: bool,
    pub filter_hallucinations: bool,
    pub mic_device: String,
    pub whisper_language: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            model_size: "small".to_string(),
            format_mode: "none".to_string(),
            hotkey: "Control+Alt+V".to_string(), // Default hotkey
            cancel_hotkey: "Escape".to_string(),
            settings_hotkey: "Ctrl+,".to_string(),
            format_hotkey: "Control+Alt+C".to_string(),
            injection_method: "paste".to_string(),
            custom_instructions: "".to_string(),
            streaming_mode: false,
            filter_hallucinations: true,
            mic_device: "Default".to_string(),
            whisper_language: "en".to_string(),
        }
    }
}

pub fn get_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app.path().app_config_dir().map_err(|e| e.to_string())?;
    create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path.join("settings.json"))
}

pub fn load_settings(app: &AppHandle) -> AppSettings {
    if let Ok(path) = get_settings_path(app) {
        if path.exists() {
            if let Ok(mut file) = File::open(path) {
                let mut contents = String::new();
                if file.read_to_string(&mut contents).is_ok() {
                    if let Ok(settings) = serde_json::from_str::<AppSettings>(&contents) {
                        return settings;
                    }
                }
            }
        }
    }
    AppSettings::default()
}

pub fn save_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = get_settings_path(app)?;
    let mut file = File::create(path).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    file.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}
