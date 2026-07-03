import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// ─── Block all default browser shortcuts & context menu ───────────────────────
// These are meaningless (and disruptive) in a Tauri desktop app.

const BLOCKED_KEYS: Array<{ key: string; ctrl?: boolean; shift?: boolean; alt?: boolean }> = [
  // Reload
  { key: "r", ctrl: true },
  { key: "r", ctrl: true, shift: true },
  { key: "F5" },
  // DevTools
  { key: "F12" },
  { key: "i", ctrl: true, shift: true },
  { key: "j", ctrl: true, shift: true },
  { key: "c", ctrl: true, shift: true },
  { key: "k", ctrl: true, shift: true },
  // Find / Print / Save / View-source
  { key: "f", ctrl: true },
  { key: "p", ctrl: true },
  { key: "s", ctrl: true },
  { key: "u", ctrl: true },
  // Browser navigation
  { key: "l", ctrl: true },
  { key: "o", ctrl: true },
  // Zoom
  { key: "=", ctrl: true },
  { key: "-", ctrl: true },
  { key: "0", ctrl: true },
  // Reader / Caret
  { key: "F7" },
  { key: "F11" }, // fullscreen toggle
];

const isEditable = (el: EventTarget | null): boolean => {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || (el as HTMLElement).isContentEditable;
};

document.addEventListener("keydown", (e: KeyboardEvent) => {
  for (const rule of BLOCKED_KEYS) {
    const ctrlOk  = rule.ctrl  === undefined ? !e.ctrlKey  : e.ctrlKey  === rule.ctrl;
    const shiftOk = rule.shift === undefined ? !e.shiftKey : e.shiftKey === rule.shift;
    const altOk   = rule.alt   === undefined ? !e.altKey   : e.altKey   === rule.alt;
    const keyOk   = e.key === rule.key || e.key.toLowerCase() === rule.key.toLowerCase();

    if (keyOk && ctrlOk && shiftOk && altOk) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }

  // Block Ctrl+A select-all only on non-editable targets
  if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "a") {
    if (!isEditable(e.target)) {
      e.preventDefault();
    }
  }
}, true);

// Block right-click context menu everywhere except inputs & textareas
document.addEventListener("contextmenu", (e: MouseEvent) => {
  if (!isEditable(e.target)) {
    e.preventDefault();
  }
}, true);

// Block middle-click navigation
document.addEventListener("auxclick", (e: MouseEvent) => {
  if (e.button === 1) e.preventDefault();
}, true);

// Block browser drag-navigation on non-draggable elements
document.addEventListener("dragstart", (e: DragEvent) => {
  const target = e.target as HTMLElement;
  if (target.draggable) return;
  e.preventDefault();
}, true);
// ─────────────────────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
