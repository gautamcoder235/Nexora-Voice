import React, { useEffect, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { 
  Sliders, 
  Settings,
  Download, 
  CheckCircle, 
  AlertTriangle, 
  Keyboard, 
  FileText, 
  ShieldAlert,
  Cpu, 
  Save, 
  Loader2,
  Settings2,
  RefreshCw,
  FolderOpen,
  Mic,
  Zap,
  History as HistoryIcon,
  LogOut,
  Copy
} from "lucide-react";

interface AppSettings {
  model_size: string;
  format_mode: string;
  hotkey: string;
  injection_method: string;
  custom_instructions: string;
  streaming_mode: boolean;
}

interface ModelStatus {
  cached: boolean;
  active: boolean;
}

type ModelsStatusMap = Record<string, ModelStatus>;

interface SettingsDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

// ─── Hotkey Capture Widget ────────────────────────────────────────────────────
interface HotkeyCaptureProps {
  value: string;
  onChange: (hotkey: string) => void;
}

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "OS"]);

const HotkeyCapture: React.FC<HotkeyCaptureProps> = ({ value, onChange }) => {
  const [isCapturing, setIsCapturing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const parseKeys = (hotkey: string) =>
    hotkey ? hotkey.split("+").map((k) => k.trim()).filter(Boolean) : [];

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setIsCapturing(false);
        return;
      }

      // Ignore standalone modifier presses — wait for the trigger key
      if (MODIFIER_KEYS.has(e.key)) return;

      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Control");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      if (e.metaKey) parts.push("Meta");

      // Normalise key name
      let key = e.key;
      if (key === " ") key = "Space";
      else if (key.length === 1) key = key.toUpperCase();
      parts.push(key);

      onChange(parts.join("+"));
      setIsCapturing(false);
    },
    [onChange]
  );

  useEffect(() => {
    if (!isCapturing) return;
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isCapturing, handleKeyDown]);

  // Close capture if user clicks outside
  useEffect(() => {
    if (!isCapturing) return;
    const onOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsCapturing(false);
      }
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [isCapturing]);

  const keys = parseKeys(value);

  return (
    <div className="input-group" ref={containerRef}>
      <label className="input-label">
        <Keyboard className="h-4 w-4 text-cyan-400" />
        <span>Global Shortcut Combination</span>
      </label>

      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsCapturing(true)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setIsCapturing(true); }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          minHeight: 44,
          padding: "8px 14px",
          borderRadius: 10,
          border: isCapturing
            ? "1.5px solid rgba(34,211,238,0.8)"
            : "1.5px solid rgba(255,255,255,0.08)",
          background: isCapturing
            ? "rgba(34,211,238,0.06)"
            : "rgba(255,255,255,0.03)",
          cursor: "pointer",
          outline: "none",
          transition: "border-color 0.2s, background 0.2s, box-shadow 0.2s",
          boxShadow: isCapturing
            ? "0 0 0 3px rgba(34,211,238,0.18), 0 0 16px rgba(34,211,238,0.12)"
            : "none",
          flexWrap: "wrap",
          position: "relative",
          userSelect: "none",
        }}
      >
        {isCapturing ? (
          <>
            <span style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "#22d3ee",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.03em",
            }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#22d3ee",
                display: "inline-block",
                animation: "pulse-dot 1s ease-in-out infinite",
              }} />
              Press your shortcut keys...
            </span>
            <span style={{
              marginLeft: "auto",
              fontSize: 11,
              color: "rgba(148,163,184,0.6)",
              fontStyle: "italic",
            }}>
              Esc to cancel
            </span>
          </>
        ) : (
          <>
            {keys.length === 0 ? (
              <span style={{ color: "rgba(148,163,184,0.5)", fontSize: 13, fontStyle: "italic" }}>
                Click to set shortcut…
              </span>
            ) : (
              keys.map((k, i) => (
                <React.Fragment key={k}>
                  {i > 0 && (
                    <span style={{ color: "rgba(148,163,184,0.4)", fontSize: 12 }}>+</span>
                  )}
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "3px 10px",
                    borderRadius: 6,
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "#e2e8f0",
                    fontSize: 12,
                    fontFamily: "monospace",
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    boxShadow: "0 2px 0 rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)",
                  }}>
                    {k}
                  </span>
                </React.Fragment>
              ))
            )}
            <span style={{
              marginLeft: "auto",
              fontSize: 11,
              color: "rgba(148,163,184,0.4)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}>
              <Keyboard className="h-3 w-3" />
              click to customize
            </span>
          </>
        )}
      </div>

      <p className="input-help">
        Click the field above and press your desired key combination to set a new global shortcut.
      </p>
    </div>
  );
};

