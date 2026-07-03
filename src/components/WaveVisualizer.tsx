import React, { useEffect, useRef } from "react";
useRef;
import { listen } from "@tauri-apps/api/event";

export const WaveVisualizer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rmsRef = useRef<number>(0.0);
  const phaseRef = useRef<number>(0.0);

  useEffect(() => {
    // Listen to "audio-level" event broadcasted from Rust cpal loop
    const unlistenPromise = listen<number>("audio-level", (event) => {
      // Smooth out incoming value
      rmsRef.current = rmsRef.current * 0.6 + event.payload * 0.4;
    });

    // Animation Loop
    let animationId: number;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const render = () => {
          phaseRef.current += 0.15;
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          const width = canvas.width;
          const height = canvas.height;
          const centerY = height / 2;

          // Compute dynamic amplitude based on rms level
          let amplitude = rmsRef.current * 100.0;
          if (amplitude > 16.0) amplitude = 16.0; // Cap wave height for 45px vertical space
          if (amplitude < 1.5) amplitude = 1.5;

          // Draw neon drop shadow line
          ctx.shadowBlur = 10;
          ctx.shadowColor = "rgba(6, 182, 212, 0.4)";
          
          ctx.beginPath();
          ctx.lineWidth = 2;
          ctx.strokeStyle = "rgba(6, 182, 212, 0.95)"; // Neon cyan

          for (let x = 10; x < width - 10; x++) {
            // Taper wave at the edges
            const taper = Math.sin(((x - 10) / (width - 20)) * Math.PI);
            // Sine math
            const y = centerY + Math.sin(x * 0.05 - phaseRef.current) * amplitude * taper;
            if (x === 10) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
          
          // Disable shadow for other drawings
          ctx.shadowBlur = 0;

          animationId = requestAnimationFrame(render);
        };
        render();
      }
    }

    return () => {
      cancelAnimationFrame(animationId);
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={150}
      height={45}
      className="w-full h-[45px] bg-transparent opacity-90"
    />
  );
};
