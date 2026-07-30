// src/components/Configuration.tsx

import { useState } from "react";
import RoleAccessConfig from "./RoleAccessConfig";
import "../styles/CashFlowStatement.css";

type ConfigSubScreen = "role" | "sla";

export default function ConfigurationTab() {
  const [subScreen, setSubScreen] = useState<ConfigSubScreen>("role");

  return (
    <div className="cfs-root">
      <div id="page-configuration" className="ap-screen active">
        {/* ── PAGE HEADER ── */}
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              font: "700 10px var(--sans)",
              textTransform: "uppercase",
              letterSpacing: 1,
              color: "var(--muted)",
              marginBottom: 5,
            }}
          >
            System · Configuration
          </div>
          <div style={{ font: "800 26px var(--sans)", color: "var(--brand-black)", letterSpacing: -0.4 }}>
            Configuration
          </div>
        </div>

        {/* ── SUBNAV ── */}
        <div id="config-subnav" style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid var(--border)" }}>
          <button
            className="sb-item"
            style={{
              borderRadius: "var(--r-md) var(--r-md) 0 0",
              ...(subScreen === "role"
                ? { background: "var(--gold-dark)", color: "#fff" }
                : {}),
            }}
            onClick={() => setSubScreen("role")}
          >
            <span>Role Access</span>
          </button>
          <button
            className="sb-item"
            style={{
              borderRadius: "var(--r-md) var(--r-md) 0 0",
              ...(subScreen === "sla"
                ? { background: "var(--gold-dark)", color: "#fff" }
                : {}),
            }}
            onClick={() => setSubScreen("sla")}
          >
            <span>SLA &amp; Escalation</span>
          </button>
        </div>

        {subScreen === "role" && <RoleAccessConfig />}
        {subScreen === "sla" && (
          <div className="pp-empty" style={{ padding: 48 }}>
            SLA &amp; Escalation configuration is coming soon.
          </div>
        )}
      </div>
    </div>
  );
}