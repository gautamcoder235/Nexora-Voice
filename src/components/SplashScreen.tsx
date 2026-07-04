import React, { useEffect, useState, useRef, useCallback } from "react";

interface SplashScreenProps {
  onDone: () => void;
}

const LOADING_STEPS = [
  "Initializing audio engine...",
  "Loading Whisper runtime...",
  "Preparing voice pipeline...",
  "Loading AI models...",
  "Optimizing inference...",
  "Preparing Text-to-Speech...",
  "Almost ready...",
  "Ready",
];

const STREAM_WORDS = [
  "Hello",
  "Voice",
  "AI",
  "Offline",
  "Private",
  "Whisper",
  "Speech",
  "Text",
  "Natural",
  "Fast",
];

const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: 2 + Math.random() * 4,
  duration: 8 + Math.random() * 6,
  delay: Math.random() * 5,
}));

export const SplashScreen: React.FC<SplashScreenProps> = ({ onDone }) => {
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState(0);

  const [showLogo, setShowLogo] = useState(false);
  const [showTitle, setShowTitle] = useState(false);
  const [showStream, setShowStream] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [closing, setClosing] = useState(false);

  const raf = useRef<number>();

  const finish = useCallback(() => {
    setClosing(true);

    setTimeout(() => {
      onDone();
    }, 650);
  }, [onDone]);

  useEffect(() => {
    const t1 = setTimeout(() => setShowLogo(true), 180);
    const t2 = setTimeout(() => setShowTitle(true), 500);
    const t3 = setTimeout(() => setShowStream(true), 900);
    const t4 = setTimeout(() => setShowProgress(true), 1000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []);

  useEffect(() => {
    const start = performance.now();
    const duration = 4200;

    const animate = (time: number) => {
      const p = Math.min(
        ((time - start) / duration) * 100,
        100
      );

      setProgress(p);

      const idx = Math.min(
        Math.floor((p / 100) * LOADING_STEPS.length),
        LOADING_STEPS.length - 1
      );

      setStep(idx);

      if (p < 100) {
        raf.current = requestAnimationFrame(animate);
      } else {
        setTimeout(finish, 500);
      }
    };

    raf.current = requestAnimationFrame(animate);

    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [finish]);

  return (
    <div
      className={`nv-splash ${closing ? "closing" : ""}`}
    >
      {/* Background */}

      <div className="nv-bg">
        <div className="nv-glow nv-glow-a" />
        <div className="nv-glow nv-glow-b" />

        <div className="nv-grid" />

        {PARTICLES.map((p) => (
          <span
            key={p.id}
            className="nv-particle"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Center */}

      <div className="nv-center">

        {/* Anchor container for logo and text stream alignment */}
        <div style={{ position: "relative", width: 120, height: 120 }}>
          <div
            className={`nv-logo-wrapper ${
              showLogo ? "show" : ""
            }`}
          >
            <div className="nv-ring ring-1" />
            <div className="nv-ring ring-2" />
            <div className="nv-ring ring-3" />

            <div className="nv-logo">
              <img src="/logo.jpg" alt="Nexora Voice Logo" style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scale(1.22)" }} />
            </div>

          </div>

          {/* Animated text flowing out of microphone */}
          <div
            className={`nv-stream ${
              showStream ? "show" : ""
            }`}
            style={{
              position: "absolute",
              left: "0px", // Aligns perfectly to the left edge of the logo container
              top: "0px",
              width: "120px", // Bound to logo container dimensions
              height: "120px",
              pointerEvents: "none",
            }}
          >
            {STREAM_WORDS.map((word, index) => (
              <span
                key={index}
                className="nv-word"
                style={{
                  animationDelay: `${index * 0.45}s`,
                }}
              >
                {word}
              </span>
            ))}

            {/* glowing particles leaving the text */}
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="nv-stream-particle"
                style={{
                  animationDelay: `${i * 0.22}s`,
                }}
              />
            ))}
          </div>
        </div>

        <div
          className={`nv-title ${
            showTitle ? "show" : ""
          }`}
        >
          <h1>Nexora Voice</h1>

          <p>
            Private • Offline • On-device AI
          </p>
        </div>

        {/* Progress */}

        <div
          className={`nv-progress-container ${
            showProgress ? "show" : ""
          }`}
        >
          <div className="nv-progress-track">
            <div
              className="nv-progress-fill"
              style={{
                width: `${progress}%`,
              }}
            >
              <div className="nv-progress-glow" />
            </div>
          </div>

          <div className="nv-progress-info">
            <span className="nv-step">
              {LOADING_STEPS[step]}
            </span>

            <span className="nv-percent">
              {Math.round(progress)}%
            </span>
          </div>
        </div>

      </div>

      {/* Ambient bottom light */}

      <div className="nv-bottom-glow" />

      <style>{`

:root{

--cyan:#22d3ee;
--indigo:#818cf8;
--purple:#a78bfa;
--bg: linear-gradient(180deg, #0f172a 0%, #0a0f1d 100%);

}

.nv-splash{

position:fixed;
inset:0;

background: var(--bg);

overflow:hidden;

display:flex;
align-items:center;
justify-content:center;

font-family:
Outfit,
Inter,
sans-serif;

transition:
opacity .7s ease,
transform .7s ease;

}

.nv-splash.closing{

opacity:0;

transform:scale(1.03);

}

.nv-bg{

position:absolute;
inset:0;

overflow:hidden;

}

.nv-grid{

position:absolute;
inset:0;

background-image:

linear-gradient(
rgba(255,255,255,.03) 1px,
transparent 1px),

linear-gradient(
90deg,
rgba(255,255,255,.03) 1px,
transparent 1px);

background-size:70px 70px;

mask-image:
radial-gradient(circle,#000 35%,transparent 100%);

animation:
gridFloat 20s linear infinite;

opacity:.35;

}

.nv-glow{

position:absolute;

border-radius:50%;

filter:blur(80px);

}

.nv-glow-a{

width:800px;
height:800px;

background:
rgba(34,211,238,.13);

top:-250px;
left:-150px;

animation:
orbA 10s ease-in-out infinite alternate;

}

.nv-glow-b{

width:900px;
height:900px;

background:
rgba(167,139,250,.11);

right:-250px;
bottom:-250px;

animation:
orbB 12s ease-in-out infinite alternate;

}

.nv-center{

position:relative;

display:flex;

flex-direction:column;

align-items:center;

z-index:5;

}

.nv-logo-wrapper{

position:relative;

opacity:0;

transform:
translateY(25px)
scale(.65);

transition:

opacity .8s ease,

transform .8s cubic-bezier(.22,1,.36,1);

}

.nv-logo-wrapper.show{

opacity:1;

transform:
translateY(0)
scale(1);

}

.nv-logo{

width:120px;
height:120px;

border-radius:34px;
overflow:hidden;

display:flex;
align-items:center;
justify-content:center;

background:
linear-gradient(
145deg,

rgba(34,211,238,.12),

rgba(129,140,248,.18),

rgba(167,139,250,.14));

backdrop-filter:blur(20px);

border:
1px solid rgba(255,255,255,.08);

box-shadow:

0 0 60px rgba(34,211,238,.18),

0 0 120px rgba(129,140,248,.10),

inset 0 1px rgba(255,255,255,.08);

animation:
logoBreath 4s ease-in-out infinite;

}

.nv-ring{

position:absolute;

border-radius:50%;

border:
1px solid rgba(34,211,238,.08);

inset:-18px;

animation:
ringPulse 3.2s ease-in-out infinite;

}

.ring-2{

inset:-35px;

animation-delay:.4s;

}

.ring-3{

inset:-52px;

animation-delay:.8s;

}

.nv-stream{

position:absolute;

left:95px;

top:18px;

width:280px;

height:120px;

pointer-events:none;

opacity:0;

transition:opacity .6s ease;

}

.nv-stream.show{

opacity:1;

}.nv-word{

position:absolute;

left:0;
top:50%;

font-family:
"JetBrains Mono",
monospace;

font-size:13px;

font-weight:600;

white-space:nowrap;

background:
linear-gradient(
90deg,
#22d3ee,
#818cf8,
#a78bfa);

-webkit-background-clip:text;
-webkit-text-fill-color:transparent;

background-clip:text;

filter:
drop-shadow(0 0 10px rgba(34,211,238,.45));

opacity:0;

animation:
wordFlow
4.8s linear infinite;

}

.nv-word:nth-child(2){

top:42%;

}

.nv-word:nth-child(3){

top:57%;

}

.nv-word:nth-child(4){

top:48%;

}

.nv-word:nth-child(5){

top:36%;

}

.nv-word:nth-child(6){

top:63%;

}

.nv-word:nth-child(7){

top:53%;

}

.nv-word:nth-child(8){

top:44%;

}

.nv-word:nth-child(9){

top:59%;

}

.nv-word:nth-child(10){

top:38%;

}

.nv-stream-particle{

position:absolute;

left:40px;
top:50%;

width:4px;
height:4px;

border-radius:50%;

background:#22d3ee;

filter:
blur(.3px);

box-shadow:
0 0 12px rgba(34,211,238,.8);

animation:
particleFlow
3.6s linear infinite;

opacity:0;

}

.nv-title{

margin-top:55px;

display:flex;

flex-direction:column;

align-items:center;

opacity:0;

transform:
translateY(18px);

transition:

opacity .7s ease,

transform .7s cubic-bezier(.22,1,.36,1);

}

.nv-title.show{

opacity:1;

transform:
translateY(0);

}

.nv-title h1{

margin:0;

font-size:46px;

font-weight:800;

letter-spacing:-.05em;

background:

linear-gradient(

135deg,

#ffffff,

#dbeafe,

#22d3ee,

#818cf8,

#a78bfa);

background-size:220% 220%;

-webkit-background-clip:text;

-webkit-text-fill-color:transparent;

background-clip:text;

animation:
gradientShift
5s linear infinite;

}

.nv-title p{

margin-top:12px;

font-size:12px;

letter-spacing:.16em;

font-family:

"JetBrains Mono",

monospace;

text-transform:uppercase;

color:

rgba(180,190,210,.55);

}

.nv-progress-container{

width:340px;

margin-top:45px;

opacity:0;

transform:
translateY(16px);

transition:

opacity .6s ease,

transform .6s ease;

}

.nv-progress-container.show{

opacity:1;

transform:
translateY(0);

}

.nv-progress-track{

height:3px;

border-radius:999px;

background:

rgba(255,255,255,.05);

overflow:hidden;

position:relative;

}

.nv-progress-fill{

height:100%;

position:relative;

border-radius:999px;

background:

linear-gradient(

90deg,

#22d3ee,

#818cf8,

#a78bfa);

transition:

width .08s linear;

}

.nv-progress-glow{

position:absolute;

right:-6px;

top:-4px;

width:12px;

height:12px;

border-radius:50%;

background:#ffffff;

box-shadow:

0 0 14px #22d3ee,

0 0 28px rgba(34,211,238,.65);

}

.nv-progress-info{

display:flex;

justify-content:space-between;

margin-top:14px;

font-size:11px;

font-family:

"JetBrains Mono",

monospace;

}

.nv-step{

color:

rgba(180,190,210,.55);

animation:

fadeStep

.35s ease;

}

.nv-percent{

font-weight:700;

color:#22d3ee;

}

.nv-bottom-glow{

position:absolute;

bottom:-240px;

left:50%;

transform:

translateX(-50%);

width:900px;

height:500px;

border-radius:50%;

background:

radial-gradient(

circle,

rgba(34,211,238,.10),

transparent 70%);

filter:

blur(90px);

pointer-events:none;

}

@keyframes wordFlow{
  0%{
    transform: translate(125px, 15px) scale(.65);
    opacity:0;
  }
  15%{
    opacity:1;
  }
  50%{
    opacity:1;
  }
  100%{
    transform: translate(315px, -18px) scale(1);
    opacity:0;
  }
}

@keyframes particleFlow{
  0%{
    transform: translate(125px, 20px) scale(.2);
    opacity:0;
  }
  15%{
    opacity:1;
  }
  100%{
    transform: translate(335px, -12px) scale(1.8);
    opacity:0;
  }
}@keyframes logoBreath{

0%{

transform:
scale(1);

box-shadow:

0 0 40px rgba(34,211,238,.18),

0 0 80px rgba(129,140,248,.10),

inset 0 1px rgba(255,255,255,.08);

}

50%{

transform:
scale(1.045);

box-shadow:

0 0 70px rgba(34,211,238,.28),

0 0 120px rgba(129,140,248,.18),

0 0 180px rgba(167,139,250,.10),

inset 0 1px rgba(255,255,255,.12);

}

100%{

transform:
scale(1);

box-shadow:

0 0 40px rgba(34,211,238,.18),

0 0 80px rgba(129,140,248,.10),

inset 0 1px rgba(255,255,255,.08);

}

}

@keyframes ringPulse{

0%{

transform:
scale(.92);

opacity:.55;

}

50%{

transform:
scale(1.12);

opacity:.08;

}

100%{

transform:
scale(.92);

opacity:.55;

}

}

@keyframes orbA{

0%{

transform:
translate(0,0);

}

100%{

transform:
translate(60px,45px);

}

}

@keyframes orbB{

0%{

transform:
translate(0,0);

}

100%{

transform:
translate(-60px,-40px);

}

}

@keyframes gridFloat{

0%{

background-position:
0 0;

}

100%{

background-position:
70px 70px;

}

}

@keyframes grid-drift {
  from { background-position: 0 0; }
  to   { background-position: 56px 56px; }
}

@keyframes gradientShift{

0%{

background-position:
0% 50%;

}

100%{

background-position:
200% 50%;

}

}

@keyframes fadeStep{

0%{

opacity:0;

transform:
translateY(6px);

}

100%{

opacity:1;

transform:
translateY(0);

}

}

@keyframes particleFloat{

0%{

transform:
translateY(0);

opacity:.12;

}

50%{

opacity:.45;

}

100%{

transform:
translateY(-18px);

opacity:.12;

}

}

.nv-particle{

position:absolute;

border-radius:50%;

background:#22d3ee;

opacity:.15;

animation:
particleFloat linear infinite;

}

.nv-particle:nth-child(even){

background:#818cf8;

}

.nv-particle:nth-child(3n){

background:#a78bfa;

}

.nv-logo img {
  border-radius: 34px;
}

@media (max-width:700px){

.nv-title h1{

font-size:34px;

}

.nv-progress-container{

width:280px;

}

.nv-stream{

left:78px;

width:220px;

}

.nv-word{

font-size:11px;

}

.nv-logo{

width:95px;

height:95px;

}

}

`}</style>

    </div>

  );

};
