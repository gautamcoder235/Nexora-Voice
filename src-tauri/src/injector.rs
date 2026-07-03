use arboard::Clipboard;
use enigo::{Direction, Enigo, Keyboard, Settings, Key};
use std::thread::sleep;
use std::time::Duration;

pub fn inject_text(text: &str, method: &str) -> Result<(), String> {
    if text.is_empty() {
        return Ok(());
    }

    if method == "paste" {
        paste_via_clipboard(text)
    } else {
        type_via_keyboard(text)
    }
}

fn paste_via_clipboard(text: &str) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| format!("Failed to access clipboard: {}", e))?;
    
    // Backup original clipboard contents
    let original_text = clipboard.get_text().ok();

    // Set clipboard text
    clipboard.set_text(text.to_string()).map_err(|e| format!("Failed to set clipboard: {}", e))?;
    sleep(Duration::from_millis(30)); // Wait for clipboard registration

    // Initialize Enigo and trigger paste hotkey
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to initialize keyboard simulation: {:?}", e))?;

    // Press Ctrl
    enigo.key(Key::Control, Direction::Press)
        .map_err(|e| format!("Failed to press Control: {:?}", e))?;
        
    // Click v
    enigo.key(Key::Unicode('v'), Direction::Click)
        .map_err(|e| format!("Failed to click v: {:?}", e))?;
        
    // Release Ctrl
    enigo.key(Key::Control, Direction::Release)
        .map_err(|e| format!("Failed to release Control: {:?}", e))?;

    sleep(Duration::from_millis(50)); // Wait for paste to complete

    // Restore original clipboard contents
    if let Some(orig) = original_text {
        let _ = clipboard.set_text(orig);
    } else {
        let _ = clipboard.clear();
    }

    Ok(())
}

fn type_via_keyboard(text: &str) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to initialize keyboard simulation: {:?}", e))?;
        
    enigo.text(text).map_err(|e| format!("Failed to type text: {:?}", e))?;
    Ok(())
}
