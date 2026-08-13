import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import "./styles/AppShell.css";
import Sidebar, { type PageKey } from "./components/Sidebar";
import CashFlowStatement from "./components/CashFlowStatement";
import TmsHandoffPage from "./components/TmsHandoffPage";
import ApAgingTab from "./components/ApAgingTab";
import PaymentPlanTab from "./components/PaymentPlanTab";
import PaymentPlanSCTab from "./components/PaymentPlanSC";
import AdvancePaymentsTab from "./components/AdvancePayments";
import TreasuryTab from "./components/TreasuryTab";
import ConfigurationTab from "./components/Configuration";
import { ToastProvider } from "./lib/ToastContext";
import { CurrentUserProvider, useCurrentUser } from "./lib/CurrentUserContext";
import { GlobalRegionProvider } from "./lib/GlobalRegionContext";

// Pages that are gated by role — "config" is intentionally NOT in this list
// (mirrors the original, where Configuration was never part of roleMenuMap
// and stayed unrestricted).
const GATED_PAGES: PageKey[] = ["cfs", "tms", "ap", "pp", "pp-sc", "adv", "treasury"];

function NoPermissionScreen() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        gap: 12,
        textAlign: "center",
        padding: 24,
      }}
    >
      <div style={{ font: "800 20px var(--sans)", color: "var(--brand-black)" }}>Access Denied</div>
      <div style={{ font: "400 14px var(--body)", color: "var(--muted)", maxWidth: 420 }}>
        You do not have the required permissions to access this dashboard. Please contact your
        system administrator to assign a role to your account.
      </div>
    </div>
  );
}

function AppShell() {
  const [activePage, setActivePage] = useState<PageKey>("cfs");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { loading, noAccess, allowedPages } = useCurrentUser();

  // Mirrors applyRoleSecurity()'s "navigate to first allowed menu" step.
  useEffect(() => {
    if (loading || noAccess) return;
    if (GATED_PAGES.includes(activePage) && !allowedPages.has(activePage)) {
      const firstAllowed = GATED_PAGES.find((p) => allowedPages.has(p));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (firstAllowed) setActivePage(firstAllowed);
    }
  }, [loading, noAccess, allowedPages, activePage]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <span style={{ font: "600 13px var(--sans)", color: "var(--muted)" }}>Loading…</span>
      </div>
    );
  }

  if (noAccess) return <NoPermissionScreen />;

  return (
    <div className="app-shell">
      <button
        className="sb-mobile-toggle"
        onClick={() => setMobileSidebarOpen(true)}
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>
      <Sidebar
        activePage={activePage}
        onNavigate={(page) => {
          setActivePage(page);
          setMobileSidebarOpen(false);
        }}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />
      <div className={`app-main${collapsed ? " sb-collapsed" : ""}`}>
        {activePage === "cfs" && <CashFlowStatement />}
        {activePage === "tms" && <TmsHandoffPage />}
        {activePage === "ap" && <ApAgingTab />}
        {activePage === "pp" && <PaymentPlanTab />}
        {activePage === "pp-sc" && <PaymentPlanSCTab />}
        {activePage === "adv" && <AdvancePaymentsTab />}
        {activePage === "treasury" && <TreasuryTab />}
        {activePage === "config" && <ConfigurationTab />}
      </div>
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <CurrentUserProvider>
        <GlobalRegionProvider>
          <AppShell />
        </GlobalRegionProvider>
      </CurrentUserProvider>
    </ToastProvider>
  );
}

export default App;