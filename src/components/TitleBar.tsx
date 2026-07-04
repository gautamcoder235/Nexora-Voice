import React, { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { Minus, X, Maximize2, Minimize2 } from "lucide-react";

export const TitleBar: React.FC = () => {
  const appWindow = getCurrentWindow();
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const syncMax = async () => {
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
    };
    syncMax();

    // Listen to the built-in Tauri resize event (no extra permission needed)
    const unlisten = listen("tauri://resize", () => syncMax());
    return () => { unlisten.then(fn => fn()); };
  }, []);

  const handleToggleMaximize = async () => {
    await appWindow.toggleMaximize();
    setIsMaximized(await appWindow.isMaximized());
  };

  return (
    <div className="custom-titlebar" data-tauri-drag-region="true">
      <div className="titlebar-brand">
        <div className="titlebar-icon" style={{ overflow: "hidden" }}>
          <img src="/logo.jpg" alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <span className="titlebar-title">Nexora Voice Studio</span>
      </div>

      <div className="titlebar-controls">
        <button
          className="titlebar-btn minimize"
          onClick={() => appWindow.minimize()}
          aria-label="Minimize"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          className="titlebar-btn maximize"
          onClick={handleToggleMaximize}
          aria-label={isMaximized ? "Restore" : "Maximize"}
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized
            ? <Minimize2 className="h-3.5 w-3.5" />
            : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
        <button
          className="titlebar-btn close"
          onClick={() => appWindow.close()}
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
