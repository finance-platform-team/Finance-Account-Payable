import { LineChart, ListChecks, FileText, Menu, Settings } from "lucide-react";
import { useCurrentUser } from "../lib/CurrentUserContext";
export type PageKey = "cfs" | "tms" | "ap" | "pp" | "pp-sc" | "adv" | "treasury"| "config"; interface SidebarProps {
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
  const { loading: rolesLoading, allowedPages } = useCurrentUser();

  // Mirrors applyRoleSecurity(): everything is hidden until roles resolve
  // (no flash of menu items the user isn't allowed to see), then only the
  // allowed PageKeys are shown.
  function isVisible(page: string): boolean {
    if (rolesLoading) return false;
    return allowedPages.has(page);
  }

  const AP_SUB_PAGES = ["ap", "pp", "pp-sc", "adv", "treasury"];
  const visibleApPages = AP_SUB_PAGES.filter((p) => isVisible(p));
  const isApSection =
    activePage === "ap" ||
    activePage === "pp" ||
    activePage === "pp-sc" ||
    activePage === "adv" ||
    activePage === "treasury";

  function handleApParentClick() {
    // Mirrors applyRoleSecurity()'s "if firstMenu is the AP parent, pick
    // the first child" logic — navigate straight to the first sub-page
    // this user is actually allowed to see.
    if (visibleApPages.length > 0) onNavigate(visibleApPages[0] as never);
  }

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
      {isVisible("cfs") && (
        <button
          className={`sb-item${activePage === "cfs" ? " active" : ""}`}
          onClick={() => onNavigate("cfs")}
        >
          <LineChart size={14} />
          <span>Cash Flow Statement</span>
        </button>
      )}
      {isVisible("tms") && (
        <button
          className={`sb-item${activePage === "tms" ? " active" : ""}`}
          onClick={() => onNavigate("tms")}
        >
          <ListChecks size={14} />
          <span>TMS Hand Off</span>
        </button>
      )}
      {visibleApPages.length > 0 && (
        <button
          className={`sb-item${isApSection ? " active" : ""}`}
          onClick={handleApParentClick}
        >
          <FileText size={14} />
          <span>AP Planning</span>
        </button>
      )}
      {isApSection && (
        <>
          {isVisible("ap") && (
            <button
              className={`sb-item${activePage === "ap" ? " active" : ""}`}
              style={{ paddingLeft: 34 }}
              onClick={() => onNavigate("ap")}
            >
              <span>AP Supervision</span>
            </button>
          )}
          {isVisible("pp") && (
            <button
              className={`sb-item${activePage === "pp" ? " active" : ""}`}
              style={{ paddingLeft: 34 }}
              onClick={() => onNavigate("pp")}
            >
              <span>Payment Plan</span>
            </button>
          )}
          {isVisible("pp-sc") && (
            <button
              className={`sb-item${activePage === "pp-sc" ? " active" : ""}`}
              style={{ paddingLeft: 34 }}
              onClick={() => onNavigate("pp-sc")}
            >
              <span>Payment Plan (SC View)</span>
            </button>
          )}
          {isVisible("adv") && (
            <button
              className={`sb-item${activePage === "adv" ? " active" : ""}`}
              style={{ paddingLeft: 34 }}
              onClick={() => onNavigate("adv")}
            >
              <span>Advance Payments</span>
            </button>
          )}
          {isVisible("treasury") && (
            <button
              className={`sb-item${activePage === "treasury" ? " active" : ""}`}
              style={{ paddingLeft: 34 }}
              onClick={() => onNavigate("treasury")}
            >
              <span>Treasury</span>
            </button>
          )}
        </>
      )}
      <button
        className={`sb-item${activePage === "config" ? " active" : ""}`}
        onClick={() => onNavigate("config")}
      >
        <Settings size={14} />
        <span>Configuration</span>
      </button>
    </aside>
  );
}