import React, { useEffect, useState, useCallback } from "react";

interface SplashScreenProps {
  onDone: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onDone }) => {
  const [progress, setProgress] = useState(0);
  const [exiting, setExiting]   = useState(false);

  const finish = useCallback(() => {
    setExiting(true);
    setTimeout(onDone, 420); // wait for fade-out
  }, [onDone]);

  useEffect(() => {
    const startMs  = performance.now();
    const fillMs   = 2200;
    let   raf: number;

    const tick = (now: number) => {
      const pct = Math.min(((now - startMs) / fillMs) * 100, 100);
      setProgress(pct);
      if (pct < 100) {
        raf = requestAnimationFrame(tick);
      } else {
        setTimeout(finish, 300); // brief hold at 100%
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [finish]);

  return (
    <div style={{
      position : "fixed",
      inset    : 0,
      zIndex   : 9999,
      display  : "flex",
      flexDirection : "column",
      alignItems    : "center",
      justifyContent: "center",
      background: "#030712",
      opacity   : exiting ? 0 : 1,
      transition: "opacity 0.42s ease",
      userSelect: "none",
      overflow  : "hidden",
    }}>

      {/* ── Ambient background orbs ───────────────────────────── */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {/* Cyan — top left */}
        <div style={{
          position: "absolute", top: "-15%", left: "-8%",
          width: 700, height: 700, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(6,182,212,0.13) 0%, transparent 65%)",
          filter: "blur(50px)",
          animation: "orb-drift-a 8s ease-in-out infinite alternate",
        }} />
        {/* Purple — bottom right */}
        <div style={{
          position: "absolute", bottom: "-18%", right: "-10%",
          width: 800, height: 800, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(168,85,247,0.11) 0%, transparent 65%)",
          filter: "blur(60px)",
          animation: "orb-drift-b 10s ease-in-out infinite alternate",
        }} />
        {/* Indigo — centre */}
        <div style={{
          position: "absolute", top: "30%", left: "38%",
          width: 500, height: 500, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 65%)",
          filter: "blur(40px)",
        }} />
      </div>

      {/* ── Logo mark ─────────────────────────────────────────── */}
      <div style={{
        width: 88, height: 88, borderRadius: 26,
        background : "linear-gradient(135deg, rgba(6,182,212,0.18) 0%, rgba(99,102,241,0.22) 50%, rgba(168,85,247,0.18) 100%)",
        border     : "1px solid rgba(255,255,255,0.1)",
        boxShadow  : "0 0 50px rgba(6,182,212,0.22), 0 0 100px rgba(99,102,241,0.14), inset 0 1px 0 rgba(255,255,255,0.1)",
        backdropFilter: "blur(16px)",
        display    : "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 32,
        animation  : "logo-pop 0.65s cubic-bezier(0.34,1.56,0.64,1) both",
      }}>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          {/* Mic capsule */}
          <rect x="14" y="4" width="12" height="20" rx="6" fill="url(#sg)"/>
          {/* Arc */}
          <path d="M8 20c0 6.627 5.373 12 12 12s12-5.373 12-12"
                stroke="#22d3ee" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
          {/* Stand */}
          <line x1="20" y1="32" x2="20" y2="37" stroke="#22d3ee" strokeWidth="2.2" strokeLinecap="round"/>
          <line x1="14" y1="37" x2="26" y2="37" stroke="#22d3ee" strokeWidth="2.2" strokeLinecap="round"/>
          <defs>
            <linearGradient id="sg" x1="14" y1="4" x2="26" y2="24" gradientUnits="userSpaceOnUse">
              <stop stopColor="#22d3ee"/>
              <stop offset="1" stopColor="#818cf8"/>
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* ── App name + tagline ─────────────────────────────────── */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
        marginBottom: 52,
        animation: "slide-up 0.7s 0.18s cubic-bezier(0.22,1,0.36,1) both",
      }}>
        <h1 style={{
          margin: 0, fontSize: 34, fontWeight: 800,
          fontFamily    : "'Outfit', system-ui, sans-serif",
          letterSpacing : "-0.03em",
          background    : "linear-gradient(135deg, #f8fafc 25%, #22d3ee 60%, #818cf8 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor : "transparent",
          backgroundClip: "text",
        }}>
          Nexora Voice
        </h1>
        <span style={{
          fontSize: 11.5, fontWeight: 500,
          color       : "rgba(148,163,184,0.45)",
          fontFamily  : "'JetBrains Mono', monospace",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}>
          on-device &nbsp;·&nbsp; offline &nbsp;·&nbsp; private
        </span>
      </div>

      {/* ── Progress bar ──────────────────────────────────────── */}
      <div style={{
        width: 240,
        animation: "slide-up 0.6s 0.32s ease both",
      }}>
        {/* Track */}
        <div style={{
          height: 3, borderRadius: 99,
          background: "rgba(255,255,255,0.06)",
          overflow: "hidden",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.4)",
        }}>
          {/* Fill */}
          <div style={{
            height: "100%", borderRadius: 99,
            width     : `${progress}%`,
            background: "linear-gradient(90deg, #06b6d4 0%, #6366f1 55%, #a855f7 100%)",
            boxShadow : "0 0 10px rgba(6,182,212,0.6)",
            transition: "width 0.05s linear",
          }} />
        </div>

        {/* Label row */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginTop: 11,
          fontSize   : 10.5,
          fontFamily : "'JetBrains Mono', monospace",
          letterSpacing: "0.04em",
          color: "rgba(148,163,184,0.32)",
        }}>
          <span>Initialising audio engine</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>

      {/* ── Version footer ────────────────────────────────────── */}
      <div style={{
        position: "absolute", bottom: 26,
        fontSize   : 10,
        fontFamily : "'JetBrains Mono', monospace",
        letterSpacing: "0.08em",
        color: "rgba(148,163,184,0.2)",
        animation: "slide-up 0.6s 0.5s ease both",
      }}>
        v0.9.0 &nbsp;·&nbsp; Nexora Labs
      </div>

      <style>{`
        @keyframes logo-pop {
          from { opacity:0; transform: scale(0.55) translateY(16px); }
          to   { opacity:1; transform: scale(1)    translateY(0); }
        }
        @keyframes slide-up {
          from { opacity:0; transform: translateY(18px); }
          to   { opacity:1; transform: translateY(0); }
        }
        @keyframes orb-drift-a {
          from { transform: translate(0,0)    scale(1); }
          to   { transform: translate(30px,20px) scale(1.08); }
        }
        @keyframes orb-drift-b {
          from { transform: translate(0,0)    scale(1); }
          to   { transform: translate(-20px,-30px) scale(1.06); }
        }
      `}</style>
    </div>
  );
};
