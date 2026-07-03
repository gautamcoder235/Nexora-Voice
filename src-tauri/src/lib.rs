mod audio;
mod backend_server;
mod chunked_recorder;
mod client;
mod commands;
mod history;
mod injector;
mod settings;
mod tts;

use tauri::{Manager, Emitter, Listener};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
use std::str::FromStr;

use audio::AudioRecorder;
use backend_server::BackendServer;
use chunked_recorder::ChunkedRecorder;
use client::WhisperClient;
use settings::load_settings;

fn setup_global_shortcut(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle();
    let settings = load_settings(app_handle);
    
    // Parse hotkey combination (e.g. "Control+Alt+V")
    let hotkey_str = settings.hotkey.clone();
    
    // Register the shortcut using the global-shortcut plugin
    let shortcut = Shortcut::from_str(&hotkey_str)?;
    
    app.global_shortcut().register(shortcut)?;
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Register tauri 2.0 plugins
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _shortcut, event| {
                if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                    let _ = app.emit("global-shortcut-triggered", ());
                }
            })
            .build())
        .plugin(tauri_plugin_shell::init())
        
        // Manage shared concurrent state
        .manage(AudioRecorder::new())
        .manage(ChunkedRecorder::new())
        .manage(WhisperClient::new())
        .manage(BackendServer::new())
        
        .setup(|app| {
            // Setup Settings & Main Window
            let app_handle = app.handle().clone();

            // Auto-start the FastAPI backend server
            // project_root is the Nexora Voice directory (parent of src-tauri)
            let project_root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .expect("Cannot determine project root")
                .to_path_buf();
            
            let backend = app.state::<BackendServer>();
            if let Err(e) = backend.start(&project_root) {
                eprintln!("[Warning] Failed to auto-start backend: {}", e);
                eprintln!("[Warning] You may need to start the FastAPI server manually.");
            } else {
                // Give the server a moment to initialize
                std::thread::sleep(std::time::Duration::from_secs(2));
            }
            
            // Create System Tray Menu
            let tray_menu = Menu::with_items(&app_handle, &[
                &MenuItem::with_id(&app_handle, "show", "Show Settings", true, None::<&str>)?,
                &MenuItem::with_id(&app_handle, "quit", "Quit Nexora Voice", true, None::<&str>)?,
            ])?;

            // Create Tray Icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .on_menu_event(move |app_h, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(win) = app_h.get_webview_window("main") {
                                let _ = win.unminimize();
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                        "quit" => {
                            // Kill backend server before exit
                            let backend = app_h.state::<BackendServer>();
                            backend.stop();
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
                
                #[cfg(target_os = "windows")]
                if let Ok(hwnd) = overlay.hwnd() {
                    unsafe {
                        let raw_hwnd: *mut std::ffi::c_void = std::mem::transmute(hwnd);
                        win32::disable_shadow(raw_hwnd);
                    }
                }
            }

            // Register Hotkeys
            if let Err(e) = setup_global_shortcut(app) {
                eprintln!("Failed to register global shortcut: {}", e);
            }
            
            // Global Shortcut Listener
            let app_h2 = app.handle().clone();
            app.listen("global-shortcut-triggered", move |_event| {
                let app_h = app_h2.clone();
                tauri::async_runtime::spawn(async move {
                    let settings = load_settings(&app_h);
                    
                    if settings.streaming_mode {
                        let is_recording = app_h.state::<ChunkedRecorder>().is_recording();

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
                            tauri::async_runtime::spawn(async move {
                                let temp_dir = match app_h_loop.path().app_data_dir() {
                                    Ok(d) => d,
                                    Err(_) => return,
                                };
                                let _ = std::fs::create_dir_all(&temp_dir);

                                loop {
                                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                                    if !app_h_loop.state::<ChunkedRecorder>().is_recording() {
                                        break;
                                    }

                                    if let Some((chunk_samples, idx)) = app_h_loop.state::<ChunkedRecorder>().drain_chunk() {
                                        let file_path = temp_dir.join(format!("chunk_{}_{}.wav", idx, uuid::Uuid::new_v4()));
                                        if crate::audio::save_wav_file(&chunk_samples, &file_path).is_ok() {
                                            let app_h_api = app_h_loop.clone();
                                            let path_api = file_path.clone();

                                            tauri::async_runtime::spawn(async move {
                                                let client_api = app_h_api.state::<WhisperClient>();
                                                let chunked_recorder_api = app_h_api.state::<ChunkedRecorder>();
                                                match client_api.transcribe_chunk(&path_api, idx).await {
                                                    Ok(text) => {
                                                        if !text.is_empty() {
                                                            chunked_recorder_api.add_partial(idx, text);
                                                        }
                                                    }
                                                    Err(e) => {
                                                        eprintln!("Failed to transcribe chunk {}: {}", idx, e);
                                                    }
                                                }
                                                let _ = std::fs::remove_file(&path_api);
                                            });
                                        }
                                    }
                                }
                            });
                        } else {
                            // Stop chunked recording
                            if let Some(overlay) = app_h.get_webview_window("overlay") {
                                let _ = overlay.emit("status-change", "Transcribing...");
                            }

                            let (remaining, mut partials, tail_idx, elapsed_ms) = match app_h.state::<ChunkedRecorder>().stop() {
                                Ok(data) => data,
                                Err(e) => {
                                    eprintln!("Failed to stop chunked recorder: {}", e);
                                    if let Some(overlay) = app_h.get_webview_window("overlay") {
                                        let _ = overlay.hide();
                                    }
                                    return;
                                }
                            };

                            let client = app_h.state::<WhisperClient>();

                            // Transcribe remaining tail audio
                            if remaining.len() >= 1600 {
                                let temp_dir = app_h.path().app_data_dir().unwrap_or_default();
                                let file_path = temp_dir.join(format!("chunk_tail_{}.wav", uuid::Uuid::new_v4()));
                                if crate::audio::save_wav_file(&remaining, &file_path).is_ok() {
                                    match client.transcribe_chunk(&file_path, tail_idx).await {
                                        Ok(text) => {
                                            if !text.is_empty() {
                                                partials.push((tail_idx, text));
                                            }
                                        }
                                        Err(e) => {
                                            eprintln!("Failed to transcribe tail chunk: {}", e);
                                        }
                                    }
                                    let _ = std::fs::remove_file(&file_path);
                                }
                            }

                            // Sort by chunk index
                            partials.sort_by_key(|(idx, _)| *idx);

                            // Merge and deduplicate overlapping words
                            let full_text = deduplicate_overlap(partials);
                            println!("Combined stream output: \"{}\"", full_text);

                            // Apply formatting and inject at cursor
                            let formatted_text = crate::commands::format_text(&full_text, &settings.format_mode);
                             if !formatted_text.is_empty() {
                                 let _ = crate::injector::inject_text(&formatted_text, &settings.injection_method);
                                 crate::history::add_history_entry(&app_h, &formatted_text, 300, elapsed_ms, "Streaming");
                             }

                            if let Some(overlay) = app_h.get_webview_window("overlay") {
                                let _ = overlay.hide();
                            }
                        }
                    } else {
                        // Standard Mode
                        let recorder = app_h.state::<AudioRecorder>();
                        let is_recording = {
                            let state = recorder.inner().state.lock().unwrap();
                            state.is_recording
                        };

                        if !is_recording {
                            if let Some(overlay) = app_h.get_webview_window("overlay") {
                                let _ = overlay.emit("status-change", "Listening...");
                                let _ = overlay.show();
                            }
                            let _ = recorder.inner().start(app_h.clone());
                        } else {
                            if let Some(overlay) = app_h.get_webview_window("overlay") {
                                let _ = overlay.emit("status-change", "Transcribing...");
                            }

                            let client = app_h.state::<WhisperClient>();
                            match commands::stop_recording(app_h.clone(), recorder, client).await {
                                Ok(text) => {
                                    println!("Transcription completed: {}", text);
                                }
                                Err(e) => {
                                    eprintln!("Transcription error: {}", e);
                                }
                            }

                            if let Some(overlay) = app_h.get_webview_window("overlay") {
                                let _ = overlay.hide();
                            }
                        }
                    }
                });
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::update_settings,
            commands::start_recording,
            commands::stop_recording,
            commands::switch_backend_model,
            commands::get_models_status,
            commands::list_microphones,
            commands::get_history,
            commands::clear_history,
            tts::generate_tts_audio,
            tts::get_tts_history,
            tts::clear_tts_history,
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

#[cfg(target_os = "windows")]
mod win32 {
    use std::ffi::c_void;

    type HWND = *mut c_void;
    type HMODULE = *mut c_void;
    type FARPROC = *mut c_void;

    extern "system" {
        fn LoadLibraryA(lp_lib_file_name: *const u8) -> HMODULE;
        fn GetProcAddress(h_module: HMODULE, lp_proc_name: *const u8) -> FARPROC;
        fn FreeLibrary(h_module: HMODULE) -> i32;
    }

    pub unsafe fn disable_shadow(hwnd: HWND) {
        let lib_name = b"dwmapi.dll\0";
        let h_module = LoadLibraryA(lib_name.as_ptr());
        if !h_module.is_null() {
            let proc_name = b"DwmSetWindowAttribute\0";
            let func_ptr = GetProcAddress(h_module, proc_name.as_ptr());
            if !func_ptr.is_null() {
                // DWMWA_NCRENDERING_POLICY = 2, DWMNCRP_DISABLED = 1
                let func: unsafe extern "system" fn(HWND, u32, *const c_void, u32) -> i32 = std::mem::transmute(func_ptr);
                let policy: i32 = 1; 
                let _ = func(hwnd, 2, &policy as *const i32 as *const c_void, 4);

                // DWMWA_WINDOW_CORNER_PREFERENCE = 33, DWMWCP_DONOTROUND = 1
                let corner_pref: i32 = 1;
                let _ = func(hwnd, 33, &corner_pref as *const i32 as *const c_void, 4);
            }
            FreeLibrary(h_module);
        }
    }
}

