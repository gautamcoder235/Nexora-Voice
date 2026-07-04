import React, { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

type OverlayState = "idle" | "listening" | "transcribing";

const BAR_COUNT     = 7;
const MIN_H         = 3;    // px resting
const MAX_H         = 26;   // px peak
const PHASE         = [0.88, 1.12, 0.78, 1.0, 0.82, 1.18, 0.94];
// How many frames of silence before we hide bars (120 frames @ 60fps = 2.0s VAD hold)
const SILENCE_FRAMES = 120;

export const RecordingOverlay: React.FC = () => {
  const [overlayState, setOverlayState] = useState<OverlayState>("idle");
  const [barsVisible,  setBarsVisible]  = useState(false);
  const [visualExpanded, setVisualExpanded] = useState(false);

  // DOM refs for each bar — we write style directly, no React state
  const barRefs   = useRef<(HTMLDivElement | null)[]>(Array(BAR_COUNT).fill(null));
  const dotRef    = useRef<HTMLDivElement | null>(null);

  // Animation state (all in refs, never cause re-renders)
  const rmsRef       = useRef(0);
  const smoothRef    = useRef(0);
  const noiseRef     = useRef(0);
  const sampleCount  = useRef(0);
  const silentFrames = useRef(0);
  const barH         = useRef<number[]>(Array(BAR_COUNT).fill(MIN_H));
  const animRef      = useRef(0);
  const barsVisRef   = useRef(false); // mirrors barsVisible without stale closure

  useEffect(() => {
    const unlistenStatus = listen<string>("status-change", (event) => {
      const msg = event.payload;
      if (msg.startsWith("List")) {
        rmsRef.current      = 0;
        smoothRef.current   = 0;
        noiseRef.current    = 0;
        sampleCount.current = 0;
        silentFrames.current = 0;
        barH.current        = Array(BAR_COUNT).fill(MIN_H);
        setBarsVisible(false);
        barsVisRef.current  = false;
        setOverlayState("listening");
      } else if (msg.startsWith("Trans")) {
        // hide bars when transcribing starts
        setBarsVisible(false);
        barsVisRef.current = false;
        setOverlayState("transcribing");
      } else {
        setBarsVisible(false);
        barsVisRef.current = false;
        setOverlayState("idle");
      }
    });

    const unlistenAudio = listen<number>("audio-level", (event) => {
      rmsRef.current = event.payload;

      // Adaptive noise baseline — first 40 samples
      sampleCount.current += 1;
      if (sampleCount.current <= 40) {
        const n = sampleCount.current;
        noiseRef.current += (event.payload - noiseRef.current) / n;
      }
    });

    // ─── rAF loop: direct DOM writes, zero React overhead ───────────────
    const animate = () => {
      const raw   = rmsRef.current;
      // Gate: require RMS to be 1.5× above baseline before anything shows.
      // e.g. baseline=0.05 → gate=0.075 → only speech at 0.075+ triggers bars.
      // Minimum gate of 0.018 ensures very quiet environments still have a floor.
      const floor   = Math.max(noiseRef.current * 1.5, 0.018);
      const cleaned = raw > floor ? raw - floor : 0;

      // Fast attack (0.92), slow decay (0.12)
      const prev  = smoothRef.current;
      const coeff = cleaned > prev ? 0.92 : 0.12;
      const smooth = prev + (cleaned - prev) * coeff;
      smoothRef.current = smooth;

      const normalized = Math.min(smooth * 14.0, 1.0);
      const level      = Math.pow(normalized, 0.55);

      // Track silence to auto-hide bars
      if (level < 0.10) {
        silentFrames.current = Math.min(silentFrames.current + 1, SILENCE_FRAMES + 1);
      } else {
        silentFrames.current = 0;
      }

      const shouldShowBars = level >= 0.10;

      // Flip React state only on transition (not every frame)
      if (shouldShowBars && !barsVisRef.current) {
        barsVisRef.current = true;
        setBarsVisible(true);
      } else if (!shouldShowBars && silentFrames.current >= SILENCE_FRAMES && barsVisRef.current) {
        barsVisRef.current = false;
        setBarsVisible(false);
      }

      // Update each bar DOM node directly
      barH.current = barH.current.map((cur, i) => {
        const jitter = 0.65 + Math.random() * 0.7;
        const phased = level * PHASE[i] * jitter;
        const target = MIN_H + Math.min(phased, 1.0) * (MAX_H - MIN_H);
        const spd    = target > cur ? 0.92 : 0.08;
        const next   = cur + (target - cur) * spd;

        const el = barRefs.current[i];
        if (el) {
          // Colour: cyan at low, shifts purple-ish at high
          const t  = (next - MIN_H) / (MAX_H - MIN_H);
          const r  = Math.round(6   + t * 99);
          const g  = Math.round(182 - t * 96);
          const b  = Math.round(212 + t * 42);
          el.style.height     = `${next}px`;
          el.style.background = `rgb(${r},${g},${b})`;
          el.style.boxShadow  = t > 0.35
            ? `0 0 ${3 + t * 7}px rgba(${r},${g},${b},${0.45 + t * 0.45})`
            : "none";
        }

        return next;
      });

      // Pulse dot glow with audio level
      if (dotRef.current) {
        const peakT = Math.max(...barH.current.map(h => (h - MIN_H) / (MAX_H - MIN_H)));
        const gs    = 4 + peakT * 10;
        const ga    = 0.3 + peakT * 0.5;
        dotRef.current.style.boxShadow =
          `0 0 ${gs}px #22d3ee, 0 0 ${gs * 2}px rgba(34,211,238,${ga})`;
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      unlistenStatus.then(u => u());
      unlistenAudio.then(u => u());
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  const isListening    = overlayState === "listening";
  const isTranscribing = overlayState === "transcribing";

  // Visual state updates driven by component events
  useEffect(() => {
    const active = barsVisible || isTranscribing;
    setVisualExpanded(active);
  }, [barsVisible, isTranscribing]);

  // Use Tauri's native window dragging API for perfect OS cursor sync and DPI scaling
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 0) {
      getCurrentWindow().startDragging();
    }
  };

  // Aggressive fix for Windows DWM background glitch on blur
  useEffect(() => {
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused) {
        getCurrentWindow().setDecorations(false);
      }
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  return (
    <div
      onPointerDown={handlePointerDown}
      style={{
        width         : visualExpanded ? "84px" : "36px",
        height        : "36px",
        display       : "flex",
        alignItems    : "center",
        justifyContent: "center",
        gap           : visualExpanded ? "7px" : "0px",
        background    : "rgba(5, 10, 20, 0.95)",
        borderRadius  : visualExpanded ? "12px" : "50%",
        border        : "1px solid rgba(255, 255, 255, 0.12)",
        boxShadow     : "inset 0 1px 0 rgba(255, 255, 255, 0.05)",
        cursor        : "grab",
        userSelect    : "none" as const,
        overflow      : "hidden",
        boxSizing     : "border-box",
        transition    : "width 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), border-radius 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), gap 0.22s ease",
      }}
    >
      {/* ── Dot — always visible during listening/transcribing ── */}
      <div
        ref={dotRef}
        style={{
          width        : 9,
          height       : 9,
          borderRadius : "50%",
          background   : isTranscribing ? "#c084fc" : "#22d3ee",
          boxShadow    : isTranscribing
            ? "0 0 6px #c084fc, 0 0 14px rgba(192,132,252,0.4)"
            : "0 0 6px #22d3ee, 0 0 12px rgba(34,211,238,0.35)",
          animation    : isListening || isTranscribing
            ? "pulse-dot 1.6s ease-in-out infinite"
            : "none",
          flexShrink   : 0,
          transition   : "background 0.2s",
        }}
      />

      {/* ── Audio bars — fade in when voice detected, fade out on silence ── */}
      {isListening && (
        <div style={{
          display       : "flex",
          alignItems    : "center",
          gap           : "2.5px",
          height        : "100%",
          paddingTop    : 7,
          paddingBottom : 7,
          boxSizing     : "border-box",
          flexShrink    : 0,
          width         : visualExpanded ? "36px" : "0px",
          opacity       : visualExpanded ? 1 : 0,
          overflow      : "hidden",
          transition    : "width 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease",
        }}>
          {Array.from({ length: BAR_COUNT }, (_, i) => (
            <div
              key={i}
              ref={el => { barRefs.current[i] = el; }}
              style={{
                width        : 3,
                height       : `${MIN_H}px`,
                borderRadius : 3,
                background   : "#06b6d4",
                // No CSS transition — rAF drives height directly
              }}
            />
          ))}
        </div>
      )}

      {/* ── Transcribing: Rippling voice data print ── */}
      {isTranscribing && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "2.5px",
          height: "100%",
          paddingTop: 8,
          paddingBottom: 8,
          boxSizing: "border-box",
          flexShrink: 0,
          width         : visualExpanded ? "36px" : "0px",
          opacity       : visualExpanded ? 1 : 0,
          overflow      : "hidden",
          transition    : "width 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease",
        }}>
          {Array.from({ length: 7 }, (_, i) => (
            <div
              key={i}
              style={{
                width: 3,
                height: "18px",
                borderRadius: 2,
                background: "linear-gradient(to top, #c084fc, #6366f1)",
                animation: `processing-ripple 0.9s ease-in-out ${i * 0.1}s infinite alternate`,
                boxShadow: "0 0 6px rgba(192, 132, 252, 0.4)",
              }}
            />
          ))}
        </div>
      )}

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { transform: scale(1);   opacity: 1; }
          50%       { transform: scale(0.82); opacity: 0.75; }
        }
        @keyframes processing-ripple {
          0%   { transform: scaleY(0.3); opacity: 0.4; }
          100% { transform: scaleY(1.3); opacity: 1; }
        }
      `}</style>
    </div>
  );
};
