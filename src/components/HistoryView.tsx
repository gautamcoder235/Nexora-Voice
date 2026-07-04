import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { History as HistoryIcon, Trash2, Copy, AlertCircle } from "lucide-react";

interface DictationLog {
  id: string;
  timestamp: string;
  text: string;
  elapsed_ms: number;
  mode: string;
  audio_duration_ms: number;
}

export const HistoryView: React.FC = () => {
  const [history, setHistory] = useState<DictationLog[]>([]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    loadHistory();

    const unlistenSTT = listen<DictationLog[]>("history-updated", (event) => {
      setHistory(event.payload);
    });

    return () => {
      unlistenSTT.then((fn) => fn());
    };
  }, []);

  const loadHistory = async () => {
    try {
      const data: DictationLog[] = await invoke("get_history");
      setHistory(data);
    } catch (e) {
      console.error("Failed to load history logs", e);
    }
  };

  const handleCopyToClipboard = (val: string) => {
    navigator.clipboard.writeText(val);
  };

  const handleClearHistory = async () => {
    try {
      await invoke("clear_history");
      setHistory([]);
      setShowClearConfirm(false);
    } catch (e) {
      console.error(e);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", overflow: "hidden", minWidth: 0, boxSizing: "border-box" }}>
      {/* Title block */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
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
            <HistoryIcon className="h-5 w-5 text-slate-300" />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "#fff", letterSpacing: "-0.01em" }}>
              Dictation History
            </h1>
            <span style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.45)" }}>
              A record of your voice dictations and transcripts.
            </span>
          </div>
        </div>

        {history.length > 0 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="btn-glass"
            style={{ padding: "6px 12px", display: "flex", alignItems: "center", gap: 6, borderColor: "rgba(239, 68, 68, 0.25)", color: "#f87171", cursor: "pointer" }}
          >
            <Trash2 className="h-4 w-4" />
            <span>Clear History</span>
          </button>
        )}
      </div>

      {/* History scroll list */}
      <div style={{ flexGrow: 1, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: 12, paddingRight: 4 }}>
        {history.length === 0 ? (
          <div className="glass-panel" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", gap: 12 }}>
            <AlertCircle className="h-8 w-8 text-slate-500" />
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, textAlign: "center" }}>
              No dictation logs found yet. Press your global shortcut to dictate!
            </span>
          </div>
        ) : (
          history.map((item, idx) => (
            <div
              key={item.id}
              className="glass-panel animate-row-in"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                padding: "16px 20px",
                animationDelay: `${idx * 0.04}s`,
              }}
            >
              {/* Badges bar */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  {/* Time Badge */}
                  <span style={{ 
                    fontSize: 9, 
                    fontWeight: 500,
                    padding: "3px 8px", 
                    borderRadius: "6px", 
                    background: "rgba(255, 255, 255, 0.05)", 
                    color: "rgba(255, 255, 255, 0.6)",
                    fontFamily: "monospace"
                  }}>
                    {formatTimeOnly(item.timestamp)}
                  </span>

                  {/* Word Count Badge */}
                  <span style={{ 
                    fontSize: 9, 
                    fontWeight: 500,
                    padding: "3px 8px", 
                    borderRadius: "6px", 
                    background: "rgba(255, 255, 255, 0.05)", 
                    color: "rgba(255, 255, 255, 0.6)"
                  }}>
                    {getWordCount(item.text)}
                  </span>

                  {/* Audio Duration Badge */}
                  <span style={{ 
                    fontSize: 9, 
                    fontWeight: 500,
                    padding: "3px 8px", 
                    borderRadius: "6px", 
                    background: "rgba(255, 255, 255, 0.05)", 
                    color: "rgba(255, 255, 255, 0.6)",
                    fontFamily: "monospace"
                  }}>
                    {formatDurationOnly(item.audio_duration_ms)}
                  </span>

                  <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: item.mode === "Streaming" ? "rgba(6, 182, 212, 0.1)" : "rgba(168, 85, 247, 0.1)", color: item.mode === "Streaming" ? "#22d3ee" : "#c084fc" }}>
                    {item.mode} • {(item.elapsed_ms / 1000).toFixed(2)}s
                  </span>
                </div>

                <button
                  onClick={() => handleCopyToClipboard(item.text)}
                  className="btn-glass"
                  style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
                  title="Copy Transcript Text"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>

              {/* Transcript Text content */}
              <p style={{
                fontSize: 13,
                color: "rgba(255, 255, 255, 0.95)",
                lineHeight: 1.6,
                margin: 0,
                textAlign: "left",
                userSelect: "text",
                wordBreak: "break-word",
                whiteSpace: "pre-wrap"
              }}>
                {item.text}
              </p>
            </div>
          ))
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 12, borderTop: "1px solid rgba(255, 255, 255, 0.04)", fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 12 }}>
        <span>Showing last <strong>{history.length}</strong> transcription entries (audio files are never saved)</span>
      </div>

      {/* Custom Confirmation Modal */}
      {showClearConfirm && (
        <div style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
        }}>
          <div style={{
            background: "rgba(15, 23, 42, 0.95)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "16px",
            padding: "24px",
            width: "360px",
            boxShadow: "0 20px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)"
          }}>
            <h3 style={{ margin: "0 0 12px 0", color: "#fff", fontSize: "18px", fontWeight: 600 }}>Clear History</h3>
            <p style={{ margin: "0 0 24px 0", color: "rgba(255,255,255,0.65)", fontSize: "14px", lineHeight: "1.5" }}>
              Are you sure you want to clear your dictation history logs? This action cannot be undone.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button 
                className="btn-glass"
                onClick={() => setShowClearConfirm(false)}
                style={{ padding: "8px 16px", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button 
                style={{
                  background: "#ef4444",
                  color: "#fff",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(239,68,68,0.3)"
                }}
                onClick={handleClearHistory}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
