import React, { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

type OverlayState = "idle" | "listening" | "transcribing";

const BAR_COUNT   = 7;
const MIN_H       = 3;   // px resting
const LIGHT_MAX_H = 22;  // px peak (light theme)
const DARK_MAX_H  = 22;  // px peak (dark theme)

const TRACK_H = 22; // px — reduced track slot height for both themes
const SILENCE_HOLD_MS = 1500;

const SPRING_TENSION = 0.18;
const SPRING_DAMPING = 0.72;

export const RecordingOverlay: React.FC = () => {
  const [overlayState, setOverlayState] = useState<OverlayState>("idle");
  const [barsVisible,  setBarsVisible]  = useState(false);
  const [visualExpanded, setVisualExpanded] = useState(false);
  const [overlayTheme, setOverlayTheme] = useState<"dark" | "light">("dark");

  const isListening    = overlayState === "listening";
  const isTranscribing = overlayState === "transcribing";

  const themeRef = useRef(overlayTheme);
  themeRef.current = overlayTheme;

  const listeningRef = useRef(isListening);
  listeningRef.current = isListening;

  const transcribingRef = useRef(isTranscribing);
  transcribingRef.current = isTranscribing;

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
  const lastSpeechTime = useRef(Date.now());
  const barH         = useRef<number[]>(Array(BAR_COUNT).fill(MIN_H));
  const animRef      = useRef(0);
  const barsVisRef   = useRef(false); // mirrors barsVisible without stale closure

  // Guard: only allow "transcribing" state after we've seen "listening" at least once
  const hasBeenListening = useRef(false);

  useEffect(() => {
    // Initial fetch of settings
    invoke("get_settings").then((res: any) => {
      if (res && res.overlay_theme) {
        setOverlayTheme(res.overlay_theme);
      }
    }).catch(err => console.error("Failed to load settings in overlay:", err));

    // Listen for settings-changed events
    const unlistenSettings = listen<any>("settings-changed", (event) => {
      const updated = event.payload;
      if (updated && updated.overlay_theme) {
        setOverlayTheme(updated.overlay_theme);
      }
    });

    return () => {
      unlistenSettings.then(u => u());
    };
  }, []);

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
        lastSpeechTime.current = Date.now();
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
      if (Array.isArray(payload) && payload.length >= 8) {
        rmsRef.current = payload[0];
        for (let i = 0; i < BAR_COUNT; i++) {
          bandsRef.current[i] = payload[i + 1];
        }
      } else if (typeof payload === "number") {
        rmsRef.current = payload;
      }

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
      const floor   = Math.max(noiseRef.current * 1.35, 0.005);
      const cleaned = raw > floor ? raw - floor : 0;

      const now = Date.now();
      const shouldShowBars = cleaned > 0.0025;

      if (shouldShowBars) {
        lastSpeechTime.current = now;
      }

      if (shouldShowBars && !barsVisRef.current) {
        barsVisRef.current = true;
        setBarsVisible(true);
      } else if (!shouldShowBars && (now - lastSpeechTime.current >= SILENCE_HOLD_MS) && barsVisRef.current) {
        barsVisRef.current = false;
        setBarsVisible(false);
      }

      const t = now / 1000;
      const currentMaxH = themeRef.current === "light" ? LIGHT_MAX_H : DARK_MAX_H;

      for (let i = 0; i < BAR_COUNT; i++) {
        let target = MIN_H;
        if (listeningRef.current && !transcribingRef.current) {
          // Blend each band with its neighbors (30% influence) to prevent binary snapping
          const prev = i > 0 ? bandsRef.current[i - 1] : bandsRef.current[i];
          const curr = bandsRef.current[i];
          const next = i < BAR_COUNT - 1 ? bandsRef.current[i + 1] : bandsRef.current[i];
          const bandRaw = curr * 0.6 + prev * 0.2 + next * 0.2;

          const bandFloor = Math.max(noiseBands.current[i] * 1.35, 0.003);
          const bandClean = bandRaw > bandFloor ? bandRaw - bandFloor : 0;

          // Equalize gains: lower values for bass (fundamentals) to prevent excessive height, and boost higher frequencies to match
          const gains = [8.0, 12.0, 18.0, 28.0, 42.0, 56.0, 72.0];
          const bandLevel = Math.min(bandClean * gains[i], 1.0);
          const bandPow   = Math.pow(bandLevel, 0.65);

          // Add subtle jitter for organic feel
          const jitter  = 0.85 + Math.random() * 0.3;
          target = MIN_H + Math.min(bandPow * jitter, 1.0) * (currentMaxH - MIN_H);
        } else if (transcribingRef.current) {
          target = currentMaxH;
        }

        const displacement = barH.current[i] - target;
        const springForce = -SPRING_TENSION * displacement;
        const dampingForce = -SPRING_DAMPING * velocities.current[i];
        velocities.current[i] += springForce + dampingForce;
        barH.current[i] += velocities.current[i];
        barH.current[i] = Math.max(MIN_H, Math.min(currentMaxH, barH.current[i]));

        const el = barRefs.current[i];
        if (el) {
          const frac = (barH.current[i] - MIN_H) / (currentMaxH - MIN_H);
          el.style.height = `${barH.current[i]}px`;

          if (themeRef.current === "light") {
            el.style.background = `rgba(255, 255, 255, ${0.42 + frac * 0.58})`;
            const glowSize = 2 + frac * 6;
            const glowAlpha = 0.15 + frac * 0.35;
            el.style.boxShadow = `0 0 ${glowSize}px rgba(255, 255, 255, ${glowAlpha})`;
          } else {
            const r = Math.round(6 + frac * 120);
            const g = Math.round(182 - frac * 96);
            const b = Math.round(212 + frac * 42);
            el.style.background = `rgb(${r},${g},${b})`;
            const glowSize = 3 + frac * 9;
            const glowAlpha = 0.25 + frac * 0.55;
            el.style.boxShadow = `0 0 ${glowSize}px rgba(${r},${g},${b},${glowAlpha})`;
          }
        }
      }

      if (dotRef.current) {
        const isIdle = !listeningRef.current && !transcribingRef.current;
        let voiceLevel;

        if (isIdle) {
          voiceLevel = (Math.sin(t * 1.6) * 0.5 + 0.5) * 0.65;
        } else if (transcribingRef.current) {
          const wavePhase = (t * 2 * Math.PI) / 0.9;
          voiceLevel = 0.2 + (Math.sin(wavePhase) * 0.5 + 0.5) * 0.6;
        } else {
          const avg = barH.current.reduce((a, b) => a + b, 0) / BAR_COUNT;
          const currentMaxHLocal = themeRef.current === "light" ? LIGHT_MAX_H : DARK_MAX_H;
          voiceLevel = Math.min(((avg - MIN_H) / (currentMaxHLocal - MIN_H)) * 1.4, 1.0);
        }

        if (themeRef.current === "light") {
          const dotScale = 1.0 + voiceLevel * 0.22;
          dotRef.current.style.transform = `scale(${dotScale})`;
          const glowSize = 6 + voiceLevel * 10;
          const glowAlpha = 0.3 + voiceLevel * 0.5;
          const glowRgb = transcribingRef.current ? "244, 114, 182" : "255, 255, 255";
          dotRef.current.style.boxShadow = `0 0 ${glowSize}px rgba(${glowRgb}, ${glowAlpha})`;
        } else {
          const dotScale = 1.0 + voiceLevel * 0.25;
          const glowSize = 4 + voiceLevel * 14;
          const glowAlpha = 0.25 + voiceLevel * 0.6;
          dotRef.current.style.transform = `scale(${dotScale})`;
          dotRef.current.style.boxShadow = transcribingRef.current
            ? `0 0 ${glowSize}px #c084fc, 0 0 ${glowSize * 2}px rgba(192,132,252,${glowAlpha})`
            : `0 0 ${glowSize}px #22d3ee, 0 0 ${glowSize * 2}px rgba(34,211,238,${glowAlpha})`;
        }
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

  useEffect(() => {
    const active = barsVisible || isTranscribing;
    setVisualExpanded(active);
  }, [barsVisible, isTranscribing]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 0) {
      getCurrentWindow().startDragging();
    }
  };

  useEffect(() => {
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused) {
        getCurrentWindow().setDecorations(false);
      }
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  const isLight = overlayTheme === "light";
  const parentWidth = visualExpanded ? "84px" : "36px";
  const parentHeight = "36px";
  const parentGap = visualExpanded ? "8px" : "0px";
  const parentBg = isLight ? "rgba(255, 255, 255, 0.38)" : "rgba(5, 10, 20, 0.95)";
  const parentBorder = isLight
    ? "1px solid rgba(255, 255, 255, 0.65)"
    : "1px solid rgba(255, 255, 255, 0.12)";
  const parentBoxShadow = isLight
    ? "0 10px 25px rgba(0, 0, 0, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.4)"
    : "inset 0 1px 0 rgba(255, 255, 255, 0.05)";
  const parentBackdropFilter = "none";
  const parentBorderRadius = visualExpanded ? "12px" : "50%";
  const parentTransition = isLight
    ? "width 0.32s cubic-bezier(0.25, 1, 0.2, 1), border-radius 0.32s cubic-bezier(0.25, 1, 0.2, 1), gap 0.24s ease"
    : "width 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), border-radius 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), gap 0.22s ease";

  return (
    <div
      onPointerDown={handlePointerDown}
      style={{
        width: parentWidth,
        height: parentHeight,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: parentGap,
        background: parentBg,
        backdropFilter: parentBackdropFilter,
        WebkitBackdropFilter: parentBackdropFilter,
        borderRadius: parentBorderRadius,
        border: parentBorder,
        boxShadow: parentBoxShadow,
        cursor: "grab",
        userSelect: "none",
        overflow: "hidden",
        boxSizing: "border-box",
        transition: parentTransition,
      }}
    >
      {isLight ? (
        <div
          ref={dotRef}
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: isTranscribing ? "#f472b6" : "#ffffff",
            flexShrink: 0,
            transition: "background 0.2s, transform 0.08s ease-out",
          }}
        />
      ) : (
        <div
          ref={dotRef}
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: isTranscribing ? "#c084fc" : "#22d3ee",
            boxShadow: isTranscribing
              ? "0 0 6px #c084fc, 0 0 14px rgba(192,132,252,0.4)"
              : "0 0 6px #22d3ee, 0 0 12px rgba(34,211,238,0.35)",
            flexShrink: 0,
            transition: "background 0.2s, transform 0.08s ease-out",
          }}
        />
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "3px",
          height: "100%",
          boxSizing: "border-box",
          flexShrink: 0,
          width: visualExpanded ? "46px" : "0px",
          opacity: visualExpanded ? 1 : 0,
          overflow: visualExpanded ? "visible" : "hidden",
          transition: isLight
            ? "width 0.32s cubic-bezier(0.25, 1, 0.2, 1), opacity 0.2s ease"
            : "width 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease, gap 0.22s ease",
        }}
      >
        {isLight
          ? Array.from({ length: BAR_COUNT }, (_, i) => (
              <div
                key={i}
                style={{
                  width: 4,
                  height: TRACK_H,
                  borderRadius: 3,
                  background: "rgba(255, 255, 255, 0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                }}
              >
                {isTranscribing ? (
                  <div
                    style={{
                      width: "100%",
                      height: "22px",
                      borderRadius: 3,
                      background: "#f472b6",
                      animation: `minimal-pulse 0.9s ease-in-out ${i * 0.1}s infinite alternate`,
                      boxShadow: "0 0 6px rgba(244, 114, 182, 0.5)",
                      transformOrigin: "center",
                    }}
                  />
                ) : (
                  <div
                    ref={(el) => { barRefs.current[i] = el; }}
                    style={{ width: 4, height: `${MIN_H}px`, borderRadius: 3, background: "#ffffff" }}
                  />
                )}
              </div>
            ))
          : Array.from({ length: BAR_COUNT }, (_, i) => (
              <div
                key={i}
                style={{
                  width: 4,
                  height: TRACK_H,
                  borderRadius: 3,
                  background: "rgba(255, 255, 255, 0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                }}
              >
                {isTranscribing ? (
                  <div
                    style={{
                      width: "100%",
                      height: "22px",
                      borderRadius: 2,
                      background: "linear-gradient(to top, #c084fc, #6366f1)",
                      animation: `processing-ripple 0.9s ease-in-out ${i * 0.1}s infinite alternate`,
                      boxShadow: "0 0 6px rgba(192, 132, 252, 0.4)",
                      transformOrigin: "center",
                    }}
                  />
                ) : (
                  <div
                    ref={(el) => { barRefs.current[i] = el; }}
                    style={{ width: 4, height: `${MIN_H}px`, borderRadius: 3, background: "#06b6d4" }}
                  />
                )}
              </div>
            ))}
      </div>

      <style>{`
        @keyframes processing-ripple {
          0%   { transform: scaleY(0.2); opacity: 0.35; }
          100% { transform: scaleY(1.0); opacity: 1; }
        }
        @keyframes minimal-pulse {
          0%   { transform: scaleY(0.2); opacity: 0.25; }
          100% { transform: scaleY(1.0); opacity: 0.95; }
        }
      `}</style>
    </div>
  );
};
