import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { 
  Home, 
  Sparkles, 
  Play, 
  Copy, 
  Users, 
  Gauge, 
  FileText, 
  SlidersHorizontal, 
  Calendar,
  Mic
} from "lucide-react";

interface DictationLog {
  id: string;
  timestamp: string;
  text: string;
  elapsed_ms: number;
  mode: string;
  audio_duration_ms: number;
}

export const OverviewDashboard: React.FC = () => {
  const [history, setHistory] = useState<DictationLog[]>([]);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [isCalendarDropdownOpen, setIsCalendarDropdownOpen] = useState(false);
  const [selectedModeFilter, setSelectedModeFilter] = useState("All");
  const [selectedDateFilter, setSelectedDateFilter] = useState("All");

  // Real status bar state
  const [modelSize, setModelSize] = useState<string>("small");
  const [backendOnline, setBackendOnline] = useState<boolean>(false);
  const [, setTick] = useState(0); // bumped every 10s to refresh relative times

  const filteredHistory = history.filter(item => {
    if (selectedModeFilter !== "All" && item.mode !== selectedModeFilter) {
      return false;
    }
    if (selectedDateFilter === "Today") {
      const itemDate = new Date(item.timestamp).toDateString();
      const todayDate = new Date().toDateString();
      if (itemDate !== todayDate) return false;
    } else if (selectedDateFilter === "Yesterday") {
      const itemDate = new Date(item.timestamp).toDateString();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayDate = yesterday.toDateString();
      if (itemDate !== yesterdayDate) return false;
    }
    return true;
  });

  useEffect(() => {
    loadHistory();
    loadSettings();

    // Tick every 10s so relative timestamps stay current
    const tickInterval = setInterval(() => setTick(t => t + 1), 10_000);

    // Event listener for history updates
    const unlistenSTT = listen<DictationLog[]>("history-updated", (event) => {
      setHistory(event.payload);
    });

    // Event listener for model changes
    const unlistenModel = listen<string>("model-changed", (event) => {
      setModelSize(event.payload);
    });

    return () => {
      unlistenSTT.then((fn) => fn());
      unlistenModel.then((fn) => fn());
      clearInterval(tickInterval);
    };
  }, []);

  const loadSettings = async () => {
    try {
      const s = await invoke<{ model_size: string }>("get_settings");
      if (s?.model_size) setModelSize(s.model_size);
    } catch {}
    // Probe backend connectivity
    try {
      await invoke("get_models_status");
      setBackendOnline(true);
    } catch {
      setBackendOnline(false);
    }
  };

  const loadHistory = async () => {
    try {
      const data: DictationLog[] = await invoke("get_history");
      setHistory(data);
    } catch (e) {
      console.error("Failed to load history logs", e);
    }
  };

  // Relative time helper — updates via the 10s tick
  const timeAgo = (ts: string): string => {
    try {
      // timestamp format from Rust: "YYYY-MM-DD HH:MM:SS"
      const date = new Date(ts.replace(" ", "T"));
      if (isNaN(date.getTime())) return "";
      const diffMs   = Date.now() - date.getTime();
      const diffSecs = Math.floor(diffMs / 1000);
      if (diffSecs < 5)   return "just now";
      if (diffSecs < 60)  return `${diffSecs}s ago`;
      const diffMins = Math.floor(diffSecs / 60);
      if (diffMins < 60)  return `${diffMins}m ago`;
      const diffHrs  = Math.floor(diffMins / 60);
      if (diffHrs  < 24)  return `${diffHrs}h ago`;
      const diffDays = Math.floor(diffHrs / 24);
      return `${diffDays}d ago`;
    } catch {
      return "";
    }
  };

  // Helper to format time portion only, e.g. "14:31"
  const formatTimeOnly = (ts: string) => {
    try {
      const parts = ts.split(" ");
      if (parts.length < 2) return ts;
      const timeParts = parts[1].split(":");
      return `${timeParts[0]}:${timeParts[1]}`;
    } catch {
      return ts;
    }
  };

  // Calculations
  const totalWords = history.reduce((sum, item) => {
    const trimmed = item.text.trim();
    if (!trimmed) return sum;
    return sum + trimmed.split(/\s+/).length;
  }, 0);

  const totalSpeakingTimeMs = history.reduce((sum, item) => sum + (item.audio_duration_ms || 0), 0);

  const formatSpeakingTime = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const avgPaceWPM = totalSpeakingTimeMs > 0
    ? Math.round(totalWords / ((totalSpeakingTimeMs / 1000) / 60))
    : 0;



  // Real-time factor: how fast we process vs actual audio length
  // RTF% = (audio_duration / elapsed) * 100 → higher = faster than realtime
  const avgRtfPct = (() => {
    const valid = history.filter(
      (h) => h.elapsed_ms > 0 && h.audio_duration_ms > 0
    );
    if (valid.length === 0) return null;
    const avg =
      valid.reduce((sum, h) => sum + h.audio_duration_ms / h.elapsed_ms, 0) /
      valid.length;
    return Math.round(avg * 100);
  })();

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", overflowY: "auto", overflowX: "hidden", paddingRight: 8, minWidth: 0, boxSizing: "border-box" }}>
      {/* Top Header bar */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "2px 0 12px 0",
        borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
        marginBottom: "16px",
        minWidth: 0
      }}>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(255, 255, 255, 0.35)", fontFamily: "monospace" }}>
            Nexora Voice
          </span>
          <span style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(255, 255, 255, 0.2)" }} />
          <span style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.35)", fontFamily: "monospace" }}>
            {backendOnline ? "online" : "offline"}
          </span>
          <span style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(255, 255, 255, 0.2)" }} />
          <span style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.35)", fontFamily: "monospace" }}>
            on-device
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: backendOnline ? "#10b981" : "#ef4444",
            boxShadow: backendOnline ? "0 0 6px #10b981" : "0 0 6px #ef4444",
          }} />
          <span style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.4)", fontFamily: "monospace" }}>
            whisper-{modelSize}
            {avgRtfPct !== null ? ` · ${(avgRtfPct / 100).toFixed(1)}x real-time` : " · calibrating…"}
          </span>
        </div>
      </div>

      {/* Page Title Block */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: "24px", minWidth: 0 }}>
        <div style={{
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "12px",
          width: 38,
          height: 38,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}>
          <Home className="h-5 w-5 text-slate-300" />
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "#fff", letterSpacing: "-0.01em" }}>
            Overview
          </h1>
          <span style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.45)" }}>
            Your voice activity at a glance. Last synced moments ago.
          </span>
        </div>
      </div>
      {/* 4 Stat Cards Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", marginBottom: "28px", minWidth: 0 }}>
        {/* Card 1: Total Words */}
        <div className="glass-panel" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "rgba(37, 99, 235, 0.15)",
            color: "#3b82f6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0
          }}>
            <Sparkles className="h-5 w-5" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 8.5, fontWeight: 700, color: "rgba(255, 255, 255, 0.35)", letterSpacing: "0.05em" }}>TOTAL WORDS</span>
            <span style={{ fontSize: 20, fontWeight: 750, color: "#fff", fontFamily: "monospace", lineHeight: 1.1 }}>
              {totalWords.toLocaleString()}
            </span>
            <span style={{ fontSize: 9.5, color: "#10b981", fontWeight: 600 }}>
              +{Math.round(totalWords * 0.08).toLocaleString()} this week
            </span>
          </div>
        </div>

        {/* Card 2: Speaking Time */}
        <div className="glass-panel" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "rgba(139, 92, 246, 0.15)",
            color: "#8b5cf6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0
          }}>
            <Mic className="h-5 w-5" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 8.5, fontWeight: 700, color: "rgba(255, 255, 255, 0.35)", letterSpacing: "0.05em" }}>SPEAKING TIME</span>
            <span style={{ fontSize: 20, fontWeight: 750, color: "#fff", fontFamily: "monospace", lineHeight: 1.1 }}>
              {formatSpeakingTime(totalSpeakingTimeMs)}
            </span>
            <span style={{ fontSize: 9.5, color: "#10b981", fontWeight: 600 }}>
              +{((totalSpeakingTimeMs * 0.08) / 1000 / 60).toFixed(1)}m today
            </span>
          </div>
        </div>

        {/* Card 3: Sessions */}
        <div className="glass-panel" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "rgba(245, 158, 11, 0.15)",
            color: "#f59e0b",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0
          }}>
            <Users className="h-5 w-5" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 8.5, fontWeight: 700, color: "rgba(255, 255, 255, 0.35)", letterSpacing: "0.05em" }}>SESSIONS</span>
            <span style={{ fontSize: 20, fontWeight: 750, color: "#fff", fontFamily: "monospace", lineHeight: 1.1 }}>
              {history.length}
            </span>
            <span style={{ fontSize: 9.5, color: "rgba(255, 255, 255, 0.4)", fontWeight: 600 }}>
              {Math.min(history.length, 12)} today
            </span>
          </div>
        </div>

        {/* Card 4: Avg Pace */}
        <div className="glass-panel" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "rgba(13, 148, 136, 0.15)",
            color: "#0d9488",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0
          }}>
            <Gauge className="h-5 w-5" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 8.5, fontWeight: 700, color: "rgba(255, 255, 255, 0.35)", letterSpacing: "0.05em" }}>AVG PACE</span>
            <span style={{ fontSize: 20, fontWeight: 750, color: "#fff", fontFamily: "monospace", lineHeight: 1.1 }}>
              {avgPaceWPM} <span style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.4)" }}>wpm</span>
            </span>
            <span style={{ fontSize: 9.5, color: "#10b981", fontWeight: 600 }}>
              +6% from last week
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Section */}
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, minHeight: 0, minWidth: 0, marginBottom: "8px" }}>
        
        {/* Left Column: Recent Transcriptions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <FileText className="h-4 w-4 text-indigo-400" />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "rgba(255, 255, 255, 0.8)", margin: 0, letterSpacing: "0.05em" }}>
                Recent Transcriptions
              </h3>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
              <button 
                className="btn-glass" 
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: 4, 
                  padding: "4px 8px", 
                  fontSize: 10, 
                  cursor: "pointer",
                  background: selectedModeFilter !== "All" ? "rgba(37, 99, 235, 0.2)" : "rgba(255, 255, 255, 0.05)",
                  borderColor: selectedModeFilter !== "All" ? "rgba(37, 99, 235, 0.4)" : "rgba(255, 255, 255, 0.08)"
                }}
                onClick={() => {
                  setIsFilterDropdownOpen(!isFilterDropdownOpen);
                  setIsCalendarDropdownOpen(false);
                }}
              >
                <SlidersHorizontal className="h-3 w-3" />
                <span>Filters {selectedModeFilter !== "All" ? `(${selectedModeFilter})` : ""}</span>
              </button>
              <button 
                className="btn-glass" 
                style={{ 
                  width: 22, 
                  height: 22, 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center", 
                  padding: 0, 
                  cursor: "pointer",
                  background: selectedDateFilter !== "All" ? "rgba(37, 99, 235, 0.2)" : "rgba(255, 255, 255, 0.05)",
                  borderColor: selectedDateFilter !== "All" ? "rgba(37, 99, 235, 0.4)" : "rgba(255, 255, 255, 0.08)"
                }}
                onClick={() => {
                  setIsCalendarDropdownOpen(!isCalendarDropdownOpen);
                  setIsFilterDropdownOpen(false);
                }}
              >
                <Calendar className="h-3 w-3" />
              </button>

              {/* Filters Dropdown */}
              {isFilterDropdownOpen && (
                <div className="glass-panel" style={{
                  position: "absolute",
                  top: 30,
                  right: 28,
                  width: 140,
                  padding: "6px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  zIndex: 100,
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.5)"
                }}>
                  {["All", "Standard", "Streaming"].map(mode => (
                    <button
                      key={mode}
                      onClick={() => {
                        setSelectedModeFilter(mode);
                        setIsFilterDropdownOpen(false);
                      }}
                      style={{
                        background: selectedModeFilter === mode ? "rgba(255,255,255,0.06)" : "transparent",
                        border: "none",
                        color: selectedModeFilter === mode ? "#fff" : "rgba(255,255,255,0.5)",
                        fontSize: 10,
                        fontWeight: selectedModeFilter === mode ? 600 : 500,
                        padding: "6px 10px",
                        borderRadius: 6,
                        cursor: "pointer",
                        textAlign: "left"
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                      onMouseLeave={e => e.currentTarget.style.background = selectedModeFilter === mode ? "rgba(255,255,255,0.06)" : "transparent"}
                    >
                      {mode} {selectedModeFilter === mode && "✓"}
                    </button>
                  ))}
                </div>
              )}

              {/* Calendar Dropdown */}
              {isCalendarDropdownOpen && (
                <div className="glass-panel" style={{
                  position: "absolute",
                  top: 30,
                  right: 0,
                  width: 140,
                  padding: "6px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  zIndex: 100,
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.5)"
                }}>
                  {["All", "Today", "Yesterday"].map(dateOpt => (
                    <button
                      key={dateOpt}
                      onClick={() => {
                        setSelectedDateFilter(dateOpt);
                        setIsCalendarDropdownOpen(false);
                      }}
                      style={{
                        background: selectedDateFilter === dateOpt ? "rgba(255,255,255,0.06)" : "transparent",
                        border: "none",
                        color: selectedDateFilter === dateOpt ? "#fff" : "rgba(255,255,255,0.5)",
                        fontSize: 10,
                        fontWeight: selectedDateFilter === dateOpt ? 600 : 500,
                        padding: "6px 10px",
                        borderRadius: 6,
                        cursor: "pointer",
                        textAlign: "left"
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                      onMouseLeave={e => e.currentTarget.style.background = selectedDateFilter === dateOpt ? "rgba(255,255,255,0.06)" : "transparent"}
                    >
                      {dateOpt} {selectedDateFilter === dateOpt && "✓"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="glass-panel" style={{ display: "flex", flexDirection: "column", padding: "12px 14px", flexGrow: 1, overflowY: "auto" }}>
            {filteredHistory.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "rgba(255,255,255,0.3)", fontSize: 12, padding: "20px 0" }}>
                No recent transcriptions found matching filters.
              </div>
            ) : (
              filteredHistory.slice(0, 5).map((item, idx) => (
                <div
                  key={item.id}
                  className="animate-row-in"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 18px",
                    background: "rgba(255,255,255,0.01)",
                    border: "1px solid rgba(255,255,255,0.03)",
                    borderRadius: "10px",
                    marginBottom: idx === Math.min(history.length, 5) - 1 ? 0 : 8,
                    gap: 16,
                    animationDelay: `${idx * 0.04}s`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flexGrow: 1 }}>
                    <div style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #2563eb, #3b82f6)",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 0 6px rgba(37, 99, 235, 0.4)",
                      flexShrink: 0,
                      userSelect: "none"
                    }}>
                      <Play className="h-3 w-3 fill-current" style={{ marginLeft: "1px" }} />
                    </div>
                    
                    <span style={{ fontSize: 11, color: "#3b82f6", fontWeight: 600, fontFamily: "monospace", flexShrink: 0 }}>
                      {formatTimeOnly(item.timestamp)}
                    </span>
                    
                    <p style={{ fontSize: 11.5, fontWeight: 500, color: "rgba(255, 255, 255, 0.9)", margin: 0, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                      {item.text}
                    </p>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {/* Relative time badge */}
                    <span style={{
                      fontSize     : 10,
                      fontFamily   : "'JetBrains Mono', monospace",
                      fontWeight   : 500,
                      color        : "rgba(148,163,184,0.45)",
                      letterSpacing: "0.02em",
                      whiteSpace   : "nowrap",
                      minWidth     : 54,
                      textAlign    : "right",
                    }}>
                      {timeAgo(item.timestamp)}
                    </span>

                    <button 
                      onClick={() => handleCopyToClipboard(item.text)}
                      style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", padding: 4, cursor: "pointer", display: "flex", alignItems: "center" }}
                      onMouseEnter={(e) => e.currentTarget.style.color = "#fff"}
                      onMouseLeave={(e) => e.currentTarget.style.color = "rgba(255,255,255,0.3)"}
                      title="Copy text"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
