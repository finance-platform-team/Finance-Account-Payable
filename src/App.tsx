import { useState } from "react";
import "./styles/AppShell.css";
import Sidebar, { type PageKey } from "./components/Sidebar";
import CashFlowStatement from "./components/CashFlowStatement";
import TmsHandoffPage from "./components/TmsHandoffPage";
import ApAgingTab from "./components/ApAgingTab";
import PaymentPlanTab from "./components/PaymentPlanTab";
import { ToastProvider } from "./lib/ToastContext";
function App() {
  const [activePage, setActivePage] = useState<PageKey>("cfs");
  const [collapsed, setCollapsed] = useState(false);
  return (
    <ToastProvider>
      <div className="app-shell">
        <Sidebar
          activePage={activePage}
          onNavigate={setActivePage}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((c) => !c)}
        />
        <div className={`app-main${collapsed ? " sb-collapsed" : ""}`}>
          {activePage === "cfs" && <CashFlowStatement />}
          {activePage === "tms" && <TmsHandoffPage />}
          {activePage === "ap" && <ApAgingTab />}
          {activePage === "pp" && <PaymentPlanTab />}
        </div>
      </div>
    </ToastProvider>
  );
}
export default App;