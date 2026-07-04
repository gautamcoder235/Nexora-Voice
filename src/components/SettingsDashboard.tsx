import React, { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { 
  Sliders, 
  Download, 
  CheckCircle, 
  AlertTriangle, 
  Keyboard, 
  ShieldAlert,
  Cpu, 
  Save, 
  Loader2,
  Settings2,
  RefreshCw,
  FolderOpen,
  Mic,
  Zap,
  LogOut,
  ChevronDown,
  Globe
} from "lucide-react";

interface AppSettings {
  model_size: string;
  format_mode: string;
  hotkey: string;
  cancel_hotkey: string;
  settings_hotkey: string;
  format_hotkey: string;
  injection_method: string;
  custom_instructions: string;
  streaming_mode: boolean;
  filter_hallucinations: boolean;
  mic_device?: string;
  whisper_language?: string;
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

// HotkeyCapture has been extracted and moved to the shortcuts tab

interface CustomSelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: CustomSelectOption[];
}

const CustomSelect: React.FC<CustomSelectProps> = ({ value, onChange, options }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const selectedOption = options.find(o => o.value === value) || options[0];

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "10px 14px",
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid rgba(6, 182, 212, 0.2)",
          borderRadius: "12px",
          color: "#fff",
          fontSize: "13px",
          textAlign: "left",
          cursor: "pointer",
          outline: "none",
          boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05)",
          transition: "border-color 0.2s, box-shadow 0.2s"
        }}
        onFocus={(e) => e.currentTarget.style.borderColor = "#22d3ee"}
        onBlur={(e) => e.currentTarget.style.borderColor = "rgba(6, 182, 212, 0.2)"}
      >
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {selectedOption ? selectedOption.label : ""}
        </span>
        <ChevronDown 
          className="h-4 w-4" 
          style={{ 
            color: "rgba(255,255,255,0.4)", 
            transform: isOpen ? "rotate(180deg)" : "none",
            transition: "transform 0.2s ease" 
          }} 
        />
      </button>
      
      {isOpen && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          left: 0,
          width: "100%",
          background: "#080c14",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "12px",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)",
          zIndex: 9999,
          padding: "6px",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          maxHeight: "200px",
          overflowY: "auto"
        }}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: opt.value === value ? "rgba(6, 182, 212, 0.15)" : "transparent",
                border: "none",
                borderRadius: "8px",
                color: opt.value === value ? "#22d3ee" : "rgba(255,255,255,0.8)",
                fontSize: "12.5px",
                textAlign: "left",
                cursor: "pointer",
                transition: "all 0.15s ease",
                fontWeight: opt.value === value ? 600 : 400
              }}
              onMouseEnter={(e) => {
                if (opt.value !== value) {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
                  e.currentTarget.style.color = "#fff";
                }
              }}
              onMouseLeave={(e) => {
                if (opt.value !== value) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "rgba(255,255,255,0.8)";
                }
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Live volume visualization bar for mic selection cards
const MicVisualizer: React.FC<{ deviceId: string }> = ({ deviceId }) => {
  const [level, setLevel] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!deviceId) return;
    let isActive = true;

    const initAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } }
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
        let currentLevel = 0;

        const draw = () => {
          if (!isActive || !analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);

          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const avg = sum / bufferLength;
          // Normalize & scale to visually represent speech sensitivity
          const targetLevel = Math.min(avg / 140, 1.0);
          
          // Apply exponential smoothing (LERP) for visual fluidity
          currentLevel = currentLevel * 0.75 + targetLevel * 0.25;
          setLevel(currentLevel);

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
  }, [deviceId]);

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
        width: `${level * 100}%`,
        background: "linear-gradient(90deg, #10b981 0%, #22d3ee 100%)",
        boxShadow: level > 0.05 ? "0 0 6px #10b981" : "none",
        transition: "none"
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
    cancel_hotkey: "Escape",
    settings_hotkey: "Ctrl+,",
    format_hotkey: "Control+Alt+C",
    injection_method: "paste",
    custom_instructions: "",
    streaming_mode: false,
    filter_hallucinations: true,
    mic_device: "Default",
    whisper_language: "auto"
  });

  const [originalSettings, setOriginalSettings] = useState<AppSettings | null>(null);
  const hasChanges = originalSettings !== null && JSON.stringify(settings) !== JSON.stringify(originalSettings);

  const [modelsStatus, setModelsStatus] = useState<ModelsStatusMap>({});
  const [isLoadingSettings, setIsLoadingSettings] = useState<boolean>(true);
  const [showSpinner, setShowSpinner] = useState<boolean>(false);

  useEffect(() => {
    if (isLoadingSettings) {
      const timer = setTimeout(() => setShowSpinner(true), 150);
      return () => clearTimeout(timer);
    } else {
      setShowSpinner(false);
    }
  }, [isLoadingSettings]);

  const [isRefreshingStatus, setIsRefreshingStatus] = useState<boolean>(false);
  const [modelsDir, setModelsDir] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [loadingModelKey, setLoadingModelKey] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [microphones, setMicrophones] = useState<string[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>("");
  const [micPermissionState, setMicPermissionState] = useState<"granted" | "prompt" | "denied">("prompt");
  const [micDeviceIds, setMicDeviceIds] = useState<Record<string, string>>({});
  
  const resolveMicDeviceIds = async (micsList: string[]) => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices.filter(d => d.kind === "audioinput");
      const mapping: Record<string, string> = {};
      
      for (const micName of micsList) {
        const matched = audioDevices.find(d => {
          const l = d.label.toLowerCase();
          const m = micName.toLowerCase();
          return l.includes(m) || m.includes(l);
        });
        if (matched) {
          mapping[micName] = matched.deviceId;
        }
      }
      setMicDeviceIds(mapping);
    } catch (e) {
      console.warn("Failed to resolve browser device IDs:", e);
    }
  };
  
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
      
      const s = await invoke<AppSettings>("get_settings");
      setSettings(s);
      setOriginalSettings(s);
      if (s.mic_device) {
        setSelectedMic(s.mic_device);
      }

      // Get models directory path
      try {
        const dir = await invoke<string>("get_models_dir");
        setModelsDir(dir);
      } catch (e) {
        console.warn("Failed to load models directory path", e);
      }

      // Mic listing is local (cpal), always available
      try {
        const mics = await invoke<string[]>("list_microphones");
        setMicrophones(mics);
        if (mics.length > 0) {
          setSelectedMic(s.mic_device || mics[0]);
        }
        resolveMicDeviceIds(mics);
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

  const requestMicPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setMicPermissionState("granted");
      // Force refresh microphone list to populate real device labels
      try {
        const mics = await invoke<string[]>("list_microphones");
        setMicrophones(mics);
        resolveMicDeviceIds(mics);
      } catch (e) { console.warn("Mic reload failed", e); }
    } catch (e) {
      console.warn("Microphone permission denied:", e);
      setMicPermissionState("denied");
    }
  };

  useEffect(() => {
    loadData(false);

    // Query microphone permission state
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: "microphone" as PermissionName })
        .then((result) => {
          setMicPermissionState(result.state);
          result.onchange = () => {
            setMicPermissionState(result.state);
          };
        })
        .catch((e) => {
          console.warn("Permissions API not supported:", e);
          navigator.mediaDevices.enumerateDevices().then(devices => {
            const hasLabels = devices.some(d => d.kind === "audioinput" && d.label !== "");
            setMicPermissionState(hasLabels ? "granted" : "prompt");
          });
        });
    } else {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        const hasLabels = devices.some(d => d.kind === "audioinput" && d.label !== "");
        setMicPermissionState(hasLabels ? "granted" : "prompt");
      });
    }

    let unlistenDownloadPromise = listen<any>("model-download-progress", (event) => {
      setDownloadProgress(event.payload.percentage);
    });

    return () => {
      unlistenDownloadPromise.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (micPermissionState === "granted" && microphones.length > 0) {
      resolveMicDeviceIds(microphones);
    }
  }, [micPermissionState, microphones]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await invoke("update_settings", { settings });
      setOriginalSettings(settings);
      setSuccessMsg("Settings saved and global hotkey registered successfully!");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(`Failed to save settings: ${err}`);
    } finally {
      setIsSaving(false);
    }
  };



  const autoSaveSettings = async (updatedSettings: AppSettings) => {
    try {
      await invoke("update_settings", { settings: updatedSettings });
      setOriginalSettings(updatedSettings);
    } catch (err) {
      console.warn("Failed to auto-save settings:", err);
    }
  };

  const handleLoadOrDownloadModel = async (modelKey: string) => {
    setLoadingModelKey(modelKey);
    setDownloadProgress(0);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      // Trigger switch_backend_model (which auto-downloads if not cached)
      await invoke("switch_backend_model", { modelSize: modelKey });
      
      // Update local settings state and save directly
      const updated = { ...settings, model_size: modelKey };
      setSettings(updated);
      await autoSaveSettings(updated);
      
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

  const handleRestoreRecommended = () => {
    setSettings(prev => ({
      ...prev,
      format_mode: "none",
      injection_method: "paste",
      streaming_mode: true,
      filter_hallucinations: false
    }));
  };



  if (showSpinner) {
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
                  {/* Hotkey Selector removed - it's now in the shortcuts tab */}

                  {/* Text Formatting Selection */}
                  <div className="input-group">
                    <label className="input-label">
                      <Sliders className="h-4 w-4 text-cyan-400" />
                      <span>Automatic Case Formatting</span>
                    </label>
                    <CustomSelect
                      value={settings.format_mode}
                      onChange={(val) => setSettings({ ...settings, format_mode: val })}
                      options={[
                        { value: "none", label: "Plain Output (No adjustments)" },
                        { value: "camel", label: "camelCase (variables)" },
                        { value: "snake", label: "snake_case (database/files)" },
                        { value: "pascal", label: "PascalCase (classes/components)" },
                        { value: "upper", label: "UPPERCASE (shouting/SQL)" }
                      ]}
                    />
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
                    <CustomSelect
                      value={settings.injection_method}
                      onChange={(val) => setSettings({ ...settings, injection_method: val })}
                      options={[
                        { value: "paste", label: "Clipboard Paste (Instant & Safe)" },
                        { value: "type", label: "Virtual Key Typing (Compatible with consoles)" }
                      ]}
                    />
                    <p className="input-help">Pasting is recommended for long transcripts. Typing is compatible everywhere.</p>
                  </div>
 
                  {/* Real-time Streaming Mode Selection */}
                  <div className="input-group">
                    <label className="input-label">
                      <Zap className="h-4 w-4 text-cyan-400" />
                      <span>Real-time Streaming Mode</span>
                    </label>
                    <CustomSelect
                      value={settings.streaming_mode ? "true" : "false"}
                      onChange={(val) => setSettings({ ...settings, streaming_mode: val === "true" })}
                      options={[
                        { value: "false", label: "Standard Mode (For < 30s quick dictation)" },
                        { value: "true", label: "Streaming Mode (For long recording, instant results)" }
                      ]}
                    />
                    <p className="input-help">Background chunk transcription gives near-instant results for long notes.</p>
                  </div>
 
                   {/* AI Hallucination Filter */}
                  <div className="input-group" style={{ gridColumn: "1 / -1" }}>
                    <label className="input-label">
                      <ShieldAlert className="h-4 w-4 text-cyan-400" />
                      <span>AI Hallucination Filter</span>
                    </label>
                    <CustomSelect
                      value={settings.filter_hallucinations ? "true" : "false"}
                      onChange={(val) => setSettings({ ...settings, filter_hallucinations: val === "true" })}
                      options={[
                        { value: "true", label: "Enabled (Strips musical notes & subtitle watermarks)" },
                        { value: "false", label: "Disabled (Raw AI output)" }
                      ]}
                    />
                    <p className="input-help">Whisper sometimes hallucinates song lyrics or "Thank you" during silence. Keep this enabled to automatically discard them.</p>
                  </div>

                  {/* Whisper Language Lock */}
                  <div className="input-group" style={{ gridColumn: "1 / -1" }}>
                    <label className="input-label">
                      <Globe className="h-4 w-4 text-cyan-400" />
                      <span>Transcription Language</span>
                    </label>
                    <CustomSelect
                      value={settings.whisper_language ?? "auto"}
                      onChange={(val) => {
                        const updated = { ...settings, whisper_language: val };
                        setSettings(updated);
                        invoke("update_settings", { settings: updated }).catch(console.error);
                      }}
                      options={[
                        { value: "auto", label: "Auto-detect (Default — no filter)" },
                        { value: "en", label: "English" },
                        { value: "hi", label: "Hindi" },
                        { value: "es", label: "Spanish" },
                        { value: "fr", label: "French" },
                        { value: "de", label: "German" },
                        { value: "zh", label: "Chinese (Mandarin)" },
                        { value: "ja", label: "Japanese" },
                        { value: "ko", label: "Korean" },
                        { value: "pt", label: "Portuguese" },
                        { value: "ru", label: "Russian" },
                        { value: "ar", label: "Arabic" },
                        { value: "it", label: "Italian" },
                      ]}
                    />
                    <p className="input-help">Locking to a specific language speeds up transcription by ~15–20% and eliminates cross-language hallucinations. Leave on Auto-detect for multilingual environments.</p>
                  </div>
                </div>
              </div>

              {/* Submit Save button */}
              <div className="form-actions" style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 20 }}>
                <button
                  type="button"
                  onClick={handleRestoreRecommended}
                  className="btn-glass"
                  style={{ 
                    padding: "12px 20px", 
                    fontSize: "13px", 
                    fontWeight: 600,
                    borderRadius: "12px",
                    cursor: "pointer"
                  }}
                >
                  Restore Defaults (Recommended)
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !hasChanges}
                  className="btn-primary"
                  style={{ margin: 0 }}
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
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                {downloadProgress !== null && <span>{Math.round(downloadProgress)}%</span>}
                              </div>
                            ) : (
                              "Load Model"
                            )}
                          </button>
                        ) : (
                          <button
                            disabled={loadingModelKey !== null}
                            onClick={() => handleLoadOrDownloadModel(m.key)}
                            className="btn-download"
                            style={isModelLoading && downloadProgress !== null ? { 
                              background: `linear-gradient(to right, rgba(6, 182, 212, 0.4) ${downloadProgress}%, rgba(255,255,255,0.05) ${downloadProgress}%)`,
                              borderColor: 'rgba(6, 182, 212, 0.5)'
                            } : {}}
                          >
                            {isModelLoading ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                {downloadProgress !== null && <span>{Math.round(downloadProgress)}%</span>}
                              </div>
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
                <span>Models cached locally at: <strong>{modelsDir || "Loading..."}</strong></span>
              </div>
            </div>
          )}

          {/* Tab 3: Microphone Selection */}
          {activeTab === "mic" && (
            <div className="models-tab-layout">
              <p className="input-help" style={{ marginBottom: 16, fontSize: 12 }}>
                Select the audio input device to use for voice dictation. The selected microphone will be used for all recordings.
              </p>

              {/* Custom Permission Banners */}
              {micPermissionState === "prompt" && (
                <div className="mic-permission-banner">
                  <Mic className="h-5 w-5 text-cyan-400" style={{ flexShrink: 0 }} />
                  <div className="banner-text">
                    <h4>Microphone Access Required</h4>
                    <p>Enable live voice reacting bars and mic preview levels inside settings.</p>
                  </div>
                  <button onClick={requestMicPermission} className="btn-cyan">
                    Enable Preview
                  </button>
                </div>
              )}

              {micPermissionState === "denied" && (
                <div className="mic-permission-banner denied">
                  <AlertTriangle className="h-5 w-5 text-red-400" style={{ flexShrink: 0 }} />
                  <div className="banner-text">
                    <h4>Microphone Access Blocked</h4>
                    <p>Live visualizers are disabled. Please unblock microphone access in your Windows settings.</p>
                  </div>
                </div>
              )}

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
                      onClick={() => {
                        setSelectedMic(mic);
                        const updated = { ...settings, mic_device: mic };
                        setSettings(updated);
                        autoSaveSettings(updated);
                      }}
                      style={{ 
                        cursor: "pointer", 
                        textAlign: "left", 
                        width: "100%", 
                        background: "none",
                        position: "relative",
                        paddingBottom: "22px", // gives room for the absolute visualizer bar at the bottom
                        overflow: "hidden"
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
                      {/* Live reacting voice bar (render for all input devices using pre-resolved IDs) */}
                      {micPermissionState === "granted" && micDeviceIds[mic] && <MicVisualizer deviceId={micDeviceIds[mic]} />}
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
