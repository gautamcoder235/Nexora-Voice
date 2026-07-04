import React, { useState, useRef, useEffect, useCallback } from "react";
import { Keyboard } from "lucide-react";

interface HotkeyCaptureProps {
  value: string;
  onChange: (hotkey: string) => void;
  label?: string;
}

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "OS"]);

export const HotkeyCapture: React.FC<HotkeyCaptureProps> = ({ value, onChange, label }) => {
  const [isCapturing, setIsCapturing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const parseKeys = (hotkey: string) =>
    hotkey ? hotkey.split("+").map((k) => k.trim()).filter(Boolean) : [];

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        if (!e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
          // If pure escape, just set escape if they want it
          onChange("Escape");
        }
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
      {label && (
        <label className="input-label">
          <Keyboard className="h-4 w-4 text-cyan-400" />
          <span>{label}</span>
        </label>
      )}

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
              Click away to cancel
            </span>
          </>
        ) : (
          <>
            {keys.length === 0 ? (
              <span style={{ color: "rgba(148,163,184,0.5)", fontSize: 13, fontStyle: "italic" }}>
                Click to set shortcut…
              </span>
            ) : (
              keys.map((k, i) => {
                const displayKey = k === "Control" ? "Ctrl" : k;
                return (
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
                      {displayKey}
                    </span>
                  </React.Fragment>
                );
              })
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
    </div>
  );
};
