use std::process::{Child, Command};
use std::sync::Mutex;

/// Manages the lifecycle of the FastAPI Python backend server process.
/// The server is spawned automatically on app startup and killed on shutdown.
pub struct BackendServer {
    child: Mutex<Option<Child>>,
}

impl BackendServer {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
        }
    }

    /// Spawn the FastAPI backend using the project's venv Python.
    /// Searches for the venv at common relative locations.
    pub fn start(&self, project_root: &std::path::Path) -> Result<(), String> {
        let mut guard = self.child.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Ok(()); // Already running
        }

        let backend_main = project_root.join("backend").join("main.py");
        if !backend_main.exists() {
            return Err(format!(
                "Backend main.py not found at: {}",
                backend_main.display()
            ));
        }

        // Determine Python executable path:
        // 1. Check for venv inside this project: Nexora Voice/venv
        // 2. Check for venv in parent project: voice-to-text-app/venv
        // 3. Fallback to system python
        let local_venv_python = project_root.join("venv").join("Scripts").join("python.exe");
        let parent_venv_python = project_root
            .parent()
            .map(|p| p.join("voice-to-text-app").join("venv").join("Scripts").join("python.exe"));

        let python_path = if local_venv_python.exists() {
            local_venv_python
        } else if let Some(ref pvp) = parent_venv_python {
            if pvp.exists() {
                pvp.clone()
            } else {
                std::path::PathBuf::from("python")
            }
        } else {
            std::path::PathBuf::from("python")
        };

        println!(
            "[BackendServer] Starting FastAPI with: {} -m uvicorn backend.main:app --host 127.0.0.1 --port 8000",
            python_path.display()
        );

        // Use `python -m uvicorn` to run the FastAPI app
        // This avoids issues with relative imports and ensures the correct venv is used
        let child = Command::new(&python_path)
            .args([
                "-m", "uvicorn",
                "backend.main:app",
                "--host", "127.0.0.1",
                "--port", "8000",
            ])
            .current_dir(project_root)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::inherit())
            .stderr(std::process::Stdio::inherit())
            .spawn()
            .map_err(|e| format!("Failed to spawn backend server: {}", e))?;

        println!("[BackendServer] FastAPI backend started (PID: {})", child.id());
        *guard = Some(child);
        Ok(())
    }

    /// Kill the backend server process
    pub fn stop(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                println!("[BackendServer] Shutting down FastAPI backend...");
                let _ = child.kill();
                let _ = child.wait();
                println!("[BackendServer] Backend stopped.");
            }
        }
    }
}

impl Drop for BackendServer {
    fn drop(&mut self) {
        self.stop();
    }
}
