import React from "react";
import { 
  Home, 
  History, 
  BookOpen, 
  FileText, 
  Keyboard, 
  BarChart2, 
  Settings 
} from "lucide-react";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenSettings: () => void;
  dictionaryCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  activeTab, 
  setActiveTab, 
  onOpenSettings,
  dictionaryCount = 0
}) => {
  const navItems = [
    { id: "overview",      label: "Overview",      icon: Home },
    { id: "history",       label: "History",       icon: History },
    { id: "stats",         label: "Stats",         icon: BarChart2 },
    { id: "dictionary",   label: "Dictionary",    icon: BookOpen, badge: dictionaryCount > 0 ? String(dictionaryCount) : undefined },
    { id: "instructions", label: "Instructions",  icon: FileText },
    { id: "shortcuts",    label: "Shortcuts",     icon: Keyboard },
  ];

  return (
    <aside style={{
      width: "210px",
      background: "#05070a",
      borderRight: "1px solid rgba(255, 255, 255, 0.05)",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      height: "100%",
      padding: "20px 12px 16px 12px",
      boxSizing: "border-box",
      flexShrink: 0,
      zIndex: 10
    }}>
      {/* Nav List */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 4, flexGrow: 1 }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                border: isActive ? "1px solid rgba(139, 92, 246, 0.25)" : "1px solid transparent",
                borderRadius: "8px",
                background: isActive ? "linear-gradient(90deg, rgba(37, 99, 235, 0.35) 0%, rgba(139, 92, 246, 0.22) 100%)" : "transparent",
                boxShadow: isActive ? "0 4px 15px rgba(139, 92, 246, 0.12)" : "none",
                color: isActive ? "#fff" : "rgba(255, 255, 255, 0.45)",
                fontSize: 12,
                fontWeight: isActive ? 600 : 500,
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)";
                  e.currentTarget.style.color = "rgba(255, 255, 255, 0.7)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "rgba(255, 255, 255, 0.45)";
                }
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span style={{
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "1px 5px",
                  borderRadius: 8,
                  background: "#d97706",
                  color: "#fff"
                }}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Settings Trigger */}
      <button
        onClick={onOpenSettings}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          border: "1px solid rgba(255, 255, 255, 0.04)",
          borderRadius: "8px",
          background: "rgba(255, 255, 255, 0.02)",
          color: "rgba(255, 255, 255, 0.5)",
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          textAlign: "left",
          transition: "all 0.2s"
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
          e.currentTarget.style.color = "#fff";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)";
          e.currentTarget.style.color = "rgba(255, 255, 255, 0.5)";
        }}
      >
        <Settings className="h-4 w-4" />
        <span>Settings</span>
      </button>
    </aside>
  );
};
