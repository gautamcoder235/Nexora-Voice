import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import { 
  Settings, 
  Volume2, 
  Play, 
  Pause, 
  Copy, 
  Sparkles, 
  Mic, 
  FileText, 
  RefreshCw
} from "lucide-react";
import { SettingsDashboard } from "./SettingsDashboard";

interface TtsLog {
  id: string;
  timestamp: string;
  text: string;
  voice: string;
  speed: number;
  pitch: number;
  file_path: string;
  char_count: number;
}

interface DictationLog {
  id: string;
  timestamp: string;
  text: string;
  elapsed_ms: number;
  mode: string;
  audio_duration_ms: number;
}

export const TtsDashboard: React.FC = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("Alloy");
  const [speed, setSpeed] = useState(1.0);
  const [pitch, setPitch] = useState(1.0);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // History States
  const [ttsHistory, setTtsHistory] = useState<TtsLog[]>([]);
  const [sttHistory, setSttHistory] = useState<DictationLog[]>([]);
  const [historyTab, setHistoryTab] = useState<"tts" | "stt">("tts");

  // Audio Player States
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPlayingLocal, setIsPlayingLocal] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioProgress, setAudioProgress] = useState(0);
  const [activePlayerText, setActivePlayerText] = useState("No audio loaded");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Curated Voices list
  const voicesList = ["Alloy", "Echo", "Fable", "Onyx", "Nova", "Shimmer"];

  useEffect(() => {
    // Initial fetch of histories
    loadHistories();

    // Event Listeners for update broadcasts
    const unlistenSTT = listen<DictationLog[]>("history-updated", (event) => {
      setSttHistory(event.payload);
    });

    const unlistenTTS = listen<TtsLog[]>("tts-history-updated", (event) => {
      setTtsHistory(event.payload);
    });

    return () => {
      unlistenSTT.then((fn) => fn());
      unlistenTTS.then((fn) => fn());
    };
  }, []);

  const loadHistories = async () => {
    try {
      const ttsData: TtsLog[] = await invoke("get_tts_history");
      setTtsHistory(ttsData);

      const sttData: DictationLog[] = await invoke("get_history");
      setSttHistory(sttData);
    } catch (e) {
      console.error("Failed to load history logs", e);
    }
  };

  // Local Web Speech synthesis
  const handleListenLocal = () => {
    if (!text.trim()) return;

    // Stop current synthesis if speaking
    window.speechSynthesis.cancel();
    setPlayingId("local-browser");
    setIsPlayingLocal(true);
    setActivePlayerText(`Offline Synthesis: ${text.slice(0, 40)}...`);

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Attempt to match selected voice name
    const browserVoices = window.speechSynthesis.getVoices();
    const matchedVoice = browserVoices.find(
      (v) => v.name.toLowerCase().includes(voice.toLowerCase())
    );
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }
    
    utterance.rate = speed;
    utterance.pitch = pitch;

    utterance.onend = () => {
      setPlayingId(null);
      setIsPlayingLocal(false);
    };

    utterance.onerror = () => {
      setPlayingId(null);
      setIsPlayingLocal(false);
    };

    speechUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  // OpenAI Premium synthesis
  const handleGeneratePremium = async () => {
    if (!text.trim()) return;
    setIsGenerating(true);

    try {
      const logEntry: TtsLog = await invoke("generate_tts_audio", {
        payload: { text, voice, speed, pitch }
      });
      
      // Load and play the generated audio
      playCachedFile(logEntry);
    } catch (err: any) {
      console.error(err);
      alert(`Synthesis Failed: ${err}. Please ensure OPENAI_API_KEY is configured in your system environment.`);
    } finally {
      setIsGenerating(false);
    }
  };

  const playCachedFile = (log: TtsLog) => {
    // Stop local speech if speaking
    window.speechSynthesis.cancel();
    setIsPlayingLocal(false);

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const assetUrl = convertFileSrc(log.file_path);
    setAudioUrl(assetUrl);
    setPlayingId(log.id);
    setActivePlayerText(`Synthesized Speech: ${log.text.slice(0, 40)}...`);

    const audio = new Audio(assetUrl);
    audio.playbackRate = log.speed;
    audioRef.current = audio;

    audio.addEventListener("loadedmetadata", () => {
      setAudioDuration(audio.duration);
    });

    audio.addEventListener("timeupdate", () => {
      setAudioProgress(audio.currentTime);
    });

    audio.addEventListener("ended", () => {
      setPlayingId(null);
    });

    audio.play().catch((err) => {
      console.error("Audio playback failed", err);
      alert("Failed to play the cached audio file.");
      setPlayingId(null);
    });
  };

  const toggleAudioPlayback = () => {
    if (isPlayingLocal) {
      window.speechSynthesis.cancel();
      setIsPlayingLocal(false);
      setPlayingId(null);
      return;
    }

    if (audioRef.current) {
      if (audioRef.current.paused) {
        audioRef.current.play();
        if (playingId === null && ttsHistory.length > 0) {
          setPlayingId(ttsHistory[0].id);
        }
      } else {
        audioRef.current.pause();
      }
      // Force update by triggering state toggle locally
      setPlayingId((prev) => (prev ? prev : "active"));
    }
  };

  const handleClearTtsHistory = async () => {
    if (!confirm("Are you sure you want to clear all TTS synthesis history? Cached audio files will remain in storage.")) return;
    try {
      await invoke("clear_tts_history");
      setTtsHistory([]);
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearSttHistory = async () => {
    if (!confirm("Are you sure you want to clear your dictation history logs?")) return;
    try {
      await invoke("clear_history");
      setSttHistory([]);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopyToClipboard = (val: string) => {
    navigator.clipboard.writeText(val);
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

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setAudioProgress(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const isAudioPlaying = audioRef.current && !audioRef.current.paused;

  return (
    <div className="app-container" style={{ display: "flex", flexDirection: "column", padding: "16px 20px", height: "100vh", overflow: "hidden" }}>
      {/* Background Orbs */}
      <div className="glow-orb orb-1" />
      <div className="glow-orb orb-2" />
      
      {/* Main Header */}
      <header style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center", 
        marginBottom: "16px", 
        zIndex: 5,
        background: "rgba(255, 255, 255, 0.02)",
        backdropFilter: "blur(8px)",
        padding: "10px 18px",
        borderRadius: "16px",
        border: "1px solid rgba(255, 255, 255, 0.05)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            background: "linear-gradient(135deg, #06b6d4 0%, #8b5cf6 100%)",
            width: 32,
            height: 32,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 12px rgba(6, 182, 212, 0.4)"
          }}>
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, background: "linear-gradient(to right, #fff, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Nexora Studio
            </h1>
            <span style={{ fontSize: 9, color: "rgba(255, 255, 255, 0.4)", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", display: "inline-block" }} /> Ready
            </span>
          </div>
        </div>

        <button 
          onClick={() => setIsSettingsOpen(true)}
          className="btn-glass"
          style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
        >
          <Settings className="h-4 w-4 text-cyan-400" />
          <span style={{ fontSize: 11, fontWeight: 600 }}>Settings</span>
        </button>
      </header>

      {/* Main Workspace Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "16px", flexGrow: 1, maxHeight: "calc(100vh - 270px)", minHeight: 0, zIndex: 5 }}>
        
        {/* Left Workspace: Text Input panel */}
        <div className="glass-panel" style={{ display: "flex", flexDirection: "column", padding: "18px", gap: "14px", height: "100%", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)", margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <FileText className="h-4 w-4 text-cyan-400" /> Text to Speech
            </h3>
            <span style={{ fontSize: 10, color: text.length > 900 ? "#f87171" : "rgba(255,255,255,0.4)" }}>
              {text.length} / 1000
            </span>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 1000))}
            placeholder="Type or paste your content here... Synthesize using offline local voice, or premium OpenAI cloud voice."
            style={{
              flexGrow: 1,
              width: "100%",
              background: "rgba(0,0,0,0.25)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "12px",
              padding: "14px",
              color: "#fff",
              fontFamily: "inherit",
              fontSize: 13,
              resize: "none",
              outline: "none",
              lineHeight: 1.6,
              transition: "border-color 0.2s"
            }}
            onFocus={(e) => e.target.style.borderColor = "rgba(6, 182, 212, 0.4)"}
            onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.06)"}
          />

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={() => setText("")}
              className="btn-glass"
              style={{ padding: "10px 16px", cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.5)" }}
              disabled={!text.trim()}
            >
              Clear
            </button>

            <button
              onClick={handleListenLocal}
              className="btn-glass"
              style={{ flexGrow: 1, padding: "10px 16px", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
              disabled={!text.trim() || isGenerating}
            >
              <Volume2 className="h-4 w-4 text-cyan-400" />
              Listen (Local)
            </button>

            <button
              onClick={handleGeneratePremium}
              style={{
                flexGrow: 1,
                background: "linear-gradient(135deg, #06b6d4 0%, #8b5cf6 100%)",
                border: "none",
                borderRadius: "10px",
                color: "#fff",
                fontWeight: 600,
                fontSize: 12,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                boxShadow: "0 4px 15px rgba(6, 182, 212, 0.3)",
                transition: "transform 0.15s, opacity 0.2s"
              }}
              disabled={!text.trim() || isGenerating}
              onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-1px)"}
              onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
            >
              {isGenerating ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 text-cyan-200" />
              )}
              {isGenerating ? "Synthesizing..." : "Generate (Premium)"}
            </button>
          </div>
        </div>

        {/* Right Workspace: Configs Sidebar & Player */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", height: "100%", overflow: "hidden" }}>
          
          {/* Voice Settings card */}
          <div className="glass-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)", margin: 0 }}>
              Voice Attributes
            </h3>

            {/* Voice select */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Select Voice Model</label>
              <select
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#fff",
                  fontSize: 12,
                  outline: "none",
                  cursor: "pointer"
                }}
              >
                {voicesList.map((v) => (
                  <option key={v} value={v} style={{ background: "#0b0f19", color: "#fff" }}>{v}</option>
                ))}
              </select>
            </div>

            {/* Speed slider */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Speed Rate</label>
                <span style={{ fontSize: 10, color: "#06b6d4", fontFamily: "monospace" }}>{speed.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                style={{ width: "100%", accentColor: "#06b6d4", height: 4 }}
              />
            </div>

            {/* Pitch slider */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Pitch Tone</label>
                <span style={{ fontSize: 10, color: "#8b5cf6", fontFamily: "monospace" }}>{pitch.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.1"
                value={pitch}
                onChange={(e) => setPitch(parseFloat(e.target.value))}
                style={{ width: "100%", accentColor: "#8b5cf6", height: 4 }}
              />
            </div>
          </div>

          {/* Active Audio Player Visualizer Card */}
          <div className="glass-panel" style={{
            flexGrow: 1,
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            background: "linear-gradient(135deg, rgba(6, 182, 212, 0.03) 0%, rgba(139, 92, 246, 0.03) 100%)",
            border: "1px solid rgba(6, 182, 212, 0.1)",
            position: "relative",
            overflow: "hidden"
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, zIndex: 2 }}>
              <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "1px", color: "rgba(255,255,255,0.3)" }}>Active Player</span>
              <p style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.85)", margin: 0, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                {activePlayerText}
              </p>
            </div>

            {/* Ambient waveform visualization */}
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 3, height: 40, zIndex: 1 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((idx) => {
                const isPlaying = isPlayingLocal || isAudioPlaying;
                const animDuration = `${0.6 + Math.random() * 0.8}s`;
                return (
                  <div
                    key={idx}
                    style={{
                      width: 3,
                      height: isPlaying ? "80%" : "20%",
                      borderRadius: 1,
                      background: "linear-gradient(to top, #06b6d4, #8b5cf6)",
                      animation: isPlaying ? `pulse-bar ${animDuration} infinite ease-in-out` : "none",
                      transition: "height 0.2s"
                    }}
                  />
                );
              })}
            </div>

            {/* Custom controls layout */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, zIndex: 2 }}>
              {/* Progress bar */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", width: 28, textAlign: "right" }}>{formatTime(audioProgress)}</span>
                <input
                  type="range"
                  min="0"
                  max={audioDuration || 100}
                  value={audioProgress}
                  onChange={handleSeek}
                  style={{ flexGrow: 1, height: 3, accentColor: "#06b6d4" }}
                />
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", width: 28 }}>{formatTime(audioDuration)}</span>
              </div>

              {/* Seeker / Controls row */}
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                <button
                  onClick={toggleAudioPlayback}
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                >
                  {isPlayingLocal || isAudioPlaying ? (
                    <Pause className="h-4 w-4 text-cyan-400" />
                  ) : (
                    <Play className="h-4 w-4 text-white fill-current ml-0.5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CSS Animation injection */}
      <style>{`
        @keyframes pulse-bar {
          0%, 100% { height: 15%; }
          50% { height: 95%; }
        }
      `}</style>

      {/* Bottom Layout: Double history logs */}
      <div className="glass-panel" style={{ 
        marginTop: "16px", 
        display: "flex", 
        flexDirection: "column", 
        padding: "16px",
        height: "230px",
        minHeight: 0,
        zIndex: 5
      }}>
        {/* History workspace navigation tabs */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 10, marginBottom: 12 }}>
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={() => setHistoryTab("tts")}
              style={{
                background: "none",
                border: "none",
                color: historyTab === "tts" ? "#06b6d4" : "rgba(255,255,255,0.4)",
                fontWeight: 600,
                fontSize: 12,
                cursor: "pointer",
                padding: "4px 8px",
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 6
              }}
            >
              <Volume2 className="h-3.5 w-3.5" />
              Speech History
              {historyTab === "tts" && (
                <div style={{ position: "absolute", bottom: -11, left: 0, right: 0, height: 2, background: "#06b6d4" }} />
              )}
            </button>

            <button
              onClick={() => setHistoryTab("stt")}
              style={{
                background: "none",
                border: "none",
                color: historyTab === "stt" ? "#8b5cf6" : "rgba(255,255,255,0.4)",
                fontWeight: 600,
                fontSize: 12,
                cursor: "pointer",
                padding: "4px 8px",
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 6
              }}
            >
              <Mic className="h-3.5 w-3.5" />
              Dictation Logs
              {historyTab === "stt" && (
                <div style={{ position: "absolute", bottom: -11, left: 0, right: 0, height: 2, background: "#8b5cf6" }} />
              )}
            </button>
          </div>

          {/* Action Row */}
          {historyTab === "tts" && ttsHistory.length > 0 && (
            <button 
              onClick={handleClearTtsHistory}
              className="btn-glass"
              style={{ fontSize: 10, padding: "4px 10px", color: "#f87171", borderColor: "rgba(239, 68, 68, 0.2)", cursor: "pointer" }}
            >
              Clear Logs
            </button>
          )}

          {historyTab === "stt" && sttHistory.length > 0 && (
            <button 
              onClick={handleClearSttHistory}
              className="btn-glass"
              style={{ fontSize: 10, padding: "4px 10px", color: "#f87171", borderColor: "rgba(239, 68, 68, 0.2)", cursor: "pointer" }}
            >
              Clear Logs
            </button>
          )}
        </div>

        {/* List render area */}
        <div style={{ flexGrow: 1, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: 8 }}>
          {historyTab === "tts" ? (
            ttsHistory.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
                No speech history logged. Synthesize something to get started!
              </div>
            ) : (
              ttsHistory.map((item) => (
                <div
                  key={item.id}
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.04)",
                    borderRadius: "10px",
                    padding: "10px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flexGrow: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>{item.timestamp}</span>
                      <span style={{ fontSize: 8, fontWeight: 600, padding: "1px 5px", borderRadius: 4, background: "rgba(6, 182, 212, 0.1)", color: "#22d3ee" }}>
                        Voice: {item.voice} • {item.speed}x
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", margin: 0, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                      {item.text}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => playCachedFile(item)}
                      style={{
                        background: "rgba(6, 182, 212, 0.1)",
                        border: "1px solid rgba(6, 182, 212, 0.2)",
                        color: "#22d3ee",
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer"
                      }}
                      title="Play Cached Speech"
                    >
                      <Play className="h-3 w-3 fill-current ml-0.5" />
                    </button>
                    <button
                      onClick={() => handleCopyToClipboard(item.text)}
                      className="btn-glass"
                      style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                      title="Copy Synthesized Text"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))
            )
          ) : (
            sttHistory.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
                No dictation logs found yet. Press your hotkey to record.
              </div>
            ) : (
              sttHistory.map((item) => (
                <div
                  key={item.id}
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.04)",
                    borderRadius: "10px",
                    padding: "10px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flexGrow: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {/* Time Badge */}
                      <span 
                        style={{ 
                          fontSize: 9, 
                          fontWeight: 500,
                          padding: "3px 8px", 
                          borderRadius: "6px", 
                          background: "rgba(255, 255, 255, 0.05)", 
                          color: "rgba(255, 255, 255, 0.6)",
                          fontFamily: "monospace"
                        }}
                      >
                        {formatTimeOnly(item.timestamp)}
                      </span>

                      {/* Word Count Badge */}
                      <span 
                        style={{ 
                          fontSize: 9, 
                          fontWeight: 500,
                          padding: "3px 8px", 
                          borderRadius: "6px", 
                          background: "rgba(255, 255, 255, 0.05)", 
                          color: "rgba(255, 255, 255, 0.6)"
                        }}
                      >
                        {getWordCount(item.text)}
                      </span>

                      {/* Audio Duration Badge */}
                      <span 
                        style={{ 
                          fontSize: 9, 
                          fontWeight: 500,
                          padding: "3px 8px", 
                          borderRadius: "6px", 
                          background: "rgba(255, 255, 255, 0.05)", 
                          color: "rgba(255, 255, 255, 0.6)",
                          fontFamily: "monospace"
                        }}
                      >
                        {formatDurationOnly(item.audio_duration_ms)}
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", margin: 0, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                      {item.text}
                    </p>
                  </div>

                  <button
                    onClick={() => handleCopyToClipboard(item.text)}
                    className="btn-glass"
                    style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                    title="Copy Transcript Text"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              ))
            )
          )}
        </div>
      </div>

      {/* Modal Settings panel */}
      <SettingsDashboard isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};
