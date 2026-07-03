use reqwest::Client;
use serde::Deserialize;
use std::path::Path;

#[derive(Deserialize, Debug)]
pub struct TranscribeResponse {
    pub text: String,
}

#[derive(serde::Deserialize, serde::Serialize, Debug, Clone)]
pub struct ModelInfo {
    pub cached: bool,
    pub active: bool,
}

#[derive(serde::Serialize)]
struct SelectModelPayload {
    model_size: String,
}

pub struct WhisperClient {
    client: Client,
    base_url: String,
}

impl WhisperClient {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            base_url: "http://127.0.0.1:8000".to_string(),
        }
    }

    pub async fn transcribe(&self, file_path: &Path) -> Result<String, String> {
        let url = format!("{}/api/transcribe", self.base_url);
        
        // Open file bytes
        let file_bytes = std::fs::read(file_path)
            .map_err(|e| format!("Failed to read temporary WAV file: {}", e))?;
            
        let file_part = reqwest::multipart::Part::bytes(file_bytes)
            .file_name("audio.wav")
            .mime_str("audio/wav")
            .map_err(|e| e.to_string())?;

        let form = reqwest::multipart::Form::new()
            .part("file", file_part);

        let response = self.client.post(&url)
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("Failed to send transcription request: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Server returned error ({}): {}", status, body));
        }

        let resp_data = response.json::<TranscribeResponse>()
            .await
            .map_err(|e| format!("Failed to parse transcription response: {}", e))?;

        Ok(resp_data.text)
    }

    pub async fn transcribe_chunk(&self, file_path: &Path, chunk_index: usize) -> Result<String, String> {
        let url = format!("{}/api/transcribe_chunk", self.base_url);
        
        let file_bytes = std::fs::read(file_path)
            .map_err(|e| format!("Failed to read temporary chunk WAV: {}", e))?;
            
        let file_part = reqwest::multipart::Part::bytes(file_bytes)
            .file_name("audio_chunk.wav")
            .mime_str("audio/wav")
            .map_err(|e| e.to_string())?;

        let form = reqwest::multipart::Form::new()
            .part("file", file_part)
            .text("chunk_index", chunk_index.to_string());

        let response = self.client.post(&url)
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("Failed to send chunk transcription request: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Chunk transcription server error ({}): {}", status, body));
        }

        #[derive(Deserialize)]
        struct ChunkResponse {
            text: String,
        }

        let resp_data = response.json::<ChunkResponse>()
            .await
            .map_err(|e| format!("Failed to parse chunk transcription response: {}", e))?;

        Ok(resp_data.text)
    }

    pub async fn select_model(&self, model_size: &str) -> Result<(), String> {
        let url = format!("{}/api/select_model", self.base_url);
        
        let payload = SelectModelPayload {
            model_size: model_size.to_string(),
        };

        let response = self.client.post(&url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Failed to send select model request: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Failed to switch model ({}): {}", status, body));
        }

        Ok(())
    }

    pub async fn get_models_status(&self) -> Result<std::collections::HashMap<String, ModelInfo>, String> {
        let url = format!("{}/api/models_status", self.base_url);
        let response = self.client.get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch models status: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Server returned error: {}", response.status()));
        }

        let status = response.json::<std::collections::HashMap<String, ModelInfo>>()
            .await
            .map_err(|e| format!("Failed to parse models status: {}", e))?;

        Ok(status)
    }
}
