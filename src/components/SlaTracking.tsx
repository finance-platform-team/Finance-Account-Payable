// src/components/SlaTracking.tsx

import { useCallback, useEffect, useState } from "react";
import {
  computeSlaTrackingStatus,
  fetchSlaTrackingList,
  formatSlaTrackingDate,
  formatTimeLeft,
} from "../lib/slaService";
import type { SlaTrackingRecord, SlaTrackingStatus } from "../types/sla";

const STATUS_BADGE: Record<SlaTrackingStatus, { style: React.CSSProperties; label: string }> = {
  ontrack: { style: { background: "var(--green-soft)", color: "var(--green-dark)" }, label: "On Track" },
  warning: { style: { background: "var(--amber-soft)", color: "#7a4f0a" }, label: "Warning" },
  escalated: { style: { background: "#ffe4d6", color: "#9a4a12" }, label: "Escalated" },
  breached: { style: { background: "#fbe1e1", color: "var(--danger)" }, label: "Breached" },
  completed: { style: { background: "var(--surface-hover)", color: "var(--muted)" }, label: "Completed" },
};

const FILTER_OPTIONS: { value: "all" | SlaTrackingStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ontrack", label: "On Track" },
  { value: "warning", label: "Warning" },
  { value: "escalated", label: "Escalated" },
  { value: "breached", label: "Breached" },
  { value: "completed", label: "Completed" },
];

export default function SlaTracking() {
  const [list, setList] = useState<SlaTrackingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | SlaTrackingStatus>("all");

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSlaTrackingList();
      setList(data);
    } catch (e) {
      console.error("Failed to load cfm_slatracking records:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount.
    loadList();
  }, [loadList]);

  const rows = list
    .map((r) => ({ r, status: computeSlaTrackingStatus(r) }))
    .filter((x) => filter === "all" || x.status === filter);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 16 }}>
        <div>
          <div style={{ font: "700 14px var(--sans)", color: "var(--brand-black)" }}>SLA Tracking (Live)</div>
          <div style={{ font: "400 12px var(--body)", color: "var(--muted)", marginTop: 2 }}>
            Every open, warned, escalated, and breached SLA clock across AP Payment Plan.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div className="select-wrap">
            <select value={filter} onChange={(e) => setFilter(e.target.value as "all" | SlaTrackingStatus)}>
              {FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="sel-arrow">▾</span>
          </div>
          <button className="btn btn-outline" onClick={loadList}>
            Refresh
          </button>
        </div>
      </div>

      <div className="pp-panel" style={{ overflow: "auto" }}>
        <table className="config-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Action</th>
              <th>Start</th>
              <th>Deadline</th>
              <th>Time Left</th>
              <th>Status</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 30, color: "var(--muted)" }}>
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 30, color: "var(--muted)" }}>
                  No SLA tracking records found.
                </td>
              </tr>
            ) : (
              rows.map(({ r, status }) => {
                const badge = STATUS_BADGE[status];
                const flags: string[] = [];
                if (r.warningSent) flags.push(`Warned (${formatSlaTrackingDate(r.warningDate)})`);
                if (r.escalated) flags.push(`Escalated (${formatSlaTrackingDate(r.escalatedDate)})`);
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td>{r.action}</td>
                    <td style={{ fontFamily: "var(--mono)" }}>{formatSlaTrackingDate(r.startDate)}</td>
                    <td style={{ fontFamily: "var(--mono)" }}>{formatSlaTrackingDate(r.deadline)}</td>
                    <td style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>{formatTimeLeft(r.deadline)}</td>
                    <td>
                      <span className="pp-badge" style={badge.style}>
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ font: "400 11px var(--body)", color: "var(--muted)" }}>
                      {flags.length === 0 ? "-" : flags.join(" · ")}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