// Live volume visualization bar for mic selection cards
const MicVisualizer: React.FC<{ micName: string }> = ({ micName }) => {
  const [level, setLevel] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let isActive = true;

    const initAudio = async () => {
      try {
        // 1. Request general microphone permission first to reveal device labels
        let tempStream: MediaStream | null = null;
        try {
          tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
          console.warn("Failed to obtain initial microphone permission:", e);
          return;
        }

        // 2. Enumerate devices now that labels are populated
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        // 3. Stop the temporary permission stream tracks so we don't lock the mic
        tempStream.getTracks().forEach(t => t.stop());

        if (!isActive) return;

        const audioDevices = devices.filter(d => d.kind === "audioinput");
        
        // 4. Find matching device by name
        const matched = audioDevices.find(d => {
          const l = d.label.toLowerCase();
          const m = micName.toLowerCase();
          return l.includes(m) || m.includes(l);
        });

        if (!matched) {
          console.warn(`No matching audio input device found for name: ${micName}`);
          return;
        }

        // 5. Open the exact matching device
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: matched.deviceId } }
        });

        if (!isActive) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioContext = new AudioContextClass();
        audioContextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 32; // small bin count for minimal CPU footprint
        source.connect(analyser);
        analyserRef.current = analyser;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
          if (!isActive || !analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);

          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const avg = sum / bufferLength;
          // Normalize & scale to visually represent speech sensitivity
          const norm = Math.min(avg / 140, 1.0);
          setLevel(norm);

          rafRef.current = requestAnimationFrame(draw);
        };
        draw();
      } catch (err) {
        console.warn("Failed to capture mic stream preview:", err);
      }
    };

    initAudio();

    return () => {
      isActive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
      }
    };
  }, [micName]);

  return (
    <div style={{
      position: "absolute",
      bottom: 0,
      left: 0,
      width: "100%",
      height: 3,
      background: "rgba(255, 255, 255, 0.02)",
      overflow: "hidden",
      borderRadius: "0 0 16px 16px"
    }}>
      <div style={{
        height: "100%",
        width: `${Math.max(level * 100, 1.5)}%`,
        background: "linear-gradient(90deg, #10b981 0%, #22d3ee 100%)",
        boxShadow: level > 0.05 ? "0 0 6px #10b981" : "none",
        transition: "width 0.06s ease"
      }} />
    </div>
  );
};

