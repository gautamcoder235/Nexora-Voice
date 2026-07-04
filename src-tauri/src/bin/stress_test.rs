use std::path::PathBuf;
use tauri_app_lib::whisper_service::WhisperService;
// ModelManager requires AppHandle which we don't have in a standalone bin, 
// so we'll just download the model directly in the test.

#[tokio::main]
async fn main() {
    println!("--- NEXORA WHISPER.CPP STRESS TEST ---");
    
    // Fallback to local models dir
    let models_dir = PathBuf::from("models");
    if !models_dir.exists() {
        std::fs::create_dir_all(&models_dir).unwrap();
    }
    
    let model_size = "tiny";
    let model_path = models_dir.join(format!("ggml-{}.bin", model_size));
    
    // Download if doesn't exist
    if !model_path.exists() {
        println!("Downloading {} model for stress test...", model_size);
        let url = format!("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{}.bin", model_size);
        let response = reqwest::get(&url).await.unwrap().bytes().await.unwrap();
        std::fs::write(&model_path, response).unwrap();
        println!("Download complete.");
    }

    let service = WhisperService::new();
    println!("Loading model...");
    service.load_model(&model_path, model_size).unwrap();
    
    println!("Model loaded successfully!");
    
    // Generate 30 seconds of 16kHz audio (sine wave)
    println!("Generating 30s of synthetic audio...");
    let sample_rate = 16000;
    let duration = 30; // seconds
    let total_samples = sample_rate * duration;
    
    let mut audio_data = Vec::with_capacity(total_samples);
    for i in 0..total_samples {
        let t = i as f32 / sample_rate as f32;
        let sample = (t * 440.0 * 2.0 * std::f32::consts::PI).sin() * 0.5; // 440Hz tone
        audio_data.push(sample);
    }
    
    println!("Starting stress test: 10 consecutive transcriptions of 30s audio...");
    
    let total_start = std::time::Instant::now();
    for i in 1..=10 {
        let start = std::time::Instant::now();
        
        let result: Result<String, String> = service.transcribe(&audio_data);
        
        let elapsed = start.elapsed();
        match result {
            Ok(text) => {
                let text_len = text.len();
                println!("Iteration {}: SUCCESS in {:.2?} (Output: {} characters)", i, elapsed, text_len);
            }
            Err(e) => {
                println!("Iteration {}: FAILED in {:.2?}: {}", i, elapsed, e);
            }
        }
    }
    
    println!("--------------------------------------");
    println!("Stress test completed in {:.2?}", total_start.elapsed());
}
