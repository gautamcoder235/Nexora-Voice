use serde::{Deserialize, Serialize};
use std::fs::{create_dir_all, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
pub struct AppSettings {
    pub mode: String,
    pub model: String,
    pub model_size: String, // Kept for legacy backward compatibility
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
    pub autostart: bool,
    pub overlay_theme: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            mode: "balanced".to_string(),
            model: "ggml-large-v3-turbo.bin".to_string(),
            model_size: "balanced".to_string(),
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
            whisper_language: "auto".to_string(),
            autostart: false,
            overlay_theme: "dark".to_string(),
        }
    }
}

pub fn get_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app.path().app_config_dir().map_err(|e| e.to_string())?;
    create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path.join("settings.json"))
}

pub fn load_settings(app: &AppHandle) -> AppSettings {
    let settings = if let Ok(path) = get_settings_path(app) {
        if path.exists() {
            if let Ok(mut file) = File::open(&path) {
                let mut contents = String::new();
                if file.read_to_string(&mut contents).is_ok() {
                    if let Ok(mut parsed) = serde_json::from_str::<AppSettings>(&contents) {
                        // Check if we need to migrate
                        let needs_migration = parsed.mode.is_empty() 
                            || parsed.model.is_empty() 
                            || !["fast", "balanced", "lightweight"].contains(&parsed.model_size.as_str());

                        if needs_migration {
                            println!("[Settings] Migrating legacy configuration...");
                            let old_size = if !parsed.model_size.is_empty() {
                                parsed.model_size.clone()
                            } else {
                                "small".to_string()
                            };

                            match old_size.as_str() {
                                "tiny" | "distil-large-v3" | "fast" => {
                                    parsed.mode = "fast".to_string();
                                    parsed.model = "ggml-distil-large-v3.bin".to_string();
                                }
                                "accurate" | "large-v3" | "medium" | "balanced" | "large-v3-turbo" => {
                                    parsed.mode = "balanced".to_string();
                                    parsed.model = "ggml-large-v3-turbo.bin".to_string();
                                }
                                "small" | "base" | "lightweight" => {
                                    parsed.mode = "lightweight".to_string();
                                    parsed.model = "ggml-small.en.bin".to_string();
                                }
                                _ => {
                                    parsed.mode = "balanced".to_string();
                                    parsed.model = "ggml-large-v3-turbo.bin".to_string();
                                }
                            }
                            
                            parsed.model_size = parsed.mode.clone();
                            let _ = save_settings(app, &parsed);
                        } else {
                            parsed.model_size = parsed.mode.clone();
                        }
                        return parsed;
                    }
                }
            }
        }
        AppSettings::default()
    } else {
        AppSettings::default()
    };

    // Save immediately for new configurations or failed parses
    let _ = save_settings(app, &settings);
    settings
}

pub fn save_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = get_settings_path(app)?;
    let mut file = File::create(path).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    file.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}
