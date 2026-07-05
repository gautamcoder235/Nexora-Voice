mod audio;
mod chunked_recorder;
mod commands;
mod history;
mod injector;
mod settings;
pub mod whisper_service;
pub mod model_manager;

use tauri::{Manager, Emitter, Listener};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};

// Global lock to prevent rapid shortcut presses from overlapping transcription sessions
static TRANSCRIBING_LOCK: AtomicBool = AtomicBool::new(false);

use audio::AudioRecorder;
use chunked_recorder::ChunkedRecorder;
use settings::load_settings;
use whisper_service::WhisperService;
use model_manager::ModelManager;

fn setup_global_shortcut(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle();
    let settings = load_settings(app_handle);
    
    // Register all active shortcuts
    if let Ok(shortcut) = Shortcut::from_str(&settings.hotkey) {
        let _ = app.global_shortcut().register(shortcut);
    }
    if let Ok(shortcut) = Shortcut::from_str(&settings.cancel_hotkey) {
        let _ = app.global_shortcut().register(shortcut);
    }
    if let Ok(shortcut) = Shortcut::from_str(&settings.settings_hotkey) {
        let _ = app.global_shortcut().register(shortcut);
    }
    if let Ok(shortcut) = Shortcut::from_str(&settings.format_hotkey) {
        let _ = app.global_shortcut().register(shortcut);
    }
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    {
        std::env::set_var("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", "00FFFFFF");
        std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--disable-features=CalculateNativeWinOcclusion");
    }

    tauri::Builder::default()
        // Register tauri 2.0 plugins
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, shortcut, event| {
                if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                    let settings = crate::settings::load_settings(app);
                    if let Ok(s) = Shortcut::from_str(&settings.hotkey) { if shortcut == &s { let _ = app.emit("global-shortcut-triggered", "toggle_dictation"); return; } }
                    if let Ok(s) = Shortcut::from_str(&settings.cancel_hotkey) { if shortcut == &s { let _ = app.emit("global-shortcut-triggered", "cancel"); return; } }
                    if let Ok(s) = Shortcut::from_str(&settings.settings_hotkey) { if shortcut == &s { let _ = app.emit("global-shortcut-triggered", "settings"); return; } }
                    if let Ok(s) = Shortcut::from_str(&settings.format_hotkey) { if shortcut == &s { let _ = app.emit("global-shortcut-triggered", "format"); return; } }
                }
            })
            .build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        
        .setup(|app| {
            // Setup Settings & Main Window
            let app_handle = app.handle().clone();

            // Register services
            let model_manager = ModelManager::new(&app_handle);
            app.manage(model_manager.clone());
            
            let whisper_service = WhisperService::new();
            app.manage(whisper_service);
            
            app.manage(AudioRecorder::new());
            app.manage(ChunkedRecorder::new());
            
            // Load the user's configured model on startup if cached
            let settings = crate::settings::load_settings(&app_handle);
            let initial_model = settings.model_size;
            let whisper = app.state::<WhisperService>();
            if model_manager.is_model_cached(&initial_model) {
                let path = model_manager.get_model_path(&initial_model);
                let _ = whisper.load_model(&path, &initial_model);
            }

            // Create System Tray Menu
            let tray_menu = Menu::with_items(&app_handle, &[
                &MenuItem::with_id(&app_handle, "open", "Open Nexora Voice", true, None::<&str>)?,
                &MenuItem::with_id(&app_handle, "settings", "Show Settings", true, None::<&str>)?,
                &MenuItem::with_id(&app_handle, "separator1", "─────────────────", false, None::<&str>)?,
                &MenuItem::with_id(&app_handle, "fmt_plain", "Format: Plain text", true, None::<&str>)?,
                &MenuItem::with_id(&app_handle, "fmt_camel", "Format: camelCase", true, None::<&str>)?,
                &MenuItem::with_id(&app_handle, "fmt_snake", "Format: snake_case", true, None::<&str>)?,
                &MenuItem::with_id(&app_handle, "quit", "Quit Nexora Voice", true, None::<&str>)?,
            ])?;

            // Create Tray Icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .on_menu_event(move |app_h, event| {
                    match event.id.as_ref() {
                        "open" => {
                            if let Some(win) = app_h.get_webview_window("main") {
                                let _ = win.unminimize();
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                        "settings" => {
                            if let Some(win) = app_h.get_webview_window("main") {
                                let _ = win.unminimize();
                                let _ = win.show();
                                let _ = win.set_focus();
                                let _ = win.emit("open-settings", ());
                            }
                        }
                        "fmt_plain" | "fmt_camel" | "fmt_snake" => {
                            let new_mode = match event.id.as_ref() {
                                "fmt_plain" => "plain",
                                "fmt_camel" => "camelCase",
                                "fmt_snake" => "snake_case",
                                _ => "plain",
                            };
                            let mut s = crate::settings::load_settings(&app_h);
                            s.format_mode = new_mode.to_string();
                            let _ = crate::settings::save_settings(&app_h, &s);
                            let _ = app_h.emit("settings-changed", &s.format_mode);
                        }
                        "quit" => {
                            app_h.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray_icon, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                        let app_h = tray_icon.app_handle();
                        if let Some(win) = app_h.get_webview_window("main") {
                            let _ = win.unminimize();
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Setup Transparent Overlay Window (Recording Visualizer)
            // Overlay window needs to be invisible at startup
            if let Some(overlay) = app.get_webview_window("overlay") {
                let _ = overlay.hide();
                
            }

            // Register Hotkeys
            if let Err(e) = setup_global_shortcut(app) {
                eprintln!("Failed to register global shortcut: {}", e);
            }
            
            // If the application was started minimized (launched at boot), hide the main window immediately
            let args: Vec<String> = std::env::args().collect();
            if args.contains(&"--minimized".to_string()) {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.hide();
                }
            }
            
            // Global Shortcut Listener
            let app_h2 = app.handle().clone();
            app.listen("global-shortcut-triggered", move |event| {
                let action = event.payload().to_string();
                let app_h = app_h2.clone();
                tauri::async_runtime::spawn(async move {
                    let settings = load_settings(&app_h);
                    
                    if action.contains("settings") {
                        if let Some(win) = app_h.get_webview_window("main") {
                            let _ = win.unminimize();
                            let _ = win.show();
                            let _ = win.set_focus();
                            let _ = win.emit("open-settings", ());
                        }
                        return;
                    }
                    
                    if action.contains("cancel") {
                        let is_recording_chunked = app_h.state::<ChunkedRecorder>().is_recording();
                        let is_recording_std = {
                            let r = app_h.state::<AudioRecorder>();
                            r.inner().state.lock().unwrap().is_recording
                        };
                        
                        if is_recording_chunked {
                            let _ = app_h.state::<ChunkedRecorder>().stop();
                        }
                        if is_recording_std {
                            let r = app_h.state::<AudioRecorder>();
                            let _ = r.inner().stop();
                        }
                        if let Some(overlay) = app_h.get_webview_window("overlay") {
                            let _ = overlay.hide();
                        }
                        TRANSCRIBING_LOCK.store(false, Ordering::SeqCst);
                        return;
                    }
                    
                    if action.contains("format") {
                        // Just emit to frontend to change format cycle
                        if let Some(win) = app_h.get_webview_window("main") {
                            let _ = win.emit("cycle-format-mode", ());
                        }
                        return;
                    }
                    
                    // toggle_dictation logic
                    
                    if settings.streaming_mode {
                        let is_recording = app_h.state::<ChunkedRecorder>().is_recording();
                        
                        // If not currently recording, check the transcription lock
                        // to prevent starting a new session while previous one is still processing
                        if !is_recording && TRANSCRIBING_LOCK.load(Ordering::SeqCst) {
                            println!("Ignoring shortcut: transcription still in progress");
                            return;
                        }

                        if !is_recording {
                            // Start chunked recording
                            if let Some(overlay) = app_h.get_webview_window("overlay") {
                                let _ = overlay.emit("status-change", "Listening...");
                                let _ = overlay.show();
                            }
                            if let Err(e) = app_h.state::<ChunkedRecorder>().start(app_h.clone()) {
                                eprintln!("Failed to start chunked recorder: {}", e);
                                return;
                            }

                            // Spawn background timer to drain chunks every 5s
                            let app_h_loop = app_h.clone();
                            let loop_lang = settings.whisper_language.clone();
                            let loop_filter = settings.filter_hallucinations;
                            tauri::async_runtime::spawn(async move {
                                loop {
                                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                                    if !app_h_loop.state::<ChunkedRecorder>().is_recording() {
                                        break;
                                    }

                                    if let Some((chunk_samples, idx)) = app_h_loop.state::<ChunkedRecorder>().drain_chunk() {
                                        let app_h_api = app_h_loop.clone();
                                        let lang = loop_lang.clone();

                                        tauri::async_runtime::spawn(async move {
                                            let whisper = app_h_api.state::<WhisperService>();
                                            let chunked_recorder_api = app_h_api.state::<ChunkedRecorder>();
                                            
                                            // Process directly from RAM!
                                            match whisper.transcribe(&chunk_samples, loop_filter, &lang) {
                                                Ok(text) => {
                                                    if !text.is_empty() {
                                                        chunked_recorder_api.add_partial(idx, text);
                                                    }
                                                }
                                                Err(e) => {
                                                    eprintln!("Failed to transcribe chunk {}: {}", idx, e);
                                                }
                                            }
                                        });
                                    }
                                }
                            });
                        } else {
                            // Stop chunked recording — acquire the transcription lock
                            TRANSCRIBING_LOCK.store(true, Ordering::SeqCst);
                            if let Some(overlay) = app_h.get_webview_window("overlay") {
                                let _ = overlay.emit("status-change", "Transcribing...");
                            }

                            let (remaining, mut partials, tail_idx, elapsed_ms) = match app_h.state::<ChunkedRecorder>().stop() {
                                Ok(data) => data,
                                Err(e) => {
                                    eprintln!("Failed to stop chunked recorder: {}", e);
                                    TRANSCRIBING_LOCK.store(false, Ordering::SeqCst);
                                    if let Some(overlay) = app_h.get_webview_window("overlay") {
                                        let _ = overlay.hide();
                                    }
                                    return;
                                }
                            };

                            let app_h_clone = app_h.clone();
                            tauri::async_runtime::spawn(async move {
                                let whisper = app_h_clone.state::<WhisperService>();
                                let process_start = std::time::Instant::now();

                                // Transcribe remaining tail audio directly from RAM
                                if remaining.len() >= 1600 {
                                    match whisper.transcribe(&remaining, settings.filter_hallucinations, &settings.whisper_language) {
                                        Ok(text) => {
                                            if !text.is_empty() {
                                                partials.push((tail_idx, text));
                                            }
                                        }
                                        Err(e) => {
                                            eprintln!("Failed to transcribe tail chunk: {}", e);
                                        }
                                    }
                                }

                                // Sort by chunk index
                                partials.sort_by_key(|(idx, _)| *idx);

                                // Merge and deduplicate overlapping words
                                let full_text = deduplicate_overlap(partials);
                                println!("Combined stream output: \"{}\"", full_text);
                                
                                let process_elapsed_ms = process_start.elapsed().as_millis() as u32;

                                // Apply formatting and inject at cursor
                                let formatted_text = crate::commands::format_text(&full_text, &settings.format_mode);
                                if !formatted_text.is_empty() {
                                    let _ = crate::injector::inject_text(&formatted_text, &settings.injection_method);
                                    crate::history::add_history_entry(&app_h_clone, &formatted_text, process_elapsed_ms, elapsed_ms, "Streaming");
                                }

                                TRANSCRIBING_LOCK.store(false, Ordering::SeqCst);
                                if let Some(overlay) = app_h_clone.get_webview_window("overlay") {
                                    let _ = overlay.hide();
                                }
                            });
                        }
                    } else {
                        // Standard Mode
                        let recorder = app_h.state::<AudioRecorder>();
                        let is_recording = {
                            let state = recorder.inner().state.lock().unwrap();
                            state.is_recording
                        };

                        // If not currently recording, check the transcription lock
                        if !is_recording && TRANSCRIBING_LOCK.load(Ordering::SeqCst) {
                            println!("Ignoring shortcut: transcription still in progress");
                            return;
                        }

                        if !is_recording {
                            if let Some(overlay) = app_h.get_webview_window("overlay") {
                                let _ = overlay.emit("status-change", "Listening...");
                                let _ = overlay.show();
                            }
                            let _ = recorder.inner().start(app_h.clone());
                        } else {
                            TRANSCRIBING_LOCK.store(true, Ordering::SeqCst);
                            if let Some(overlay) = app_h.get_webview_window("overlay") {
                                let _ = overlay.emit("status-change", "Transcribing...");
                            }

                            let whisper = app_h.state::<WhisperService>();
                            match commands::stop_recording(app_h.clone(), recorder, whisper).await {
                                Ok(text) => {
                                    println!("Transcription completed: {}", text);
                                }
                                Err(e) => {
                                    eprintln!("Transcription error: {}", e);
                                }
                            }

                            TRANSCRIBING_LOCK.store(false, Ordering::SeqCst);
                            if let Some(overlay) = app_h.get_webview_window("overlay") {
                                let _ = overlay.hide();
                            }
                        }
                    }
                });
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::update_settings,
            commands::start_recording,
            commands::stop_recording,
            commands::switch_backend_model,
            commands::get_models_status,
            commands::get_models_dir,
            commands::list_microphones,
            commands::get_history,
            commands::clear_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn deduplicate_overlap(partials: Vec<(usize, String)>) -> String {
    let mut result = String::new();
    for (i, (_, text)) in partials.iter().enumerate() {
        let trimmed_text = text.trim();
        if trimmed_text.is_empty() {
            continue;
        }
        if i == 0 {
            result = trimmed_text.to_string();
            continue;
        }

        let result_words: Vec<&str> = result.split_whitespace().collect();
        let text_words: Vec<&str> = trimmed_text.split_whitespace().collect();

        let max_overlap = std::cmp::min(12, std::cmp::min(result_words.len(), text_words.len()));
        let mut best_overlap = 0;

        for overlap_len in 1..=max_overlap {
            let suffix = &result_words[result_words.len() - overlap_len..];
            let prefix = &text_words[..overlap_len];

            let mut match_count = 0;
            for j in 0..overlap_len {
                let w1 = suffix[j].to_lowercase().trim_matches(|c: char| c.is_ascii_punctuation() || c.is_whitespace()).to_string();
                let w2 = prefix[j].to_lowercase().trim_matches(|c: char| c.is_ascii_punctuation() || c.is_whitespace()).to_string();
                if w1 == w2 {
                    match_count += 1;
                }
            }
            if match_count == overlap_len {
                best_overlap = overlap_len;
            }
        }

        let new_words = &text_words[best_overlap..];
        if !new_words.is_empty() {
            if !result.is_empty() {
                result.push(' ');
            }
            result.push_str(&new_words.join(" "));
        }
    }
    result
}


