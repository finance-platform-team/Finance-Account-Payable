import { useCallback, useEffect, useState } from "react";
import {
  buildBudgetGrid,
  fetchActualAmountsByBuMonth,
  fetchBudgetRequests,
  getBUNamesForRegion,
} from "../lib/apBudgetRequestService";
import type { BudgetGrid, BudgetRegion, MonthKey } from "../types/apBudgetRequest";
import { MONTH_KEYS } from "../types/apBudgetRequest";
import BudgetRequestModal from "./Budgetrequestmodal";
import { useToast } from "../lib/ToastContext";
import { useGlobalRegion } from "../lib/GlobalRegionContext";
import { exportRowsToXLS, exportFilenameStamp } from "../lib/xlsExport";

const YEAR_OPTIONS = ["2024", "2025", "2026", "2027"];

function fmt(v: number): string {
  return v
    ? Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })
    : "-";
}

export default function BudgetRequestPanel() {
  const { globalRegion } = useGlobalRegion();
  const [year, setYear] = useState("2026");
  const [region, setRegion] = useState<BudgetRegion>(globalRegion || "Egypt");

  // Follows the Global Region selector — mirrors applyGlobalRegionToCurrentScreen()
  // re-applying it as the default for this screen whenever it changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (globalRegion) setRegion(globalRegion);
  }, [globalRegion]);
  const [grid, setGrid] = useState<BudgetGrid | null>(null);
  const [loading, setLoading] = useState(false);
  const [noDataMessage, setNoDataMessage] = useState<string | null>(null);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [showActual, setShowActual] = useState(false);
  const [actualsLoading, setActualsLoading] = useState(false);
  const [actuals, setActuals] = useState<Record<string, Partial<Record<MonthKey, number>>>>({});
  const { showToast } = useToast();

  // ── "Show Actual" toggle — mirrors toggleAPShowActual(): lazily fetches
  // cfm_actualamount the first time it's switched on for this Year/Region. ──
  async function handleToggleShowActual() {
    const next = !showActual;
    setShowActual(next);
    if (next && Object.keys(actuals).length === 0) {
      setActualsLoading(true);
      try {
        const map = await fetchActualAmountsByBuMonth(year, region);
        setActuals(map);
      } catch (e) {
        console.error("Error loading Actual Amount data:", e);
        showToast("Error", "Could not load Actual Amount data.", "alert");
      } finally {
        setActualsLoading(false);
      }
    }
  }

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
    setShowActual(false);
    setActuals({});
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

  // ── Export — mirrors exportAPBudgetXLS() ──
  function handleExport() {
    if (!grid) {
      showToast("Nothing to Export", "Select a Year and Region with budget data first.", "alert");
      return;
    }
    const headers = ["Entity", ...MONTH_KEYS.map((m) => m), "Total"];
    const exportRows = grid.rows.map((row) => [
      row.bu,
      ...MONTH_KEYS.map((m) => row.amounts[m] || 0),
      row.total,
    ]);
    exportRowsToXLS(`Budget_Request_AP_${region}_${year}_${exportFilenameStamp()}`, headers, exportRows);
    showToast("Exported", `${exportRows.length} row(s) exported to Excel.`, "success");
  }

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
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-outline" onClick={handleToggleShowActual} disabled={actualsLoading}>
            {actualsLoading ? "Loading…" : showActual ? "Hide Actual" : "Show Actual"}
          </button>
          <button className="btn btn-outline" onClick={handleExport}>
            Export
          </button>
          <button
            className="btn btn-primary"
            style={{ padding: "8px 18px" }}
            onClick={handleRequestBudgetClick}
          >
            Request Budget
          </button>
        </div>
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
                  {MONTH_KEYS.map((m) => {
                    const actualVal = actuals[row.bu]?.[m];
                    const isOverBudget = actualVal != null && actualVal > (row.amounts[m] || 0);
                    return (
                      <td key={m} className="budget-grid-td">
                        {row.amounts[m] ? fmt(row.amounts[m]) : "-"}
                        {showActual && (
                          <div
                            style={{
                              marginTop: 4,
                              font: `${isOverBudget ? 700 : 500} 9.5px var(--mono)`,
                              color: isOverBudget ? "var(--danger)" : "var(--info)",
                            }}
                          >
                            {isOverBudget ? "⚠ " : ""}
                            Actual: {actualVal == null ? "—" : fmt(actualVal)}
                          </div>
                        )}
                      </td>
                    );
                  })}
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