export const SettingsDashboard: React.FC<SettingsDashboardProps> = ({ isOpen, onClose }) => {

  if (!isOpen) return null;

  const [settings, setSettings] = useState<AppSettings>({
    model_size: "small",
    format_mode: "none",
    hotkey: "Control+Alt+V",
    injection_method: "paste",
    custom_instructions: "",
    streaming_mode: false
  });

  const [modelsStatus, setModelsStatus] = useState<ModelsStatusMap>({});
  const [isLoadingSettings, setIsLoadingSettings] = useState<boolean>(true);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [loadingModelKey, setLoadingModelKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [microphones, setMicrophones] = useState<string[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>("");
  
  interface HistoryEntry {
    id: string;
    timestamp: string;
    text: string;
    elapsed_ms: number;
    mode: string;
    audio_duration_ms: number;
  }

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"general" | "models" | "mic" | "history">("general");

  // Fetch Settings & Model Status with retry for backend startup
  const loadData = async (isSilent = false) => {
    try {
      if (!isSilent) {
        setIsLoadingSettings(true);
      } else {
        setIsRefreshingStatus(true);
      }
      setErrorMsg(null);
      
      // Settings are stored locally, always available
      const s = await invoke<AppSettings>("get_settings");
      setSettings(s);

      // Fetch history, always available
      try {
        const hist = await invoke<HistoryEntry[]>("get_history");
        setHistory(hist);
      } catch (e) { console.warn("Failed to load history", e); }

      // Mic listing is local (cpal), always available
      try {
        const mics = await invoke<string[]>("list_microphones");
        setMicrophones(mics);
        if (mics.length > 0 && !selectedMic) setSelectedMic(mics[0]);
      } catch (e) { console.warn("Mic listing unavailable", e); }

      // Models status needs the backend — retry with backoff
      let connected = false;
      const maxAttempts = isSilent ? 1 : 10;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const status = await invoke<ModelsStatusMap>("get_models_status");
          setModelsStatus(status);
          connected = true;
          setErrorMsg(null);
          break;
        } catch (err) {
          console.warn(`Backend not ready (attempt ${attempt + 1}/${maxAttempts})...`);
          if (!isSilent) {
            setErrorMsg(`Connecting to Whisper engine... (attempt ${attempt + 1}/10)`);
            await new Promise(r => setTimeout(r, 3000));
          }
        }
      }
      
      if (!connected && !isSilent) {
        setErrorMsg("Failed to connect to Whisper backend. Please verify that the FastAPI backend server is running.");
      }
    } catch (err) {
      console.error(err);
      if (!isSilent) {
        setErrorMsg("Failed to load settings.");
      }
    } finally {
      if (!isSilent) {
        setIsLoadingSettings(false);
      } else {
        setIsRefreshingStatus(false);
      }
    }
  };

  useEffect(() => {
    loadData(false);

    // Listen to real-time history updates from Rust
    let unlistenPromise = listen<HistoryEntry[]>("history-updated", (event) => {
      setHistory(event.payload);
    });

    return () => {
      unlistenPromise.then((u) => u());
    };
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await invoke("update_settings", { settings });
      setSuccessMsg("Settings saved and global hotkey registered successfully!");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(`Failed to save settings: ${err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearHistory = async () => {
    try {
      await invoke("clear_history");
      setHistory([]);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLoadOrDownloadModel = async (modelKey: string) => {
    setLoadingModelKey(modelKey);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      // Trigger switch_backend_model (which auto-downloads if not cached)
      await invoke("switch_backend_model", { modelSize: modelKey });
      
      // Update local settings state
      setSettings(prev => ({ ...prev, model_size: modelKey }));
      
      // Emit event so other dashboard components sync immediately
      await emit("model-changed", modelKey);
      
      setSuccessMsg(`Model '${modelKey.toUpperCase()}' is now active!`);
      
      // Refresh status map
      const status = await invoke<ModelsStatusMap>("get_models_status");
      setModelsStatus(status);
    } catch (err: any) {
      setErrorMsg(`Failed to load/download model: ${err}`);
    } finally {
      setLoadingModelKey(null);
    }
  };
  const formatTimeOnly = (ts: string) => {
    try {
      const parts = ts.split(" ");
      if (parts.length < 2) return ts;
      const timeParts = parts[1].split(":");
      let hours = parseInt(timeParts[0]);
      const minutes = timeParts[1];
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12;
      hours = hours ? hours : 12;
      return `${hours}:${minutes} ${ampm}`;
    } catch {
      return ts;
    }
  };

  const getWordCount = (txt: string) => {
    const trimmed = txt.trim();
    if (!trimmed) return "0 words";
    return `${trimmed.split(/\s+/).length} words`;
  };

  const formatDurationOnly = (ms: number) => {
    return `${Math.round((ms || 0) / 1000)}s`;
  };

  if (isLoadingSettings) {
    return (
      <div className="loading-container">
        <div className="loader-blob" />
        <Loader2 className="h-10 w-10 text-cyan-400 animate-spin mb-4" />
        <span className="text-slate-400 text-sm font-semibold tracking-wider">CONNECTING TO AUDIO ENGINE...</span>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" style={{
      position: "fixed",
      top: 38, // Start exactly below the 38px window titlebar
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(0, 0, 0, 0.75)",
      backdropFilter: "blur(14px)",
      zIndex: 1000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 0
    }} onClick={onClose}>
      <div className="glass-dashboard-card" style={{
        width: "100%",
        height: "100%",
        borderRadius: 0,
        border: "none",
        position: "relative",
        overflow: "hidden",
        display: "flex"
      }} onClick={(e) => e.stopPropagation()}>
        
        {/* Sidebar Nav */}
        <aside className="dashboard-sidebar">
          <div className="sidebar-brand">
            <div className="brand-logo">
              <Cpu className="h-5 w-5 text-cyan-400" />
            </div>
            <div className="brand-meta">
              <h2 className="brand-title">Nexora</h2>
              <span className="brand-subtitle">Voice Dictation</span>
            </div>
          </div>

          <nav className="sidebar-nav">
            <button 
              className={`nav-item ${activeTab === "general" ? "active" : ""}`}
              onClick={() => setActiveTab("general")}
            >
              <Settings2 className="h-4 w-4" />
              <span>General Settings</span>
            </button>
            
            <button 
              className={`nav-item ${activeTab === "models" ? "active" : ""}`}
              onClick={() => setActiveTab("models")}
            >
              <Cpu className="h-4 w-4" />
              <span>Local Models Hub</span>
            </button>

            <button 
              className={`nav-item ${activeTab === "mic" ? "active" : ""}`}
              onClick={() => setActiveTab("mic")}
            >
              <Mic className="h-4 w-4" />
              <span>Microphone</span>
            </button>
          </nav>

          <div className="sidebar-status-card">
            <div className="status-indicator">
              <div className={`status-dot ${errorMsg ? "error" : "online"}`} />
              <span className="status-label">{errorMsg ? "Disconnected" : "Engine Online"}</span>
            </div>
            <button 
              onClick={() => loadData(true)} 
              className={`refresh-status-btn ${isRefreshingStatus ? "refreshing" : ""}`} 
              title="Refresh connection"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </aside>

        {/* Content Workspace */}
        <main className="dashboard-content">
          
          {/* Header Action Bar */}
          <header className="content-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h1 className="tab-title" style={{ margin: 0 }}>
              {activeTab === "general" 
                ? "Dictation Configurations" 
                : activeTab === "models" 
                ? "Offline Speech Models" 
                : activeTab === "mic" 
                ? "Audio Input Device" 
                : "Transcription History"}
            </h1>
            <button 
              onClick={onClose} 
              className="btn-glass"
              style={{ padding: "6px 12px", display: "flex", alignItems: "center", gap: 6, borderColor: "rgba(239, 68, 68, 0.25)", color: "#f87171", cursor: "pointer" }}
            >
              <LogOut className="h-4 w-4" />
              <span>Back to Studio</span>
            </button>
          </header>

          {/* Connection Error Message Bar */}
          {errorMsg && (
            <div className="alert-banner alert-error animate-fade-in">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <div className="alert-content">
                <span className="alert-title">Connection Interrupted</span>
                <p className="alert-description">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Success Banner */}
          {successMsg && (
            <div className="alert-banner alert-success animate-fade-in">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <div className="alert-content">
                <span className="alert-title">Success</span>
                <p className="alert-description">{successMsg}</p>
              </div>
            </div>
          )}

          {/* Tab 1: General Settings Panel */}
          {activeTab === "general" && (
            <form onSubmit={handleSaveSettings} className="settings-form">

              {/* ── Section 1: Trigger & Output ────────────────────── */}
              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
                padding: "20px 24px",
                borderRadius: "16px",
                background: "rgba(255, 255, 255, 0.015)",
                border: "1px solid rgba(255, 255, 255, 0.05)",
                boxShadow: "inset 0 1px 1px rgba(255, 255, 255, 0.01)",
              }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  paddingBottom: 10,
                  borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                }}>
                  <Keyboard className="h-4 w-4" style={{ color: "rgba(34, 211, 238, 0.7)" }} />
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255, 255, 255, 0.6)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Trigger &amp; Output
                  </span>
                </div>

                <div className="form-grid" style={{ marginTop: 4 }}>
                  {/* Hotkey Selector – click-to-capture */}
                  <HotkeyCapture
                    value={settings.hotkey}
                    onChange={(hk) => setSettings({ ...settings, hotkey: hk })}
                  />

                  {/* Text Formatting Selection */}
                  <div className="input-group">
                    <label className="input-label">
                      <Sliders className="h-4 w-4 text-cyan-400" />
                      <span>Automatic Case Formatting</span>
                    </label>
                    <select
                      value={settings.format_mode}
                      onChange={(e) => setSettings({ ...settings, format_mode: e.target.value })}
                      className="glass-select"
                    >
                      <option value="none">Plain Output (No adjustments)</option>
                      <option value="camel">camelCase (variables)</option>
                      <option value="snake">snake_case (database/files)</option>
                      <option value="pascal">PascalCase (classes/components)</option>
                      <option value="upper">UPPERCASE (shouting/SQL)</option>
                    </select>
                    <p className="input-help">Dictating "first name" auto-formats text (e.g. firstName, first_name).</p>
                  </div>
                </div>
              </div>

              {/* ── Section 2: Recording Behavior ──────────────────── */}
              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
                padding: "20px 24px",
                borderRadius: "16px",
                background: "rgba(255, 255, 255, 0.015)",
                border: "1px solid rgba(255, 255, 255, 0.05)",
                boxShadow: "inset 0 1px 1px rgba(255, 255, 255, 0.01)",
              }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  paddingBottom: 10,
                  borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                }}>
                  <Zap className="h-4 w-4" style={{ color: "rgba(34, 211, 238, 0.7)" }} />
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255, 255, 255, 0.6)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Recording Behavior
                  </span>
                </div>

                <div className="form-grid" style={{ marginTop: 4 }}>
                  {/* Typing Mode Selection */}
                  <div className="input-group">
                    <label className="input-label">
                      <Sliders className="h-4 w-4 text-cyan-400" />
                      <span>Active Cursor Injection Method</span>
                    </label>
                    <select
                      value={settings.injection_method}
                      onChange={(e) => setSettings({ ...settings, injection_method: e.target.value })}
                      className="glass-select"
                    >
                      <option value="paste">Clipboard Paste (Instant &amp; Safe)</option>
                      <option value="type">Virtual Key Typing (Compatible with consoles)</option>
                    </select>
                    <p className="input-help">Pasting is recommended for long transcripts. Typing is compatible everywhere.</p>
                  </div>

                  {/* Real-time Streaming Mode Selection */}
                  <div className="input-group">
                    <label className="input-label">
                      <Zap className="h-4 w-4 text-cyan-400" />
                      <span>Real-time Streaming Mode</span>
                    </label>
                    <select
                      value={settings.streaming_mode ? "true" : "false"}
                      onChange={(e) => setSettings({ ...settings, streaming_mode: e.target.value === "true" })}
                      className="glass-select"
                    >
                      <option value="false">Standard Mode (For &lt; 30s quick dictation)</option>
                      <option value="true">Streaming Mode (For long recording, instant results)</option>
                    </select>
                    <p className="input-help">Background chunk transcription gives near-instant results for long notes.</p>
                  </div>
                </div>
              </div>

              {/* Submit Save button */}
              <div className="form-actions">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="btn-primary"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span>Save Configurations</span>
                </button>
              </div>
            </form>

          )}

          {/* Tab 2: Model Management panel */}
          {activeTab === "models" && (
            <div className="models-tab-layout">
              <div className="models-list-card">
                
                {[
                  { key: "tiny", size: "75 MB", label: "Whisper Tiny Model", desc: "Ultra-fast synthesis, lowest VRAM footprint. Best for quick coding prompts." },
                  { key: "base", size: "140 MB", label: "Whisper Base Model", desc: "Balanced speed and accuracy. Decent for general dictations." },
                  { key: "small", size: "460 MB", label: "Whisper Small Model", desc: "Highly accurate and robust offline transcription (Default)." }
                ].map((m) => {
                  const status = modelsStatus[m.key] || { cached: false, active: false };
                  const isModelLoading = loadingModelKey === m.key;

                  return (
                    <div 
                      key={m.key} 
                      className={`model-card-item ${status.active ? "active-border" : ""}`}
                    >
                      <div className="model-info-block">
                        <div className="model-title-row">
                          <span className="model-name">{m.label}</span>
                          <span className="model-size-badge">{m.size}</span>
                        </div>
                        <p className="model-desc">{m.desc}</p>
                      </div>

                      <div className="model-action-block">
                        {status.active ? (
                          <div className="active-badge-status">
                            <CheckCircle className="h-3.5 w-3.5" />
                            <span>Active Model</span>
                          </div>
                        ) : status.cached ? (
                          <button
                            disabled={loadingModelKey !== null}
                            onClick={() => handleLoadOrDownloadModel(m.key)}
                            className="btn-glass"
                          >
                            {isModelLoading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              "Load Model"
                            )}
                          </button>
                        ) : (
                          <button
                            disabled={loadingModelKey !== null}
                            onClick={() => handleLoadOrDownloadModel(m.key)}
                            className="btn-download"
                          >
                            {isModelLoading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <>
                                <Download className="h-3.5 w-3.5" />
                                <span>Download</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Path description */}
              <div className="footer-notes">
                <FolderOpen className="h-4 w-4 text-cyan-400" />
                <span>Models cached locally at: <strong>E:\Codes\Nexora\Nexora Voice\models</strong></span>
              </div>
            </div>
          )}

          {/* Tab 3: Microphone Selection */}
          {activeTab === "mic" && (
            <div className="models-tab-layout">
              <p className="input-help" style={{ marginBottom: 16, fontSize: 12 }}>
                Select the audio input device to use for voice dictation. The selected microphone will be used for all recordings.
              </p>
              <div className="models-list-card">
                {microphones.length === 0 ? (
                  <div className="model-card-item" style={{ justifyContent: "center", padding: "24px" }}>
                    <span className="model-desc">No microphones detected. Plug in a device and refresh.</span>
                  </div>
                ) : (
                  microphones.map((mic, idx) => (
                    <button
                      key={idx}
                      className={`model-card-item ${selectedMic === mic ? "active-border" : ""}`}
                      onClick={() => setSelectedMic(mic)}
                      style={{ 
                        cursor: "pointer", 
                        textAlign: "left", 
                        width: "100%", 
                        background: "none",
                        position: "relative",
                        paddingBottom: "22px" // gives room for the absolute visualizer bar at the bottom
                      }}
                    >
                      <div className="model-info-block" style={{ maxWidth: "80%" }}>
                        <div className="model-title-row">
                          <Mic className="h-4 w-4" style={{ color: selectedMic === mic ? "#22d3ee" : "#64748b", flexShrink: 0 }} />
                          <span className="model-name" style={{ fontSize: 13 }}>{mic}</span>
                        </div>
                        <p className="model-desc">{idx === 0 ? "System Default Device" : `Audio Input ${idx + 1}`}</p>
                      </div>
                      <div className="model-action-block">
                        {selectedMic === mic ? (
                          <div className="active-badge-status">
                            <CheckCircle className="h-3.5 w-3.5" />
                            <span>Selected</span>
                          </div>
                        ) : (
                          <div className="btn-glass" style={{ pointerEvents: "none" }}>Select</div>
                        )}
                      </div>
                      {/* Live reacting voice bar */}
                      <MicVisualizer micName={mic} />
                    </button>
                  ))
                )}
              </div>
              <div className="footer-notes">
                <Mic className="h-4 w-4 text-cyan-400" />
                <span>Detected <strong>{microphones.length}</strong> input device(s) via WASAPI</span>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
};
