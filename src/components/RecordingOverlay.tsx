import React, { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

type OverlayState = "idle" | "listening" | "transcribing";

const BAR_COUNT     = 7;
const MIN_H         = 3;    // px resting
const MAX_H         = 28;   // px peak
// How many frames of silence before we hide bars (100 frames @ 60fps ≈ 1.7s VAD hold)
const SILENCE_FRAMES = 100;

// Spring physics constants
const SPRING_TENSION  = 0.18;   // How fast bars snap to target
const SPRING_DAMPING  = 0.72;   // Damping factor (0 = no damping, 1 = overdamped)

export const RecordingOverlay: React.FC = () => {
  const [overlayState, setOverlayState] = useState<OverlayState>("idle");
  const [barsVisible,  setBarsVisible]  = useState(false);
  const [visualExpanded, setVisualExpanded] = useState(false);

  // DOM refs for each bar — we write style directly, no React state
  const barRefs   = useRef<(HTMLDivElement | null)[]>(Array(BAR_COUNT).fill(null));
  const dotRef    = useRef<HTMLDivElement | null>(null);

  // Animation state (all in refs, never cause re-renders)
  const rmsRef       = useRef(0);
  const bandsRef     = useRef<number[]>(Array(BAR_COUNT).fill(0));
  const smoothBands  = useRef<number[]>(Array(BAR_COUNT).fill(0));
  const velocities   = useRef<number[]>(Array(BAR_COUNT).fill(0));
  const noiseRef     = useRef(0);
  const noiseBands   = useRef<number[]>(Array(BAR_COUNT).fill(0));
  const sampleCount  = useRef(0);
  const silentFrames = useRef(0);
  const barH         = useRef<number[]>(Array(BAR_COUNT).fill(MIN_H));
  const animRef      = useRef(0);
  const barsVisRef   = useRef(false); // mirrors barsVisible without stale closure

  // Guard: only allow "transcribing" state after we've seen "listening" at least once
  const hasBeenListening = useRef(false);

  useEffect(() => {
    const unlistenStatus = listen<string>("status-change", (event) => {
      const msg = event.payload;
      if (msg.startsWith("List")) {
        rmsRef.current      = 0;
        bandsRef.current    = Array(BAR_COUNT).fill(0);
        smoothBands.current = Array(BAR_COUNT).fill(0);
        velocities.current  = Array(BAR_COUNT).fill(0);
        noiseRef.current    = 0;
        noiseBands.current  = Array(BAR_COUNT).fill(0);
        sampleCount.current = 0;
        silentFrames.current = 0;
        barH.current        = Array(BAR_COUNT).fill(MIN_H);
        setBarsVisible(false);
        barsVisRef.current  = false;
        hasBeenListening.current = true;
        setOverlayState("listening");
      } else if (msg.startsWith("Trans") && hasBeenListening.current) {
        setBarsVisible(false);
        barsVisRef.current = false;
        setOverlayState("transcribing");
      } else {
        setBarsVisible(false);
        barsVisRef.current = false;
        hasBeenListening.current = false;
        setOverlayState("idle");
      }
    });

    const unlistenAudio = listen<number[]>("audio-level", (event) => {
      const payload = event.payload;
      // payload = [rms, band0, band1, ..., band6]
      if (Array.isArray(payload) && payload.length >= 8) {
        rmsRef.current = payload[0];
        for (let i = 0; i < BAR_COUNT; i++) {
          bandsRef.current[i] = payload[i + 1];
        }
      } else if (typeof payload === "number") {
        // Fallback for legacy single-number emission
        rmsRef.current = payload;
      }

      // Adaptive noise baseline — first 40 samples
      sampleCount.current += 1;
      if (sampleCount.current <= 40) {
        const n = sampleCount.current;
        noiseRef.current += (rmsRef.current - noiseRef.current) / n;
        for (let i = 0; i < BAR_COUNT; i++) {
          noiseBands.current[i] += (bandsRef.current[i] - noiseBands.current[i]) / n;
        }
      }
    });

    // ─── rAF loop: direct DOM writes, zero React overhead ───────────────
    const animate = () => {
      const raw = rmsRef.current;
      // Gate: require RMS to be 1.25× above baseline
      const floor   = Math.max(noiseRef.current * 1.25, 0.006);
      const cleaned = raw > floor ? raw - floor : 0;
      const level   = Math.min(cleaned * 24.0, 1.0);

      // Track silence to auto-hide bars
      if (level < 0.05) {
        silentFrames.current = Math.min(silentFrames.current + 1, SILENCE_FRAMES + 1);
      } else {
        silentFrames.current = 0;
      }

      const shouldShowBars = level >= 0.05;

      // Flip React state only on transition (not every frame)
      if (shouldShowBars && !barsVisRef.current) {
        barsVisRef.current = true;
        setBarsVisible(true);
      } else if (!shouldShowBars && silentFrames.current >= SILENCE_FRAMES && barsVisRef.current) {
        barsVisRef.current = false;
        setBarsVisible(false);
      }

      // Update each bar using spring physics driven by its frequency band
      for (let i = 0; i < BAR_COUNT; i++) {
        // Blend each band with its neighbors (30% influence) to prevent binary snapping
        const prev = i > 0 ? bandsRef.current[i - 1] : bandsRef.current[i];
        const curr = bandsRef.current[i];
        const next = i < BAR_COUNT - 1 ? bandsRef.current[i + 1] : bandsRef.current[i];
        const bandRaw = curr * 0.6 + prev * 0.2 + next * 0.2;

        const bandFloor = Math.max(noiseBands.current[i] * 1.25, 0.003);
        const bandClean = bandRaw > bandFloor ? bandRaw - bandFloor : 0;

        // Amplify and normalize — softer power curve (0.65) creates more mid-range values
        const bandLevel = Math.min(bandClean * 28.0, 1.0);
        const bandPow   = Math.pow(bandLevel, 0.65);

        // Add subtle jitter for organic feel
        const jitter  = 0.85 + Math.random() * 0.3;
        const target  = MIN_H + Math.min(bandPow * jitter, 1.0) * (MAX_H - MIN_H);

        // Spring physics: F = -k(x - target) - damping * velocity
        const displacement = barH.current[i] - target;
        const springForce  = -SPRING_TENSION * displacement;
        const dampingForce = -SPRING_DAMPING * velocities.current[i];
        const acceleration = springForce + dampingForce;

        velocities.current[i] += acceleration;
        barH.current[i] += velocities.current[i];

        // Clamp
        barH.current[i] = Math.max(MIN_H, Math.min(MAX_H, barH.current[i]));

        const el = barRefs.current[i];
        if (el) {
          // Colour: cyan at low, shifts to vibrant purple at high
          const t  = (barH.current[i] - MIN_H) / (MAX_H - MIN_H);
          const r  = Math.round(6   + t * 120);
          const g  = Math.round(182 - t * 96);
          const b  = Math.round(212 + t * 42);
          el.style.height     = `${barH.current[i]}px`;
          el.style.background = `rgb(${r},${g},${b})`;
          // Glow intensity scales with bar height
          const glowSize = 2 + t * 10;
          const glowAlpha = 0.3 + t * 0.6;
          el.style.boxShadow = t > 0.12
            ? `0 0 ${glowSize}px rgba(${r},${g},${b},${glowAlpha})`
            : "none";
        }
      }

      // Sync dot pulse to voice RMS — scale and glow react to loudness
      if (dotRef.current) {
        const voiceLevel = Math.min(level * 1.8, 1.0);
        // Scale: 1.0 at silence → 1.25 at peak
        const dotScale = 1.0 + voiceLevel * 0.25;
        // Glow: subtle at silence → bright at peak
        const glowSize  = 4 + voiceLevel * 14;
        const glowAlpha = 0.25 + voiceLevel * 0.6;
        dotRef.current.style.transform = `scale(${dotScale})`;
        dotRef.current.style.boxShadow =
          `0 0 ${glowSize}px #22d3ee, 0 0 ${glowSize * 2}px rgba(34,211,238,${glowAlpha})`;
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
          flexShrink   : 0,
          transition   : "background 0.2s, transform 0.08s ease-out",
        }}
      />

      {/* ── Audio bars — fade in when voice detected, fade out on silence ── */}
      <div style={{
        display       : "flex",
        alignItems    : "center",
        gap           : "2.5px",
        height        : "100%",
        paddingTop    : 7,
        paddingBottom : 7,
        boxSizing     : "border-box",
        flexShrink    : 0,
        width         : (isListening && visualExpanded) ? "36px" : "0px",
        opacity       : (isListening && visualExpanded) ? 1 : 0,
        overflow      : "hidden",
        transition    : "width 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease, gap 0.22s ease",
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
              // No CSS transition — spring physics drives height directly
            }}
          />
        ))}
      </div>

      {/* ── Transcribing: Rippling voice data print ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "2.5px",
        height: "100%",
        paddingTop: 8,
        paddingBottom: 8,
        boxSizing: "border-box",
        flexShrink: 0,
        width         : (isTranscribing && visualExpanded) ? "36px" : "0px",
        opacity       : (isTranscribing && visualExpanded) ? 1 : 0,
        overflow      : "hidden",
        transition    : "width 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease, gap 0.22s ease",
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

      <style>{`
        @keyframes processing-ripple {
          0%   { transform: scaleY(0.3); opacity: 0.4; }
          100% { transform: scaleY(1.3); opacity: 1; }
        }
      `}</style>
    </div>
  );
};
