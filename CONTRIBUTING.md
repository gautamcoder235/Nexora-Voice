# Contributing to Nexora Voice

First off, thank you for taking the time to contribute! 🎉

Nexora Voice is an open-source project dedicated to private, low-latency, offline voice-to-text dictation. We welcome bug reports, feature suggestions, documentation enhancements, and code contributions.

---

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please report unacceptable behavior following the guidelines in that document.

---

## Getting Started

### 1. Fork & Clone
Fork the repository on GitHub, then clone your fork locally:
```bash
git clone https://github.com/<your-username>/Nexora-Voice.git
cd Nexora-Voice
```

### 2. Prerequisites
Make sure your development machine has:
* **Node.js** (v18+) and `npm`
* **Rust** (stable toolchain): `rustup default stable`
* **CMake** (v3.16+) in your system `PATH`
* **Visual Studio C++ Build Tools** (MSVC toolset and Windows 10/11 SDK)
* **Vulkan SDK**: Required for compiling the local whisper Vulkan backend
* **Windows Long Paths**: Run `git config --system core.longpaths true`

### 3. Install Dependencies & Run
```bash
npm install
npm run tauri dev
```

---

## Development Workflow

### Branching Strategy
* Create a feature or bugfix branch off `main`:
  ```bash
  git checkout -b feat/your-feature-name
  # or
  git checkout -b fix/issue-description
  ```

### Code Guidelines
* **Rust Backend (`src-tauri/`)**:
  * Run `cargo fmt` and ensure `cargo clippy` passes cleanly.
  * Avoid panicking in Tauri commands; return descriptive `Result<T, String>` errors.
  * Keep heavy inference tasks off the main thread; use `tauri::async_runtime::spawn`.
* **Frontend (`src/`)**:
  * Written in TypeScript and React 19.
  * Ensure `npm run build` (`tsc && vite build`) executes without TypeScript errors.
  * Maintain clean CSS variables and keep the dark/light theme consistency.

---

## Submitting Pull Requests

1. Commit your changes with clear, semantic commit messages (e.g. `feat: add support for ...`, `fix: resolve crash on ...`).
2. Push your branch to your GitHub fork:
   ```bash
   git push origin feat/your-feature-name
   ```
3. Open a Pull Request against the `main` branch of `gautamcoder235/Nexora-Voice`.
4. Fill out the PR template completely with details of what was changed and how you tested it.

---

## Reporting Bugs

Please use the [Bug Report Template](https://github.com/gautamcoder235/Nexora-Voice/issues/new?template=bug_report.yml) when reporting issues. Include:
* Your Windows version
* Your GPU model and driver version
* The active Whisper model profile (Fast / Balanced / Lightweight)
* Console logs or reproduction steps
