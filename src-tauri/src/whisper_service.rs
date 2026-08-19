use whisper_rs::{WhisperContext, WhisperContextParameters, FullParams, SamplingStrategy};
use std::sync::{Arc, Mutex};
use std::path::Path;
use std::collections::HashMap;

pub struct WhisperService {
    contexts: Arc<Mutex<HashMap<String, Arc<WhisperContext>>>>,
    pub active_model: Arc<Mutex<String>>,
}

impl WhisperService {
    pub fn new() -> Self {
        println!("[Startup] Registering Vulkan GPU backend...");
        unsafe {
            // Windows static linking workaround: manually force Vulkan backend registration
            extern "C" {
                fn ggml_backend_vk_reg() -> *mut std::ffi::c_void;
                fn ggml_backend_register(reg: *mut std::ffi::c_void);
            }
            let vk_reg = ggml_backend_vk_reg();
            if !vk_reg.is_null() {
                ggml_backend_register(vk_reg);
            }
        }

        Self {
            contexts: Arc::new(Mutex::new(HashMap::new())),
            active_model: Arc::new(Mutex::new(String::new())),
        }
    }

    pub fn load_model(&self, model_path: &Path, size_name: &str) -> Result<(), String> {
        // Check if context is already loaded
        {
            let contexts_lock = self.contexts.lock().unwrap();
            if contexts_lock.contains_key(size_name) {
                let mut model_lock = self.active_model.lock().unwrap();
                *model_lock = size_name.to_string();
                println!("[Startup] Model {} is already cached in memory.", size_name);
                return Ok(());
            }
        }

        // Ensure only one model is loaded in memory by freeing any previously loaded models
        {
            let mut contexts_lock = self.contexts.lock().unwrap();
            if !contexts_lock.is_empty() {
                contexts_lock.clear();
                println!("[Memory Management] Cleared cached model contexts to free memory. Yielding to GPU driver...");
                std::thread::sleep(std::time::Duration::from_millis(600));
            }
        }

        println!("[Startup] Loading Whisper model {}...", size_name);
        let path_str = model_path.to_str().ok_or("Invalid model path")?;

        println!("[Startup] Creating WhisperContext...");
        let ctx_params = WhisperContextParameters::default();
        let ctx = WhisperContext::new_with_params(path_str, ctx_params)
            .map_err(|e| format!("Failed to load whisper model: {}", e))?;
        let ctx_arc = Arc::new(ctx);

        println!("[Startup] Warming up model with dummy inference...");
        // Run a tiny dummy inference (1 second of silent audio: 16000 float samples of 0.0)
        let mut state = ctx_arc.create_state().map_err(|e| format!("Failed to create state for warm-up: {}", e))?;
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_print_progress(false);
        params.set_print_special(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_temperature(0.0);
        params.set_no_context(true);
        params.set_language(Some("en"));
        params.set_detect_language(false);
        params.set_n_threads(1);

        let dummy_audio = vec![0.0f32; 16000];
        let _ = state.full(params, &dummy_audio); // discard result, we just want to execute/warm up

        // Add to map
        let mut contexts_lock = self.contexts.lock().unwrap();
        contexts_lock.insert(size_name.to_string(), ctx_arc);

        let mut model_lock = self.active_model.lock().unwrap();
        *model_lock = size_name.to_string();

        println!("[Startup] Model {} ready.", size_name);
        Ok(())
    }

    pub fn transcribe(&self, samples: &[f32], filter_hallucinations: bool, language: &str) -> Result<String, String> {
        let active_name = self.active_model.lock().unwrap().clone();
        if active_name.is_empty() {
            return Err("No active model loaded".to_string());
        }

        // Get Arc context out of the map lock scope quickly!
        let ctx = {
            let contexts_lock = self.contexts.lock().unwrap();
            contexts_lock.get(&active_name).cloned().ok_or_else(|| {
                format!("Active model {} is not loaded in contexts", active_name)
            })?
        }; // Lock released here!

        println!("[Inference] Creating temporary WhisperState...");
        let mut state = ctx.create_state().map_err(|e| format!("Failed to create state: {}", e))?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_print_progress(false);
        params.set_print_special(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);

        // Speed Optimizations:
        params.set_temperature(0.0);           // Strict deterministic decoding
        params.set_no_context(true);            // Ignore previous context (avoids context contamination/lag)
        
        // Use user-chosen language or fall back to auto-detect
        if language == "auto" || language.is_empty() {
            params.set_language(None);
        } else {
            params.set_language(Some(language));
            params.set_detect_language(false); // skip detection pass
        }

        // Maximize CPU threads for fastest possible transcription
        if let Ok(threads) = std::thread::available_parallelism() {
            let optimal_threads = std::cmp::min(8, std::cmp::max(1, threads.get() as i32 / 2));
            params.set_n_threads(optimal_threads);
        }

        state.full(params, samples).map_err(|e| format!("Failed to transcribe: {}", e))?;

        let num_segments = state.full_n_segments();
        let mut full_text = String::new();

        for i in 0..num_segments {
            if let Some(segment) = state.get_segment(i) {
                if let Ok(text) = segment.to_str() {
                    full_text.push_str(text);
                }
            }
        }

        let trimmed = full_text.trim().to_string();

        // --- Whisper Hallucination Filter ---
        let result_text = if filter_hallucinations {
            let lower = trimmed.to_lowercase();
            if trimmed.contains("♪") || 
               trimmed.contains("[Silence]") || 
               lower.contains("subs by") ||
               lower.contains("amara.org") ||
               (trimmed.len() < 25 && (
                   lower == "thank you." || 
                   lower == "thank you" || 
                   lower == "thanks for watching!" || 
                   lower == "thank you for watching." ||
                   lower == "you"
               )) 
            {
                String::new()
            } else {
                trimmed
            }
        } else {
            trimmed
        };

        println!("[Inference] Destroying WhisperState...");
        Ok(result_text)
    }
}

impl Drop for WhisperService {
    fn drop(&mut self) {
        println!("[Shutdown] Destroying WhisperContexts and releasing GPU resources... (RAII clean)");
    }
}
