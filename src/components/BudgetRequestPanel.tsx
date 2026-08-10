import { useCallback, useEffect, useState } from "react";
import {
  buildBudgetGrid,
  fetchBudgetRequests,
  getBUNamesForRegion,
} from "../lib/apBudgetRequestService";
import type { BudgetGrid, BudgetRegion } from "../types/apBudgetRequest";
import { MONTH_KEYS } from "../types/apBudgetRequest";
import BudgetRequestModal from "./Budgetrequestmodal";
import { useToast } from "../lib/ToastContext";

const YEAR_OPTIONS = ["2024", "2025", "2026", "2027"];

function fmt(v: number): string {
  return v
    ? Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })
    : "-";
}

export default function BudgetRequestPanel() {
  const [year, setYear] = useState("2026");
  const [region, setRegion] = useState<BudgetRegion>("Egypt");
  const [grid, setGrid] = useState<BudgetGrid | null>(null);
  const [loading, setLoading] = useState(false);
  const [noDataMessage, setNoDataMessage] = useState<string | null>(null);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const { showToast } = useToast();

  function handleRequestBudgetClick() {
    if (!year) {
      showToast("Required", "Please select a Year first.", "alert");
      return;
    }
    if (!region) {
      showToast("Required", "Please select a Region first.", "alert");
      return;
    }
    setDecisionOpen(true);
  }

  const loadGrid = useCallback(async () => {
    if (!year || !region) return;
    setLoading(true);
    try {
      const rows = await fetchBudgetRequests(year, region);
      // mirrors budgetRowsHaveAnyData(): fetchBudgetRequests only returns a
      // row per *existing* cfm_requestbudget record, so an empty array means
      // no record has ever been created for this Year+Region yet.
      if (rows.length === 0) {
        setGrid(null);
        setNoDataMessage(`No Budget Available for ${region} ${year}.`);
        return;
      }
      const buList = getBUNamesForRegion(region);
      const newGrid = buildBudgetGrid(rows, buList);
      setGrid(newGrid);
      setNoDataMessage(null);
    } catch (e) {
      console.error("Error loading budget request table:", e);
    } finally {
      setLoading(false);
    }
  }, [year, region]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadGrid();
  }, [loadGrid]);

  return (
    <div className="pp-panel" style={{ marginBottom: 20, overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          padding: "18px 22px",
          borderBottom: "1px solid var(--border)",
          background: "linear-gradient(180deg, #fff 0%, var(--canvas) 100%)",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ font: "700 16px var(--sans)", color: "var(--brand-black)", marginBottom: 4 }}>
            Budget Request
          </div>
          <div style={{ font: "400 12px var(--body)", color: "var(--muted)", maxWidth: 560, lineHeight: 1.6 }}>
            Request budget from Treasury via TMS. Approved adjustments will show below.
          </div>
        </div>
        <button
          className="btn btn-primary"
          style={{ padding: "8px 18px" }}
          onClick={handleRequestBudgetClick}
        >
          Request Budget
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 16, padding: "18px 22px 0 22px" }}>
        <div className="form-field" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
          <label className="field-lbl">
            Year <span className="field-req">*</span>
          </label>
          <div className="select-wrap" style={{ display: "block" }}>
            <select
              className="field-input"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              style={{ paddingRight: 32 }}
            >
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <span className="sel-arrow">▾</span>
          </div>
        </div>
        <div className="form-field" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
          <label className="field-lbl">
            Region <span className="field-req">*</span>
          </label>
          <div className="select-wrap" style={{ display: "block" }}>
            <select
              className="field-input"
              value={region}
              onChange={(e) => setRegion(e.target.value as BudgetRegion)}
              style={{ paddingRight: 32 }}
            >
              <option value="Egypt">Egypt</option>
              <option value="KSA">KSA</option>
            </select>
            <span className="sel-arrow">▾</span>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div style={{ padding: 18, overflowX: "auto" }}>
        {loading ? (
          <div className="pp-empty">Loading…</div>
        ) : noDataMessage ? (
          <div className="pp-empty">{noDataMessage}</div>
        ) : !grid ? (
          <div className="pp-empty">Select a year and region.</div>
        ) : (
          <table className="budget-grid-table">
            <thead>
              <tr>
                <th className="budget-grid-th">Entity</th>
                {MONTH_KEYS.map((m) => (
                  <th key={m} className="budget-grid-th">
                    {m.toUpperCase()}
                  </th>
                ))}
                <th className="budget-grid-th">Total</th>
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((row) => (
                <tr key={row.bu}>
                  <td className="budget-grid-td">{row.bu}</td>
                  {MONTH_KEYS.map((m) => (
                    <td key={m} className="budget-grid-td">
                      {row.amounts[m] ? fmt(row.amounts[m]) : "-"}
                    </td>
                  ))}
                  <td className="budget-grid-td budget-grid-total-td">
                    {fmt(row.total)}
                  </td>
                </tr>
              ))}
              <tr className="budget-grid-totals-row">
                <td className="budget-grid-td">TOTAL</td>
                {MONTH_KEYS.map((m) => (
                  <td key={m} className="budget-grid-td">
                    {fmt(grid.totalsRow.amounts[m])}
                  </td>
                ))}
                <td className="budget-grid-td budget-grid-total-td">
                  {fmt(grid.totalsRow.total)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <BudgetRequestModal
        open={decisionOpen}
        year={year}
        region={region}
        onClose={() => setDecisionOpen(false)}
        onSuccess={() => {
          setDecisionOpen(false);
          loadGrid();
        }}
      />
    </div>
  );
}