use std::path::PathBuf;
use std::fs;
use tauri::{AppHandle, Manager, Emitter};
use reqwest::Client;
use futures_util::StreamExt;
use std::io::Write;

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
    
    pub fn get_model_path(&self, model_size: &str) -> PathBuf {
        self.models_dir.join(format!("ggml-{}.bin", model_size))
    }
    
    pub fn is_model_cached(&self, model_size: &str) -> bool {
        self.get_model_path(model_size).exists()
    }
    
    pub async fn download_model(&self, model_size: &str, app: &AppHandle) -> Result<PathBuf, String> {
        let path = self.get_model_path(model_size);
        if path.exists() {
            return Ok(path);
        }
        
        println!("Downloading model ggml-{}.bin to {:?}", model_size, path);
        
        // huggingface URL for whisper.cpp models
        let url = format!("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{}.bin", model_size);
        
        let client = Client::new();
        let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
        
        if !response.status().is_success() {
            return Err(format!("Failed to download model: HTTP {}", response.status()));
        }
        
        let total_size = response.content_length().unwrap_or(0);
        let mut downloaded: u64 = 0;
        
        let mut file = fs::File::create(&path).map_err(|e| format!("Failed to create model file: {}", e))?;
        
        let mut stream = response.bytes_stream();
        let mut last_emit = std::time::Instant::now();
        
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Error downloading chunk: {}", e))?;
            file.write_all(&chunk).map_err(|e| format!("Error writing chunk: {}", e))?;
            
            downloaded += chunk.len() as u64;
            
            // Emit progress at most every 100ms to avoid flooding the frontend
            if last_emit.elapsed().as_millis() > 100 || downloaded == total_size {
                let percentage = if total_size > 0 {
                    (downloaded as f64 / total_size as f64) * 100.0
                } else {
                    0.0
                };
                
                let _ = app.emit("model-download-progress", DownloadProgress {
                    model_size: model_size.to_string(),
                    downloaded,
                    total: total_size,
                    percentage,
                });
                last_emit = std::time::Instant::now();
            }
        }
        
        println!("Model downloaded successfully.");
        Ok(path)
    }
}
