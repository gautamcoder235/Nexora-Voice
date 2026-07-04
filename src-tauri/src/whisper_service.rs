use whisper_rs::{WhisperContext, WhisperContextParameters, FullParams, SamplingStrategy};
use std::sync::{Arc, Mutex};
use std::path::Path;

pub struct WhisperService {
    context: Arc<Mutex<Option<WhisperContext>>>,
    pub active_model: Arc<Mutex<String>>,
}

impl WhisperService {
    pub fn new() -> Self {
        Self {
            context: Arc::new(Mutex::new(None)),
            active_model: Arc::new(Mutex::new(String::new())),
        }
    }

    pub fn load_model(&self, model_path: &Path, size_name: &str) -> Result<(), String> {
        let path_str = model_path.to_str().ok_or("Invalid model path")?;
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

        let ctx_params = WhisperContextParameters::default();
        
        let ctx = WhisperContext::new_with_params(path_str, ctx_params)
            .map_err(|e| format!("Failed to load whisper model: {}", e))?;
            
        let mut context_lock = self.context.lock().unwrap();
        *context_lock = Some(ctx);
        
        let mut model_lock = self.active_model.lock().unwrap();
        *model_lock = size_name.to_string();
        
        println!("Loaded whisper model {}", size_name);
        Ok(())
    }

    pub fn transcribe(&self, samples: &[f32], filter_hallucinations: bool, language: &str) -> Result<String, String> {
        let context_lock = self.context.lock().unwrap();
        
        let ctx = context_lock.as_ref().ok_or("No model loaded")?;
        
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
            // auto-detect: whisper will run its language detection pass
        } else {
            params.set_language(Some(language));
            params.set_detect_language(false); // skip detection pass — language is already known
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
        if filter_hallucinations {
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
                return Ok(String::new()); // Drop the hallucinated junk
            }
        }
        
        Ok(trimmed)
    }
}
