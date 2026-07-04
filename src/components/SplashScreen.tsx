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
const PARTICLES = Array.from({ length: 35 }, (_, i) => ({
  id: i,
  x: (i * 37 + 11) % 100,
  y: (i * 53 + 7)  % 100,
  size: 1.0 + (i % 5) * 0.5,
  delay: (i * 0.14) % 5,
  dur: 3 + (i % 6),
  opacity: 0.08 + (i % 5) * 0.05,
}));

// Animated equaliser bar heights
const WAVE_HEIGHTS = [6, 14, 22, 30, 38, 44, 38, 30, 22, 14, 6, 14, 22, 30, 38, 44, 38, 30];

export const SplashScreen: React.FC<SplashScreenProps> = ({ onDone }) => {
  const [progress,   setProgress]   = useState(0);
  const [stepIdx,    setStepIdx]    = useState(0);
  const [exiting,    setExiting]    = useState(false);
  const [logoReady,  setLogoReady]  = useState(false);
  const [textReady,  setTextReady]  = useState(false);
  const [barReady,   setBarReady]   = useState(false);
  const [ringsReady, setRingsReady] = useState(false);
  const [waveReady,  setWaveReady]  = useState(false);
  const rafRef = useRef(0);

  const finish = useCallback(() => {
    setExiting(true);
    setTimeout(onDone, 750);
  }, [onDone]);

  // Staggered element reveals — more cinematic timing
  useEffect(() => {
    const t0 = setTimeout(() => setRingsReady(true), 50);
    const t1 = setTimeout(() => setLogoReady(true),  200);
    const t2 = setTimeout(() => setTextReady(true),  550);
    const t3 = setTimeout(() => setWaveReady(true),  750);
    const t4 = setTimeout(() => setBarReady(true),   900);
    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
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
      transform      : exiting ? "scale(1.04)" : "scale(1)",
      transition     : exiting ? "opacity 0.75s cubic-bezier(0.4,0,1,1), transform 0.75s cubic-bezier(0.4,0,1,1)" : "none",
    }}>

      {/* ── Subtle grid texture ─────────────────────────────────── */}
      <div style={{
        position        : "absolute",
        inset           : 0,
        backgroundImage : "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
        backgroundSize  : "60px 60px",
        maskImage       : "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
        WebkitMaskImage : "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
        pointerEvents   : "none",
        animation       : "grid-drift 20s linear infinite",
      }} />

      {/* ── Ambient glow orbs ───────────────────────────────────── */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {/* Cyan top-left */}
        <div style={{
          position: "absolute", top: "-10%", left: "-5%",
          width: 800, height: 800, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 60%)",
          filter: "blur(60px)",
          animation: "orb-a 9s ease-in-out infinite alternate",
        }} />
        {/* Violet bottom-right */}
        <div style={{
          position: "absolute", bottom: "-12%", right: "-8%",
          width: 900, height: 900, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 60%)",
          filter: "blur(70px)",
          animation: "orb-b 11s ease-in-out infinite alternate",
        }} />
        {/* Indigo centre-bottom */}
        <div style={{
          position: "absolute", bottom: "10%", left: "35%",
          width: 600, height: 400, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 65%)",
          filter: "blur(50px)",
          animation: "orb-c 7s ease-in-out infinite alternate",
        }} />
        {/* Warm accent top-right */}
        <div style={{
          position: "absolute", top: "15%", right: "10%",
          width: 500, height: 500, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(236,72,153,0.05) 0%, transparent 60%)",
          filter: "blur(80px)",
          animation: "orb-a 13s 2s ease-in-out infinite alternate",
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
            background   : p.id % 4 === 0 ? "#22d3ee" : p.id % 4 === 1 ? "#818cf8" : p.id % 4 === 2 ? "#a78bfa" : "#ec4899",
            opacity      : p.opacity,
            animation    : `float-${p.id % 3} ${p.dur}s ${p.delay}s ease-in-out infinite alternate`,
          }} />
        ))}
      </div>

      {/* ── Expanding ring burst on logo reveal ─────────────────── */}
      <div style={{
        position     : "absolute",
        width        : 300,
        height       : 300,
        borderRadius : "50%",
        border       : "1px solid rgba(6,182,212,0.3)",
        opacity      : ringsReady ? 0 : 0.8,
        transform    : ringsReady ? "scale(3)" : "scale(0.3)",
        transition   : "transform 1.4s cubic-bezier(0.22,1,0.36,1), opacity 1.4s ease",
        pointerEvents: "none",
      }} />
      <div style={{
        position     : "absolute",
        width        : 200,
        height       : 200,
        borderRadius : "50%",
        border       : "1px solid rgba(99,102,241,0.25)",
        opacity      : ringsReady ? 0 : 0.6,
        transform    : ringsReady ? "scale(4)" : "scale(0.2)",
        transition   : "transform 1.6s 0.1s cubic-bezier(0.22,1,0.36,1), opacity 1.6s 0.1s ease",
        pointerEvents: "none",
      }} />

      {/* ── Logo mark with rings ─────────────────────────────────── */}
      <div style={{
        position      : "relative",
        marginBottom  : 36,
        opacity       : logoReady ? 1 : 0,
        transform     : logoReady ? "scale(1) translateY(0)" : "scale(0.3) translateY(30px)",
        transition    : "opacity 0.7s cubic-bezier(0.34,1.56,0.64,1), transform 0.7s cubic-bezier(0.34,1.56,0.64,1)",
      }}>
        {/* Outer pulsing ring */}
        <div style={{
          position     : "absolute",
          inset        : -22,
          borderRadius : "50%",
          border       : "1px solid rgba(6,182,212,0.12)",
          animation    : "ring-pulse 2.4s ease-in-out infinite",
        }} />
        {/* Middle ring */}
        <div style={{
          position     : "absolute",
          inset        : -11,
          borderRadius : "50%",
          border       : "1px solid rgba(99,102,241,0.18)",
          animation    : "ring-pulse 2.4s 0.4s ease-in-out infinite",
        }} />
        {/* Inner spinning ring */}
        <div style={{
          position     : "absolute",
          inset        : -32,
          borderRadius : "50%",
          border       : "1px dashed rgba(6,182,212,0.08)",
          animation    : "spin-slow 25s linear infinite",
        }} />

        {/* Logo container */}
        <div style={{
          width           : 96,
          height          : 96,
          borderRadius    : 28,
          border          : "1px solid rgba(255,255,255,0.12)",
          boxShadow       : "0 0 0 1px rgba(6,182,212,0.08), 0 0 40px rgba(6,182,212,0.2), 0 0 80px rgba(99,102,241,0.14), inset 0 1px 0 rgba(255,255,255,0.1)",
          backdropFilter  : "blur(20px)",
          display         : "flex",
          alignItems      : "center",
          justifyContent  : "center",
          animation       : "logo-breathe 3s ease-in-out infinite",
          overflow        : "hidden",
        }}>
          <img src="/logo.jpg" alt="Nexora Voice Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
        transform     : textReady ? "translateY(0)" : "translateY(24px)",
        transition    : "opacity 0.7s ease, transform 0.7s cubic-bezier(0.22,1,0.36,1)",
      }}>
        <h1 style={{
          margin        : 0,
          fontSize      : 44,
          fontWeight    : 800,
          fontFamily    : "'Outfit', 'Inter', system-ui, sans-serif",
          letterSpacing : "-0.04em",
          lineHeight    : 1,
          background    : "linear-gradient(135deg, #ffffff 0%, #e2e8f0 20%, #22d3ee 50%, #818cf8 75%, #a78bfa 100%)",
          WebkitBackgroundClip : "text",
          WebkitTextFillColor  : "transparent",
          backgroundClip       : "text",
          backgroundSize       : "200% 200%",
          animation            : "shimmer 3s linear infinite",
          filter               : "drop-shadow(0 0 20px rgba(6,182,212,0.2))",
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
                opacity       : textReady ? 1 : 0,
                transform     : textReady ? "translateY(0)" : "translateY(8px)",
                transition    : `opacity 0.4s ${0.6 + i * 0.12}s ease, transform 0.4s ${0.6 + i * 0.12}s ease`,
              }}>{tag}</span>
              {i < 2 && (
                <span style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.15)" }} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── Typing Text Simulation (representing Text-to-Speech) ── */}
      <div style={{
        height        : 40,
        marginBottom  : 12,
        display       : "flex",
        alignItems    : "center",
        justifyContent: "center",
        opacity       : waveReady ? 0.9 : 0,
        transform     : waveReady ? "translateY(0)" : "translateY(12px)",
        transition    : "opacity 0.6s 0.1s ease, transform 0.6s 0.1s cubic-bezier(0.34,1.56,0.64,1)",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid rgba(255, 255, 255, 0.04)",
          padding: "8px 16px",
          borderRadius: 20,
          boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.02)",
          backdropFilter: "blur(8px)",
        }}>
          <span style={{
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            color: "rgba(34, 211, 238, 0.95)",
            textShadow: "0 0 8px rgba(6, 182, 212, 0.5)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            display: "inline-block",
            animation: "typing-effect 3.5s steps(30, end) infinite",
            maxWidth: "280px",
          }}>
            Synthesizing text to speech...
          </span>
          <span style={{
            width: 2,
            height: 14,
            background: "#22d3ee",
            animation: "blink-cursor 0.75s step-end infinite",
            boxShadow: "0 0 6px #22d3ee",
          }} />
        </div>
      </div>

      {/* ── Progress bar ────────────────────────────────────────── */}
      <div style={{
        width      : 300,
        opacity    : barReady ? 1 : 0,
        transform  : barReady ? "translateY(0)" : "translateY(14px)",
        transition : "opacity 0.5s ease, transform 0.5s cubic-bezier(0.22,1,0.36,1)",
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
              background : "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
              animation  : "sweep 1.2s linear infinite",
            }} />
            {/* Bright tip */}
            <div style={{
              position     : "absolute",
              right        : -2,
              top          : -3,
              width        : 8,
              height       : 8,
              borderRadius : "50%",
              background   : "#ffffff",
              boxShadow    : "0 0 8px #22d3ee, 0 0 16px rgba(6,182,212,0.6)",
              opacity      : progress > 2 && progress < 99 ? 1 : 0,
              transition   : "opacity 0.3s",
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
          <span 
            key={stepIdx}
            style={{
              color     : "rgba(148,163,184,0.45)",
              transition: "opacity 0.3s",
              animation : "step-fade 0.3s ease",
            }}
          >
            {STEPS[stepIdx]}
          </span>
          <span style={{ color: "rgba(6,182,212,0.6)", fontWeight: 700 }}>
            {Math.round(progress)}%
          </span>
        </div>
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
          50%      { opacity: 0.12; transform: scale(1.1); }
        }
        @keyframes float-0 {
          from { transform: translateY(0px); }
          to   { transform: translateY(-14px); }
        }
        @keyframes float-1 {
          from { transform: translateY(0px) translateX(0px); }
          to   { transform: translateY(-10px) translateX(8px); }
        }
        @keyframes float-2 {
          from { transform: translateY(0px) translateX(0px); }
          to   { transform: translateY(-12px) translateX(-6px); }
        }
        @keyframes shimmer {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes typing-effect {
          0%, 90%, 100% { width: 0; }
          30%, 80%      { width: 100%; }
        }
        @keyframes blink-cursor {
          from, to { background: transparent; }
          50%      { background: #22d3ee; }
        }
        @keyframes sweep {
          from { transform: translateX(-100%); }
          to   { transform: translateX(400%); }
        }
        @keyframes step-fade {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes logo-breathe {
          0%, 100% { box-shadow: 0 0 0 1px rgba(6,182,212,0.08), 0 0 40px rgba(6,182,212,0.2), 0 0 80px rgba(99,102,241,0.14), inset 0 1px 0 rgba(255,255,255,0.1); }
          50%      { box-shadow: 0 0 0 1px rgba(6,182,212,0.12), 0 0 50px rgba(6,182,212,0.3), 0 0 100px rgba(99,102,241,0.2), inset 0 1px 0 rgba(255,255,255,0.12); }
        }
        @keyframes grid-drift {
          from { background-position: 0 0; }
          to   { background-position: 60px 60px; }
        }
      `}</style>
    </div>
  );
};
