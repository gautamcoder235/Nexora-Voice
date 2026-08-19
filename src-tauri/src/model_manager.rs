use std::path::PathBuf;
use std::fs;
use tauri::{AppHandle, Manager, Emitter};
use reqwest::Client;
use futures_util::StreamExt;
use std::io::Write;

pub struct ModelRegistryEntry {
    pub key: &'static str,
    pub file_name: &'static str,
    pub url: &'static str,
}

pub static MODEL_REGISTRY: &[ModelRegistryEntry] = &[
    ModelRegistryEntry {
        key: "fast",
        file_name: "ggml-distil-large-v3.bin",
        url: "https://huggingface.co/distil-whisper/distil-large-v3-ggml/resolve/main/ggml-distil-large-v3.bin",
    },
    ModelRegistryEntry {
        key: "balanced",
        file_name: "ggml-large-v3-turbo.bin",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin",
    },
    ModelRegistryEntry {
        key: "lightweight",
        file_name: "ggml-small.en.bin",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin",
    },
];

pub fn get_model_entry(key: &str) -> Option<&'static ModelRegistryEntry> {
    MODEL_REGISTRY.iter().find(|entry| entry.key == key)
}

#[derive(Clone)]
pub struct ModelManager {
    models_dir: PathBuf,
}

#[derive(Clone, serde::Serialize)]
pub struct DownloadProgress {
    pub model_size: String,
    pub downloaded: u64,
    pub total: u64,
    pub percentage: f64,
}

impl ModelManager {
    pub fn new(app: &AppHandle) -> Self {
        let app_data = match app.path().app_data_dir() {
            Ok(p) => p,
            Err(_) => {
                println!("Failed to get app_data_dir, falling back to local models folder.");
                PathBuf::from(".")
            }
        };
        
        let models_dir = app_data.join("models");
        
        if !models_dir.exists() {
            let _ = fs::create_dir_all(&models_dir);
        }
        
        Self { models_dir }
    }
    
    pub fn get_models_dir(&self) -> PathBuf {
        self.models_dir.clone()
    }
    
    pub fn get_model_path(&self, model_key: &str) -> PathBuf {
        if let Some(entry) = get_model_entry(model_key) {
            self.models_dir.join(entry.file_name)
        } else {
            // Backward-compatible fallback
            self.models_dir.join(format!("ggml-{}.bin", model_key))
        }
    }
    
    pub fn is_model_cached(&self, model_key: &str) -> bool {
        self.get_model_path(model_key).exists()
    }
    
    pub async fn download_model(&self, model_key: &str, app: &AppHandle) -> Result<PathBuf, String> {
        let entry = get_model_entry(model_key)
            .ok_or_else(|| format!("Unknown model key: {}", model_key))?;

        let path = self.get_model_path(model_key);
        if path.exists() {
            // Delete zero-byte or corrupt tiny files
            if let Ok(metadata) = fs::metadata(&path) {
                if metadata.len() > 1000000 {
                    return Ok(path);
                } else {
                    let _ = fs::remove_file(&path);
                }
            } else {
                let _ = fs::remove_file(&path);
            }
        }
        
        let tmp_path = path.with_extension("bin.tmp");
        if tmp_path.exists() {
            let _ = fs::remove_file(&tmp_path);
        }
        
        println!("Downloading model {} to {:?}", entry.file_name, tmp_path);
        let url = entry.url.to_string();
        
        let client = Client::new();
        let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
        
        if !response.status().is_success() {
            return Err(format!("Failed to download model: HTTP {}", response.status()));
        }
        
        let total_size = response.content_length().unwrap_or(0);
        let mut downloaded: u64 = 0;
        
        let mut file = fs::File::create(&tmp_path).map_err(|e| format!("Failed to create temp model file: {}", e))?;
        let mut stream = response.bytes_stream();
        let mut last_emit = std::time::Instant::now();
        
        while let Some(chunk) = stream.next().await {
            let chunk = match chunk {
                Ok(c) => c,
                Err(e) => {
                    let _ = fs::remove_file(&tmp_path);
                    return Err(format!("Error downloading chunk: {}", e));
                }
            };
            if let Err(e) = file.write_all(&chunk) {
                let _ = fs::remove_file(&tmp_path);
                return Err(format!("Error writing chunk: {}", e));
            }
            
            downloaded += chunk.len() as u64;
            
            // Emit progress at most every 100ms to avoid flooding the frontend
            if last_emit.elapsed().as_millis() > 100 || downloaded == total_size {
                let percentage = if total_size > 0 {
                    (downloaded as f64 / total_size as f64) * 100.0
                } else {
                    0.0
                };
                
                let _ = app.emit("model-download-progress", DownloadProgress {
                    model_size: model_key.to_string(),
                    downloaded,
                    total: total_size,
                    percentage,
                });
                last_emit = std::time::Instant::now();
            }
        }
        
        // Rename temp file to final destination
        fs::rename(&tmp_path, &path).map_err(|e| {
            let _ = fs::remove_file(&tmp_path);
            format!("Failed to rename downloaded model: {}", e)
        })?;
        
        println!("Model downloaded and verified successfully.");
        Ok(path)
    }
}
