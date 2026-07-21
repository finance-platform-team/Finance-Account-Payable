import { LineChart, ListChecks, FileText, Menu } from "lucide-react";

export type PageKey = "cfs" | "tms" | "ap";

interface SidebarProps {
  activePage: PageKey;
  onNavigate: (page: PageKey) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export default function Sidebar({
  activePage,
  onNavigate,
  collapsed,
  onToggleCollapsed,
}: SidebarProps) {
  return (

       


    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>

<div className="sb-logo" onClick={onToggleCollapsed}>
  <button
    className="sb-toggle-btn"
    onClick={(e) => {
      e.stopPropagation();
      onToggleCollapsed();
    }}
    title="Toggle sidebar"
  >
    <Menu size={15} />
  </button>
  <div className="sb-logo-text">CFM Suite</div>
</div>
      <div className="sb-section">Main</div>

      <button
        className={`sb-item${activePage === "cfs" ? " active" : ""}`}
        onClick={() => onNavigate("cfs")}
      >
        <LineChart size={14} />
        <span>Cash Flow Statement</span>
      </button>

      <button
        className={`sb-item${activePage === "tms" ? " active" : ""}`}
        onClick={() => onNavigate("tms")}
      >
        <ListChecks size={14} />
        <span>TMS Hand Off</span>
      </button>

      <button className="sb-item" disabled title="Soon">
        <FileText size={14} />
        <span>AP Planning</span>
        <span className="sb-badge">Soon</span>
      </button>
    </aside>
  );
}