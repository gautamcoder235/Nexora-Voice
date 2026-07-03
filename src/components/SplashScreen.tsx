import React, { useEffect, useState, useCallback, useRef } from "react";

interface SplashScreenProps {
  onDone: () => void;
}

// Loading steps shown sequentially under the progress bar
const STEPS = [
  "Initialising audio engine…",
  "Loading Whisper runtime…",
  "Connecting to local backend…",
  "Warming up inference pipeline…",
  "Ready.",
];

// Floating particle positions (static seed so they don't shift on re-render)
const PARTICLES = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  x: (i * 37 + 11) % 100,
  y: (i * 53 + 7)  % 100,
  size: 1.2 + (i % 4) * 0.6,
  delay: (i * 0.18) % 4,
  dur: 3 + (i % 5),
  opacity: 0.12 + (i % 5) * 0.06,
}));

// Static sound-wave bar heights for the animated equaliser
const WAVE_HEIGHTS = [6, 14, 22, 30, 38, 44, 38, 30, 22, 14, 6, 14, 22, 30, 38, 44, 38, 30];

export const SplashScreen: React.FC<SplashScreenProps> = ({ onDone }) => {
  const [progress,   setProgress]   = useState(0);
  const [stepIdx,    setStepIdx]    = useState(0);
  const [exiting,    setExiting]    = useState(false);
  const [logoReady,  setLogoReady]  = useState(false);
  const [textReady,  setTextReady]  = useState(false);
  const [barReady,   setBarReady]   = useState(false);
  const rafRef = useRef(0);

  const finish = useCallback(() => {
    setExiting(true);
    setTimeout(onDone, 650);
  }, [onDone]);

  // Staggered element reveals
  useEffect(() => {
    const t1 = setTimeout(() => setLogoReady(true),  80);
    const t2 = setTimeout(() => setTextReady(true),  380);
    const t3 = setTimeout(() => setBarReady(true),   580);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  // Progress + step cycling
  useEffect(() => {
    const startMs = performance.now();
    const fillMs  = 2800;

    const tick = (now: number) => {
      const pct = Math.min(((now - startMs) / fillMs) * 100, 100);
      setProgress(pct);

      // Advance step label at each 20% increment
      const newStep = Math.min(Math.floor(pct / 20), STEPS.length - 1);
      setStepIdx(newStep);

      if (pct < 100) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setTimeout(finish, 400);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [finish]);

  return (
    <div style={{
      position       : "fixed",
      inset          : 0,
      zIndex         : 9999,
      display        : "flex",
      flexDirection  : "column",
      alignItems     : "center",
      justifyContent : "center",
      background     : "#020408",
      overflow       : "hidden",
      userSelect     : "none",
      opacity        : exiting ? 0 : 1,
      transition     : exiting ? "opacity 0.65s cubic-bezier(0.4,0,1,1)" : "none",
    }}>

      {/* ── Subtle grid texture ─────────────────────────────────── */}
      <div style={{
        position        : "absolute",
        inset           : 0,
        backgroundImage : "linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)",
        backgroundSize  : "60px 60px",
        maskImage       : "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
        WebkitMaskImage : "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
        pointerEvents   : "none",
      }} />

      {/* ── Ambient glow orbs ───────────────────────────────────── */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {/* Cyan top-left */}
        <div style={{
          position: "absolute", top: "-10%", left: "-5%",
          width: 800, height: 800, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(6,182,212,0.10) 0%, transparent 60%)",
          filter: "blur(60px)",
          animation: "orb-a 9s ease-in-out infinite alternate",
        }} />
        {/* Violet bottom-right */}
        <div style={{
          position: "absolute", bottom: "-12%", right: "-8%",
          width: 900, height: 900, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.09) 0%, transparent 60%)",
          filter: "blur(70px)",
          animation: "orb-b 11s ease-in-out infinite alternate",
        }} />
        {/* Indigo centre-bottom */}
        <div style={{
          position: "absolute", bottom: "10%", left: "35%",
          width: 600, height: 400, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 65%)",
          filter: "blur(50px)",
          animation: "orb-c 7s ease-in-out infinite alternate",
        }} />
      </div>

      {/* ── Floating particles ──────────────────────────────────── */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {PARTICLES.map(p => (
          <div key={p.id} style={{
            position     : "absolute",
            left         : `${p.x}%`,
            top          : `${p.y}%`,
            width        : p.size,
            height       : p.size,
            borderRadius : "50%",
            background   : p.id % 3 === 0 ? "#22d3ee" : p.id % 3 === 1 ? "#818cf8" : "#a78bfa",
            opacity      : p.opacity,
            animation    : `float-${p.id % 3} ${p.dur}s ${p.delay}s ease-in-out infinite alternate`,
          }} />
        ))}
      </div>

      {/* ── Logo mark with rings ─────────────────────────────────── */}
      <div style={{
        position      : "relative",
        marginBottom  : 36,
        opacity       : logoReady ? 1 : 0,
        transform     : logoReady ? "scale(1) translateY(0)" : "scale(0.4) translateY(24px)",
        transition    : "opacity 0.6s cubic-bezier(0.34,1.56,0.64,1), transform 0.6s cubic-bezier(0.34,1.56,0.64,1)",
      }}>
        {/* Outer pulsing ring */}
        <div style={{
          position     : "absolute",
          inset        : -20,
          borderRadius : "50%",
          border       : "1px solid rgba(6,182,212,0.15)",
          animation    : "ring-pulse 2.4s ease-in-out infinite",
        }} />
        {/* Middle ring */}
        <div style={{
          position     : "absolute",
          inset        : -10,
          borderRadius : "50%",
          border       : "1px solid rgba(99,102,241,0.2)",
          animation    : "ring-pulse 2.4s 0.4s ease-in-out infinite",
        }} />

        {/* Logo container */}
        <div style={{
          width           : 96,
          height          : 96,
          borderRadius    : 28,
          background      : "linear-gradient(145deg, rgba(6,182,212,0.15) 0%, rgba(99,102,241,0.2) 50%, rgba(139,92,246,0.15) 100%)",
          border          : "1px solid rgba(255,255,255,0.12)",
          boxShadow       : "0 0 0 1px rgba(6,182,212,0.08), 0 0 40px rgba(6,182,212,0.18), 0 0 80px rgba(99,102,241,0.12), inset 0 1px 0 rgba(255,255,255,0.1)",
          backdropFilter  : "blur(20px)",
          display         : "flex",
          alignItems      : "center",
          justifyContent  : "center",
        }}>
          <svg width="46" height="46" viewBox="0 0 46 46" fill="none">
            <defs>
              <linearGradient id="mic-fill" x1="16" y1="4" x2="30" y2="28" gradientUnits="userSpaceOnUse">
                <stop stopColor="#22d3ee"/>
                <stop offset="0.5" stopColor="#818cf8"/>
                <stop offset="1" stopColor="#a78bfa"/>
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="1.5" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            {/* Mic body */}
            <rect x="16" y="4" width="14" height="22" rx="7" fill="url(#mic-fill)" filter="url(#glow)"/>
            {/* Arc */}
            <path d="M9 23c0 7.732 6.268 14 14 14s14-6.268 14-14"
                  stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" fill="none" filter="url(#glow)"/>
            {/* Stand line */}
            <line x1="23" y1="37" x2="23" y2="43" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round"/>
            {/* Base */}
            <line x1="15" y1="43" x2="31" y2="43" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </div>
      </div>

      {/* ── App name + tagline ───────────────────────────────────── */}
      <div style={{
        display       : "flex",
        flexDirection : "column",
        alignItems    : "center",
        gap           : 12,
        marginBottom  : 14,
        opacity       : textReady ? 1 : 0,
        transform     : textReady ? "translateY(0)" : "translateY(20px)",
        transition    : "opacity 0.6s ease, transform 0.6s cubic-bezier(0.22,1,0.36,1)",
      }}>
        <h1 style={{
          margin        : 0,
          fontSize      : 42,
          fontWeight    : 800,
          fontFamily    : "'Outfit', 'Inter', system-ui, sans-serif",
          letterSpacing : "-0.04em",
          lineHeight    : 1,
          background    : "linear-gradient(135deg, #ffffff 0%, #e2e8f0 20%, #22d3ee 50%, #818cf8 75%, #a78bfa 100%)",
          WebkitBackgroundClip : "text",
          WebkitTextFillColor  : "transparent",
          backgroundClip       : "text",
          backgroundSize       : "200% 200%",
          animation            : "shimmer 4s linear infinite",
        }}>
          Nexora Voice
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {["on-device", "offline", "private"].map((tag, i) => (
            <React.Fragment key={tag}>
              <span style={{
                fontSize      : 10,
                fontWeight    : 600,
                fontFamily    : "'JetBrains Mono', monospace",
                color         : "rgba(148,163,184,0.5)",
                letterSpacing : "0.12em",
                textTransform : "uppercase",
              }}>{tag}</span>
              {i < 2 && (
                <span style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.15)" }} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── Animated equaliser wave ─────────────────────────────── */}
      <div style={{
        display       : "flex",
        alignItems    : "flex-end",
        gap           : 3,
        height        : 52,
        marginBottom  : 28,
        opacity       : textReady ? 0.35 : 0,
        transition    : "opacity 0.8s 0.3s ease",
      }}>
        {WAVE_HEIGHTS.map((h, i) => (
          <div key={i} style={{
            width        : 3,
            height       : h,
            borderRadius : 2,
            background   : `linear-gradient(to top, #06b6d4, #818cf8)`,
            animation    : `wave-bar ${0.8 + (i % 4) * 0.15}s ${(i * 0.06) % 0.8}s ease-in-out infinite alternate`,
            transformOrigin: "bottom",
          }} />
        ))}
      </div>

      {/* ── Progress bar ────────────────────────────────────────── */}
      <div style={{
        width      : 300,
        opacity    : barReady ? 1 : 0,
        transform  : barReady ? "translateY(0)" : "translateY(12px)",
        transition : "opacity 0.5s ease, transform 0.5s ease",
      }}>
        {/* Track */}
        <div style={{
          height        : 2,
          borderRadius  : 99,
          background    : "rgba(255,255,255,0.05)",
          overflow      : "hidden",
          marginBottom  : 14,
          position      : "relative",
        }}>
          {/* Glow layer */}
          <div style={{
            position     : "absolute",
            inset        : 0,
            background   : "rgba(6,182,212,0.08)",
            borderRadius : 99,
          }} />
          {/* Fill */}
          <div style={{
            height     : "100%",
            borderRadius: 99,
            width      : `${progress}%`,
            background : "linear-gradient(90deg, #06b6d4 0%, #6366f1 50%, #a855f7 100%)",
            boxShadow  : "0 0 12px rgba(6,182,212,0.8), 0 0 24px rgba(99,102,241,0.4)",
            transition : "width 0.08s linear",
            position   : "relative",
          }}>
            {/* Shimmer sweep on the fill */}
            <div style={{
              position   : "absolute",
              inset      : 0,
              background : "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)",
              animation  : "sweep 1.2s linear infinite",
            }} />
          </div>
        </div>

        {/* Status row */}
        <div style={{
          display        : "flex",
          justifyContent : "space-between",
          alignItems     : "center",
          fontSize       : 10,
          fontFamily     : "'JetBrains Mono', monospace",
          letterSpacing  : "0.04em",
        }}>
          <span style={{
            color     : "rgba(148,163,184,0.45)",
            transition: "opacity 0.3s",
            key       : stepIdx,
            animation : "step-fade 0.3s ease",
          }}>
            {STEPS[stepIdx]}
          </span>
          <span style={{ color: "rgba(6,182,212,0.6)", fontWeight: 700 }}>
            {Math.round(progress)}%
          </span>
        </div>
      </div>

      {/* ── Bottom footer ────────────────────────────────────────── */}
      <div style={{
        position      : "absolute",
        bottom        : 24,
        display       : "flex",
        alignItems    : "center",
        gap           : 8,
        opacity       : barReady ? 0.22 : 0,
        transition    : "opacity 0.8s 0.4s ease",
      }}>
        <div style={{
          width: 14, height: 14, borderRadius: 4,
          background: "linear-gradient(135deg, #06b6d4, #818cf8)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 8, fontWeight: 900, color: "#fff" }}>N</span>
        </div>
        <span style={{
          fontSize     : 10,
          fontFamily   : "'JetBrains Mono', monospace",
          letterSpacing: "0.08em",
          color        : "rgba(148,163,184,1)",
        }}>
          Nexora Labs · v0.9.0
        </span>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@700;800&display=swap');

        @keyframes orb-a {
          from { transform: translate(0,0) scale(1); }
          to   { transform: translate(40px,30px) scale(1.1); }
        }
        @keyframes orb-b {
          from { transform: translate(0,0) scale(1); }
          to   { transform: translate(-30px,-40px) scale(1.08); }
        }
        @keyframes orb-c {
          from { transform: translate(0,0) scale(1); }
          to   { transform: translate(20px,-20px) scale(1.05); }
        }
        @keyframes ring-pulse {
          0%,100% { opacity: 0.6; transform: scale(1); }
          50%      { opacity: 0.15; transform: scale(1.08); }
        }
        @keyframes float-0 {
          from { transform: translateY(0px); }
          to   { transform: translateY(-12px); }
        }
        @keyframes float-1 {
          from { transform: translateY(0px) translateX(0px); }
          to   { transform: translateY(-8px) translateX(6px); }
        }
        @keyframes float-2 {
          from { transform: translateY(0px) translateX(0px); }
          to   { transform: translateY(-10px) translateX(-5px); }
        }
        @keyframes shimmer {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes wave-bar {
          from { transform: scaleY(0.3); opacity: 0.5; }
          to   { transform: scaleY(1);   opacity: 1; }
        }
        @keyframes sweep {
          from { transform: translateX(-100%); }
          to   { transform: translateX(400%); }
        }
        @keyframes step-fade {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
