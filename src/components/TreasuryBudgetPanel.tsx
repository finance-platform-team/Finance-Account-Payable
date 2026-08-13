// src/components/TreasuryBudgetPanel.tsx

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildTreasuryBudgetGrid,
  ensureBudgetRequestRecordsExist,
  fetchBudgetRequests,
  getBUNamesForRegion,
  saveTreasuryBudgetCells,
  treasuryBudgetGridHasAnyData,
} from "../lib/treasuryBudgetService";
import { fetchActualAmountsByBuMonth } from "../lib/apBudgetRequestService";
import { useGlobalRegion } from "../lib/GlobalRegionContext";
import type { TreasuryBudgetGrid } from "../lib/treasuryBudgetService";
import type { BudgetRegion, MonthKey } from "../types/apBudgetRequest";
import { MONTH_KEYS } from "../types/apBudgetRequest";
import { useToast } from "../lib/ToastContext";

const YEAR_OPTIONS = ["2024", "2025", "2026", "2027"];

function fmt(v: number): string {
  return v ? Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "-";
}

/** cell key helper — "BU|Month" */
function cellKey(bu: string, m: MonthKey): string {
  return `${bu}|${m}`;
}

export default function TreasuryBudgetPanel() {
  const { showToast } = useToast();
  const { globalRegion } = useGlobalRegion();

  const [year, setYear] = useState("2026");
  const [region, setRegion] = useState<BudgetRegion>(globalRegion || "Egypt");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (globalRegion) setRegion(globalRegion);
  }, [globalRegion]);
  const [grid, setGrid] = useState<TreasuryBudgetGrid | null>(null);
  const [hasData, setHasData] = useState(true);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [initializing, setInitializing] = useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [showActual, setShowActual] = useState(false);
  const [actualsLoading, setActualsLoading] = useState(false);
  const [actuals, setActuals] = useState<Record<string, Partial<Record<MonthKey, number>>>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const loadGrid = useCallback(async () => {
    if (!year || !region) return;
    setLoading(true);
    setEditMode(false);
    setShowActual(false);
    setActuals({});
    try {
      const rows = await fetchBudgetRequests(year, region);
      const buList = getBUNamesForRegion(region);
      const newGrid = buildTreasuryBudgetGrid(rows, buList);
      setGrid(newGrid);
      setHasData(rows.length === 0 ? false : treasuryBudgetGridHasAnyData(newGrid));
    } catch (e) {
      console.error("loadTreasuryBudget error:", e);
      setGrid(null);
      setHasData(false);
    } finally {
      setLoading(false);
    }
  }, [year, region]);
  // ── Initialize Budget — mirrors ensureBudgetRequestRecordsExist(), called
  // manually here (rather than only as a side-effect of Request Budget on
  // the AP side) so Treasury can also bootstrap a missing Year/Region. ──
  async function handleInitializeBudget() {
    setInitializing(true);
    try {
      const { created, existing, errors } = await ensureBudgetRequestRecordsExist(year, region);
      if (errors.length > 0) {
        showToast(
          "Partial Success",
          `${created} created, ${existing} already existed. Failed: ${errors.join(", ")}`,
          "alert",
        );
      } else {
        showToast(
          "Budget Initialized",
          `${created} record(s) created for ${region} ${year}.`,
          "success",
        );
      }
      await loadGrid();
    } catch (e) {
      console.error("Error initializing budget records:", e);
      showToast("Error", "Failed to initialize the budget for this Year/Region.", "alert");
    } finally {
      setInitializing(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount/filter-change.
    loadGrid();
  }, [loadGrid]);

  function enterEditMode() {
    if (!grid) return;
    const initial: Record<string, string> = {};
    grid.rows.forEach((r) => {
      MONTH_KEYS.forEach((m) => {
        const val = r.amounts[m];
        initial[cellKey(r.bu, m)] = val ? val.toLocaleString("en-US") : "";
      });
    });
    setDrafts(initial);
    setEditMode(true);
  }

  function cancelEditMode() {
    setEditMode(false);
    setDrafts({});
  }

  function handleCellChange(bu: string, m: MonthKey, raw: string) {
    // Mirrors formatNumberOnInput(): keep only digits/comma/dot while typing.
    const cleaned = raw.replace(/[^\d.,]/g, "");
    setDrafts((prev) => ({ ...prev, [cellKey(bu, m)]: cleaned }));
  }

  function handleCellBlur(bu: string, m: MonthKey, raw: string) {
    if (raw === ".") {
      setDrafts((prev) => ({ ...prev, [cellKey(bu, m)]: "" }));
    }
  }

  function buildDirtyCells(): { bu: string; monthKey: MonthKey; value: number | null; guid: string | null }[] {
    if (!grid) return [];
    const cells: { bu: string; monthKey: MonthKey; value: number | null; guid: string | null }[] = [];
    grid.rows.forEach((r) => {
      MONTH_KEYS.forEach((m) => {
        const raw = (drafts[cellKey(r.bu, m)] || "").replace(/,/g, "").trim();
        if (raw === "") return; // blank — skip entirely, matches the original
        const num = parseFloat(raw);
        cells.push({ bu: r.bu, monthKey: m, value: isNaN(num) ? 0 : num, guid: r.monthGuids[m] });
      });
    });
    return cells;
  }

  // ── Save — mirrors saveTreasuryBudget() opening a confirm step before the
  // actual write (CFM_APNew.html: modal-treasury-confirm / confirmSaveTreasuryBudget()). ──
  function handleSave() {
    if (buildDirtyCells().length === 0) {
      showToast("Warning", "No active budget inputs to save.", "alert");
      return;
    }
    setConfirmSaveOpen(true);
  }

  async function handleConfirmSave() {
    const cells = buildDirtyCells();
    if (cells.length === 0) {
      setConfirmSaveOpen(false);
      return;
    }

    setSaving(true);
    try {
      await saveTreasuryBudgetCells(year, region, cells);
      showToast("Saved", `Monthly budget for ${region} ${year} saved to Dataverse.`, "success");
      setConfirmSaveOpen(false);
      setEditMode(false);
      await loadGrid();
    } catch (e) {
      console.error("saveTreasuryBudget error:", e);
      showToast("Error", "Failed to save budget to Dataverse.", "alert");
    } finally {
      setSaving(false);
    }
  }

  // ── CSV Export — mirrors exportTreasuryBudgetCSV() ──
  function handleExport() {
    if (!grid || grid.rows.length === 0) {
      showToast("Nothing to Export", "Select a Year and Region with budget data first.", "alert");
      return;
    }
    const lines = [["Entity", ...MONTH_KEYS].join(",")];
    grid.rows.forEach((r) => {
      const row = [r.bu, ...MONTH_KEYS.map((m) => r.amounts[m] || 0)];
      lines.push(row.join(","));
    });
    const csvContent = lines.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `treasury-budget_${region}_${year}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Exported", "Budget CSV downloaded.", "success");
  }

  // ── CSV Import — mirrors handleTreasuryBudgetImportFile() ──
  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !grid) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = String(ev.target?.result || "");
        const rows = text
          .split(/\r\n|\n|\r/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        if (rows.length < 2) {
          showToast("Import Failed", "The CSV file is empty.", "alert");
          return;
        }

        const header = rows[0].split(",").map((h) => h.trim());
        const headerOk =
          header.length >= 13 &&
          header[0].toLowerCase() === "entity" &&
          MONTH_KEYS.every((m, i) => header[i + 1] === m);

        if (!headerOk) {
          showToast(
            "Import Failed",
            "The CSV header must match the exported format: Entity,Jan,Feb,...,Dec.",
            "alert",
          );
          return;
        }

        const buSet = new Set(grid.rows.map((r) => r.bu));
        let updatedCount = 0;
        const unmatchedEntities: string[] = [];
        const nextDrafts = { ...drafts };

        for (let i = 1; i < rows.length; i++) {
          const cols = rows[i].split(",");
          const entityName = (cols[0] || "").trim();
          if (!entityName) continue;

          if (!buSet.has(entityName)) {
            unmatchedEntities.push(entityName);
            continue;
          }

          MONTH_KEYS.forEach((m, mIdx) => {
            const raw = (cols[mIdx + 1] || "").trim().replace(/,/g, "");
            const num = raw === "" ? 0 : parseFloat(raw);
            nextDrafts[cellKey(entityName, m)] = num ? num.toLocaleString("en-US") : "";
          });
          updatedCount++;
        }

        e.target.value = ""; // allow re-importing the same file name later

        if (updatedCount === 0) {
          showToast(
            "Import Failed",
            "None of the entities in the file match the currently loaded Year/Region table.",
            "alert",
          );
          return;
        }

        setDrafts(nextDrafts);
        let msg = `${updatedCount} entit${updatedCount === 1 ? "y" : "ies"} filled in from the file.`;
        if (unmatchedEntities.length > 0) {
          msg += ` Skipped (not in this table): ${unmatchedEntities.join(", ")}.`;
        }
        showToast("Imported", `${msg} Review, then Save Monthly Budget.`, "success");
      } catch (err) {
        console.error("Treasury budget CSV import failed:", err);
        showToast("Import Failed", "Could not read the CSV file. Please check the format and try again.", "alert");
      }
    };
    reader.readAsText(file);
  }

  const grandTotal = useMemo(() => grid?.totalsRow.total ?? 0, [grid]);

  return (
    <div className="pp-panel" style={{ marginBottom: 20, overflow: "hidden" }}>
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
            Review and approve budget requests submitted by AP.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-outline" onClick={handleToggleShowActual} disabled={actualsLoading}>
            {actualsLoading ? "Loading…" : showActual ? "Hide Actual" : "Show Actual"}
          </button>
          <button className="btn btn-outline" onClick={handleExport}>
            Export
          </button>
          {editMode && (
            <button className="btn btn-outline" onClick={handleImportClick}>
              Import
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={handleImportFile}
          />
          <button
            className="btn btn-primary"
            onClick={editMode ? cancelEditMode : enterEditMode}
            disabled={!grid || grid.rows.length === 0 || !hasData}
          >
            {editMode ? "Cancel Edit" : "Edit"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, padding: "18px 22px 0 22px" }}>
        <div className="form-field" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
          <label className="field-lbl">Year</label>
          <div className="select-wrap" style={{ display: "block" }}>
            <select className="field-input" value={year} onChange={(e) => setYear(e.target.value)} style={{ paddingRight: 32 }}>
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
          <label className="field-lbl">Region</label>
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

    <div style={{ padding: 18, overflowX: "auto" }}>
        {loading ? (
          <div className="pp-empty">Loading…</div>
        ) : !grid || !hasData ? (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div className="pp-empty" style={{ padding: 0, marginBottom: 16 }}>
              No Budget Available for {region} {year}.
            </div>
            <button className="btn btn-primary" onClick={handleInitializeBudget} disabled={initializing}>
              {initializing ? "Initializing…" : "Initialize Budget"}
            </button>
          </div>
        ) : (
          <>
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
                          {editMode ? (
                            <input
                              type="text"
                              value={drafts[cellKey(row.bu, m)] ?? ""}
                              onChange={(e) => handleCellChange(row.bu, m, e.target.value)}
                              onBlur={(e) => handleCellBlur(row.bu, m, e.target.value)}
                              style={{
                                width: 90,
                                textAlign: "right",
                                border: "1px solid var(--border)",
                                borderRadius: 6,
                                padding: "6px 8px",
                                font: "600 12px var(--mono)",
                                color: "var(--brand-black)",
                                background: "#fff",
                              }}
                            />
                          ) : row.amounts[m] ? (
                            fmt(row.amounts[m])
                          ) : (
                            "-"
                          )}
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
                    <td className="budget-grid-td budget-grid-total-td">{fmt(row.total)}</td>
                  </tr>
                ))}
                <tr className="budget-grid-totals-row">
                  <td className="budget-grid-td">TOTAL</td>
                  {MONTH_KEYS.map((m) => (
                    <td key={m} className="budget-grid-td">
                      {fmt(grid.totalsRow.amounts[m])}
                    </td>
                  ))}
                  <td className="budget-grid-td budget-grid-total-td">{fmt(grandTotal)}</td>
                </tr>
              </tbody>
            </table>

            {editMode && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save Monthly Budget"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {confirmSaveOpen && (
        <div className="modal-overlay active" onClick={() => !saving && setConfirmSaveOpen(false)}>
          <div className="modal-box" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr">
              <div className="modal-title">Save Monthly Budget?</div>
              <button className="modal-close" onClick={() => setConfirmSaveOpen(false)} disabled={saving}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div style={{ font: "500 12.5px var(--body)", color: "var(--text-body)", lineHeight: 1.6 }}>
                This will save the entered budget amounts for {region} {year} to Dataverse.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setConfirmSaveOpen(false)} disabled={saving}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleConfirmSave} disabled={saving}>
                {saving ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}