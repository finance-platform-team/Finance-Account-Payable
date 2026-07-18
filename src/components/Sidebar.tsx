import { LineChart, ListChecks, FileText, ChevronsLeft, ChevronsRight } from "lucide-react";

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
      <div className="sb-logo">
        <div className="sb-logo-icon">C</div>
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

      <button className="sb-item" disabled title="قريبًا">
        <FileText size={14} />
        <span>AP Planning</span>
        <span className="sb-badge">Soon</span>
      </button>

      <button className="sb-collapse-btn" onClick={onToggleCollapsed}>
        {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
        <span>{collapsed ? "" : "Collapse"}</span>
      </button>
    </aside>
  );
}