import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { Sidebar } from "./components/Sidebar";
import { OverviewDashboard } from "./components/OverviewDashboard";
import { HistoryView } from "./components/HistoryView";
import { SettingsDashboard } from "./components/SettingsDashboard";
import { RecordingOverlay } from "./components/RecordingOverlay";
import { SplashScreen } from "./components/SplashScreen";
import { TitleBar } from "./components/TitleBar";
import { invoke } from "@tauri-apps/api/core";
import { BookOpen, FileText, Keyboard, BarChart2, ArrowRight, Trash2, Search } from "lucide-react";
import { HotkeyCapture } from "./components/HotkeyCapture";
import "./App.css";

function App() {
  const [windowLabel] = useState<string>(() => {
    try {
      return getCurrentWindow().label;
    } catch {
      return "main";
    }
  });
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [showSplash, setShowSplash] = useState<boolean>(true);

  // Dictionary replacement state (must be declared before any early return)
  const [customRules, setCustomRules] = useState([
    { from: "nexora voice", to: "NexoraVoice" },
    { from: "use effect hook", to: "useEffect" },
    { from: "java script", to: "JavaScript" },
    { from: "voice dictation", to: "VoiceDictation" }
  ]);
  const [newFrom, setNewFrom] = useState("");
  const [newTo, setNewTo] = useState("");
  const [ruleSearch, setRuleSearch] = useState("");

  const [settings, setSettings] = useState<any>(null);

  const loadSettings = async () => {
    try {
      const s = await invoke<any>("get_settings");
      if (s) {
        setSettings(s);
        if (typeof s.custom_instructions === "string") {
          setCustomInstructions(s.custom_instructions);
        }
      }
    } catch (e) {
      console.error("Failed to load settings in App.tsx:", e);
    }
  };

  const handleCloseSettings = () => {
    setIsSettingsOpen(false);
    loadSettings();
  };

  const handleShortcutChange = async (key: string, newHotkey: string) => {
    if (!settings) return;
    const newSettings = { ...settings, [key]: newHotkey };
    setSettings(newSettings);
    try {
      await invoke("update_settings", { settings: newSettings });
    } catch (e) {
      console.error("Failed to update shortcut:", e);
    }
  };

  const [customInstructions, setCustomInstructions] = useState<string>(
    "# Custom Parser Context Rules:\n" +
    "- Autocorrect structural spoken anomalies.\n" +
    "- Format standard React, HTML, CSS, JavaScript, and Rust programming terms.\n" +
    "- Support automatic snake_case, camelCase, and PascalCase injections.\n" +
    "- Ensure punctuation remains clean and technical syntax remains intact."
  );
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  const handleSaveInstructions = async () => {
    try {
      const currentSettings = await invoke<any>("get_settings");
      currentSettings.custom_instructions = customInstructions;
      await invoke("update_settings", { settings: currentSettings });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      console.error("Failed to save instructions:", e);
    }
  };

  const [history, setHistory] = useState<any[]>([]);

  const loadHistory = async () => {
    try {
      const logs = await invoke<any[]>("get_history");
      setHistory(logs);
    } catch (e) {
      console.error("Failed to load history in App.tsx:", e);
    }
  };

  useEffect(() => {
    loadSettings();
    loadHistory();
    
    const unlistenSTT = listen<any[]>("history-updated", (event) => {
      setHistory(event.payload);
    });

    const unlistenSettings = listen("open-settings", () => {
      setIsSettingsOpen(true);
    });

    // windowLabel is initialized synchronously at creation
    return () => {
      unlistenSTT.then((fn) => fn());
      unlistenSettings.then((fn) => fn());
    };
  }, []);

  if (windowLabel === "overlay") {
    return (
      <div style={{ width: "100%", height: "100%", background: "transparent" }}>
        <RecordingOverlay />
      </div>
    );
  }



  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFrom.trim() || !newTo.trim()) return;
    // Avoid duplicates
    if (customRules.some(r => r.from === newFrom.trim().toLowerCase())) return;
    setCustomRules([...customRules, { from: newFrom.trim().toLowerCase(), to: newTo.trim() }]);
    setNewFrom("");
    setNewTo("");
  };

  const handleDeleteRule = (fromVal: string) => {
    setCustomRules(customRules.filter(r => r.from !== fromVal));
  };

  // Dictionary Tab View
  const renderDictionaryView = () => {
    const filteredRules = customRules.filter(
      rule => rule.from.toLowerCase().includes(ruleSearch.toLowerCase()) || 
              rule.to.toLowerCase().includes(ruleSearch.toLowerCase())
    );

    return (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", gap: 16, minWidth: 0, boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "12px",
            width: 38,
            height: 38,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <BookOpen className="h-5 w-5 text-slate-300" />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "#fff", letterSpacing: "-0.01em" }}>
              Casing Dictionary
            </h1>
            <span style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.45)" }}>
              Automatically replace custom dictation keywords and abbreviations with correct casing.
            </span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1.1fr", gap: "24px", flexGrow: 1, minHeight: 0, paddingBottom: 8 }}>
          {/* Rules List Column */}
          <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)", margin: 0 }}>Active Replacement Rules</h3>
              <div style={{ position: "relative", width: "200px" }}>
                <Search className="h-3.5 w-3.5" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)" }} />
                <input
                  type="text"
                  placeholder="Search rules..."
                  value={ruleSearch}
                  onChange={(e) => setRuleSearch(e.target.value)}
                  style={{
                    width: "100%",
                    background: "rgba(0,0,0,0.2)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: "6px",
                    padding: "5px 10px 5px 30px",
                    color: "#fff",
                    fontSize: 11.5,
                    outline: "none",
                    transition: "border-color 0.2s"
                  }}
                  onFocus={(e) => e.target.style.borderColor = "rgba(139, 92, 246, 0.3)"}
                  onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.06)"}
                />
              </div>
            </div>

            {/* Table headers */}
            {filteredRules.length > 0 && (
              <div style={{ display: "flex", padding: "0 18px", fontSize: 9.5, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: "0.05em", textTransform: "uppercase", flexShrink: 0 }}>
                <div style={{ flex: 1 }}>Spoken Text</div>
                <div style={{ width: 24, display: "flex", justifyContent: "center" }}></div>
                <div style={{ flex: 1, paddingLeft: 12 }}>Casing Output</div>
                <div style={{ width: 100, textAlign: "right" }}>Actions</div>
              </div>
            )}
            
            <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", overflowY: "auto", overflowX: "hidden", paddingRight: 8, minWidth: 0, boxSizing: "border-box" }}>
              {filteredRules.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 10px", gap: 8 }}>
                  <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, textAlign: "center" }}>
                    {ruleSearch ? "No matching rules found." : "No custom casing rules added yet. Add one on the right!"}
                  </span>
                </div>
              ) : (
                filteredRules.map((rule) => (
                  <div key={rule.from} style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "rgba(255,255,255,0.015)",
                    border: "1px solid rgba(255,255,255,0.04)",
                    borderRadius: "8px",
                    padding: "10px 18px",
                    fontSize: 12,
                    transition: "border-color 0.2s"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)"}
                  >
                    <div style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0, gap: 12 }}>
                      <span style={{ color: "rgba(255,255,255,0.5)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", flex: 1 }}>
                        {rule.from}
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-500 flex-shrink-0" />
                      <span style={{ color: "#fff", fontWeight: 600, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", flex: 1, paddingLeft: 12 }}>
                        {rule.to}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, width: 100, justifyContent: "flex-end", flexShrink: 0 }}>
                      <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: "rgba(16, 185, 129, 0.12)", color: "#10b981" }}>
                        Active
                      </span>
                      <button
                        onClick={() => handleDeleteRule(rule.from)}
                        style={{ background: "none", border: "none", color: "rgba(239, 68, 68, 0.6)", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
                        onMouseEnter={(e) => e.currentTarget.style.color = "#ef4444"}
                        onMouseLeave={(e) => e.currentTarget.style.color = "rgba(239, 68, 68, 0.6)"}
                        title="Delete Rule"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Add Rule Column */}
          <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 18, height: "fit-content" }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)", margin: 0 }}>Add Custom Casing Rule</h3>
            
            <form onSubmit={handleAddRule} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)" }}>Spoken Text (lowercase)</label>
                <input
                  type="text"
                  value={newFrom}
                  onChange={(e) => setNewFrom(e.target.value)}
                  placeholder="e.g. use effect hook"
                  style={{
                    background: "rgba(0,0,0,0.25)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    color: "#fff",
                    fontSize: 12,
                    outline: "none",
                    transition: "border-color 0.2s"
                  }}
                  onFocus={(e) => e.target.style.borderColor = "rgba(139, 92, 246, 0.3)"}
                  onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.06)"}
                  required
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)" }}>Replacement Casing</label>
                <input
                  type="text"
                  value={newTo}
                  onChange={(e) => setNewTo(e.target.value)}
                  placeholder="e.g. useEffect"
                  style={{
                    background: "rgba(0,0,0,0.25)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    color: "#fff",
                    fontSize: 12,
                    outline: "none",
                    transition: "border-color 0.2s"
                  }}
                  onFocus={(e) => e.target.style.borderColor = "rgba(139, 92, 246, 0.3)"}
                  onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.06)"}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn-primary"
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  marginTop: 4
                }}
              >
                Add Casing Rule
              </button>
            </form>

            <div style={{
              background: "rgba(255,255,255,0.01)",
              border: "1px solid rgba(255,255,255,0.04)",
              borderRadius: 8,
              padding: 12,
              fontSize: 10.5,
              color: "rgba(255,255,255,0.35)",
              lineHeight: 1.5
            }}>
              💡 <strong>Pro Tip:</strong> Replaced words are matched case-insensitively. This is processed immediately after speech-to-text finishes to auto-correct coding terms.
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Instructions Tab View
  const renderInstructionsView = () => {
    return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", gap: 16, minWidth: 0, boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "12px",
          width: 38,
          height: 38,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}>
          <FileText className="h-5 w-5 text-slate-300" />
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "#fff", letterSpacing: "-0.01em" }}>
            Instructions Prompt
          </h1>
          <span style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.45)" }}>
            Custom rules and context passed to the Whisper post-processor parser.
          </span>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: "24px", flexGrow: 1, display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)", margin: 0 }}>Active Directives</h3>
        <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, margin: 0 }}>
          Define custom prompt instructions, formatting rules, punctuation preferences, or shorthand replacements. The Whisper post-processor parser will automatically apply these guidelines to your dictation before focus injection.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, flexGrow: 1, minHeight: 0 }}>
          <textarea
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            placeholder="Enter custom formatting guidelines or terminology preferences here..."
            style={{
              background: "rgba(0,0,0,0.25)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "12px",
              padding: "16px 20px",
              fontFamily: "monospace",
              fontSize: 12.5,
              color: "rgba(255,255,255,0.85)",
              flexGrow: 1,
              lineHeight: 1.6,
              resize: "none",
              outline: "none",
              transition: "border-color 0.2s"
            }}
            onFocus={(e) => e.target.style.borderColor = "rgba(139, 92, 246, 0.4)"}
            onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.06)"}
          />
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
              {customInstructions.length} characters
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {saveSuccess && (
                <span style={{ fontSize: 11, color: "#10b981", fontWeight: 600 }}>
                  ✓ Saved successfully
                </span>
              )}
              <button
                onClick={handleSaveInstructions}
                className="btn-primary"
                style={{
                  padding: "8px 20px",
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Save Instructions
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    );
  };

  // Shortcuts Tab View
  const renderShortcutsView = () => {
    return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", gap: 16, minWidth: 0, boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "12px",
          width: 38,
          height: 38,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}>
          <Keyboard className="h-5 w-5 text-slate-300" />
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "#fff", letterSpacing: "-0.01em" }}>
            Global Shortcuts
          </h1>
          <span style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.45)" }}>
            Review global key combinations to trigger app functionality.
          </span>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: "24px", flexGrow: 1, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)", margin: 0 }}>Keyboard Configurations</h3>
        
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { label: "Toggle Voice Dictation", desc: "Start recording audio, speak, and press again to inject text.", settingsKey: "hotkey" },
            { label: "Cancel Recording", desc: "Cancel current recording and wipe buffer without pasting.", settingsKey: "cancel_hotkey" },
            { label: "Open Settings", desc: "Open the dictation settings configuration modal panel.", settingsKey: "settings_hotkey" },
            { label: "Format Mode Toggle", desc: "Instantly switch casing formatting modes between camel, snake, pascal.", settingsKey: "format_hotkey" }
          ].map((sh) => (
            <div key={sh.label} style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.04)",
              borderRadius: "10px",
              padding: "16px 20px"
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1, paddingRight: 20 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{sh.label}</span>
                <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)", textOverflow: "ellipsis", overflow: "hidden" }}>{sh.desc}</span>
              </div>
              <div style={{ width: 220, flexShrink: 0 }}>
                <HotkeyCapture
                  value={settings ? settings[sh.settingsKey] || "" : ""}
                  onChange={(val) => handleShortcutChange(sh.settingsKey, val)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
    );
  };

  // Stats Tab View
  const renderStatsView = () => {
    const getDailyActivity = () => {
      const activity = [
        { day: "Mon", val: 0 },
        { day: "Tue", val: 0 },
        { day: "Wed", val: 0 },
        { day: "Thu", val: 0 },
        { day: "Fri", val: 0 },
        { day: "Sat", val: 0 },
        { day: "Sun", val: 0 }
      ];
      
      history.forEach(log => {
        if (!log.timestamp) return;
        const date = new Date(log.timestamp);
        const dayIndex = date.getDay(); // 0 is Sunday, 1 is Monday...
        const targetIndex = dayIndex === 0 ? 6 : dayIndex - 1;
        const durationMin = (log.audio_duration_ms || 0) / 1000 / 60;
        activity[targetIndex].val += durationMin;
      });
      
      return activity;
    };
    
    const dailyActivity = getDailyActivity();
    const maxActivityVal = Math.max(...dailyActivity.map(a => a.val), 0.1);

    const getTopKeywords = () => {
      const frequencies: Record<string, number> = {};
      const stopWords = new Set([
        "the", "and", "to", "a", "of", "in", "i", "you", "he", "she", "it", "they", "we", "is", "was", "are", "were", 
        "that", "this", "for", "on", "with", "as", "at", "by", "an", "your", "my", "me", "our", "us", "them",
        "here", "there", "about", "would", "could", "should", "from", "or", "but", "not", "have", "has", "had", 
        "do", "does", "did", "go", "goes", "went", "can", "will", "would", "what", "which", "who", "how", "why"
      ]);

      history.forEach(log => {
        if (!log.text) return;
        const words = log.text.toLowerCase().split(/\s+/);
        words.forEach((word: string) => {
          const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "").trim();
          if (cleanWord && cleanWord.length > 2 && !stopWords.has(cleanWord)) {
            frequencies[cleanWord] = (frequencies[cleanWord] || 0) + 1;
          }
        });
      });

      return Object.entries(frequencies)
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    };

    const topKeywords = getTopKeywords();

    return (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", gap: 16, minWidth: 0, boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "12px",
            width: 38,
            height: 38,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <BarChart2 className="h-5 w-5 text-slate-300" />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "#fff", letterSpacing: "-0.01em" }}>
              Voice Analytics
            </h1>
            <span style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.45)" }}>
              Overview analytics of word output and speaking frequency.
            </span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "20px", flexGrow: 1, minHeight: 0 }}>
          {/* Speaking Frequency Chart Column */}
          <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)", margin: 0 }}>Daily Speaking Activity (Minutes)</h3>
            
            {history.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexGrow: 1, color: "rgba(255,255,255,0.3)", fontSize: 12 }}>
                No dictation activity recorded yet.
              </div>
            ) : (
              /* Custom HTML Bar Chart */
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexGrow: 1, height: "180px", padding: "10px 10px 0 10px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {dailyActivity.map((d) => (
                  <div key={d.day} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flexGrow: 1 }}>
                    <div style={{
                      width: "18px",
                      height: `${(d.val / maxActivityVal) * 140}px`,
                      minHeight: d.val > 0 ? "4px" : "0px",
                      background: "linear-gradient(to top, #8b5cf6, #06b6d4)",
                      borderRadius: "4px 4px 0 0",
                      boxShadow: d.val > 0 ? "0 0 10px rgba(6, 182, 212, 0.25)" : "none",
                      transition: "height 0.4s"
                    }} title={`${d.val.toFixed(2)} mins`} />
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>{d.day}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Analytics Distribution */}
          <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)", margin: 0 }}>Top Dictated Keywords</h3>
            
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignContent: "flex-start", flexGrow: 1 }}>
              {topKeywords.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", color: "rgba(255,255,255,0.3)", fontSize: 12 }}>
                  Not enough dictation history to generate keyword statistics yet.
                </div>
              ) : (
                topKeywords.map((kw) => (
                  <div key={kw.word} style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: "20px",
                    padding: "6px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 11
                  }}>
                    <span style={{ color: "#fff", fontWeight: 600 }}>{kw.word}</span>
                    <span style={{ color: "rgba(6, 182, 212, 0.8)", fontFamily: "monospace" }}>{kw.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="app-shell" style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <TitleBar />
      <div style={{ display: "flex", flexGrow: 1, height: "calc(100vh - 30px)", overflow: "hidden" }}>
        
        {/* Left persistent sidebar */}
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          onOpenSettings={() => setIsSettingsOpen(true)} 
        />

        {/* Core Workspace content frame */}
        <div
          className="app-content"
          style={{
            flexGrow: 1,
            minWidth: 0,
            width: 0,          /* force flex child to shrink/grow properly */
            padding: "20px 24px",
            overflow: "hidden",
            position: "relative",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {activeTab === "overview" && <OverviewDashboard />}
          {activeTab === "history" && <HistoryView />}
          {activeTab === "dictionary" && renderDictionaryView()}
          {activeTab === "instructions" && renderInstructionsView()}
          {activeTab === "shortcuts" && renderShortcutsView()}
          {activeTab === "stats" && renderStatsView()}

          {/* Configurations modal overlay */}
          <SettingsDashboard isOpen={isSettingsOpen} onClose={handleCloseSettings} />
        </div>
      </div>
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
    </div>
  );
}

export default App; // Force touch recompilation
