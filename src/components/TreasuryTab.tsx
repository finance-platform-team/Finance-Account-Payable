// src/components/TreasuryTab.tsx

import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import {
  fetchTreasuryPaymentPlanLines,
  fetchSinglePaymentPlanLine,
  saveTreasuryReview,
} from "../lib/treasuryService";
import {
  fetchAgingDuesByVendor,
  fetchInsuranceCompanyBUs,
  getDecisionBadgeStyle,
  getStageBadgeStyle,
} from "../lib/apPaymentPlanService";
import type { PPLine } from "../types/apPaymentPlan";
import { useToast } from "../lib/ToastContext";
import { exportRowsToXLS, exportFilenameStamp } from "../lib/xlsExport";
import "../styles/CashFlowStatement.css";
import TreasuryBudgetPanel from "./TreasuryBudgetPanel";

const T_PER_PAGE = 50;

const TREASURY_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "1", label: "Pending" },
  { value: "2", label: "Paid" },
  { value: "3", label: "Scheduled" },
  { value: "4", label: "Clarification Required" },
];

function fmtAmountEnUS(v: number | null | undefined): string {
  return v != null ? v.toLocaleString("en-US") : "-";
}

function Badge({
  style,
}: {
  style: { bg: string; border: string; color: string; label: string };
}) {
  return (
    <span
      className="pp-badge"
      style={{ background: style.bg, borderColor: style.border, color: style.color }}
    >
      {style.label}
    </span>
  );
}

export default function TreasuryTab() {
  const { showToast } = useToast();

  const [lines, setLines] = useState<PPLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [buFilter, setBuFilter] = useState("all");
  const [page, setPage] = useState(1);

  // Cached lookups so the modal's single-record refresh (fetchSinglePaymentPlanLine)
  // can map without refetching these each time — mirrors keeping loadAgingDuesLookup()'s
  // result around between calls in the original.
  const [agingDues, setAgingDues] = useState<Record<string, number>>({});
  const [insuranceBUs, setInsuranceBUs] = useState<Record<string, string>>({});

  // ── Edit modal state ──
  const [editRow, setEditRow] = useState<PPLine | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editComment, setEditComment] = useState("");
  const [saving, setSaving] = useState(false);

  const loadLines = useCallback(async () => {
    setLoading(true);
    try {
      const [dues, bus, data] = await Promise.all([
        fetchAgingDuesByVendor(),
        fetchInsuranceCompanyBUs(),
        fetchTreasuryPaymentPlanLines(),
      ]);
      setAgingDues(dues);
      setInsuranceBUs(bus);
      setLines(data);
    } catch (e) {
      console.error("Error loading Treasury Workflow payment plans:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount.
    loadLines();
  }, [loadLines]);

  const buOptions = useMemo(() => {
    const set = new Set<string>();
    lines.forEach((r) => {
      if (r.bu && r.bu !== "-") set.add(r.bu);
    });
    return Array.from(set).sort();
  }, [lines]);

  // ── Filtering — mirrors renderTreasuryPPLines(): no status filter (server
  // already restricts to Pending Treasury), only search + BU. ──
  const filteredLines = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = lines.filter((r) => {
      if (buFilter !== "all" && (r.bu || "-") !== buFilter) return false;
      if (q) {
        const combined = `${r.vendor} ${r.code} ${r.notes || ""}`.toLowerCase();
        if (!combined.includes(q)) return false;
      }
      return true;
    });
    result.sort((a, b) => {
      const da = a.modifiedOn ? new Date(a.modifiedOn).getTime() : 0;
      const db = b.modifiedOn ? new Date(b.modifiedOn).getTime() : 0;
      return db - da;
    });
    return result;
  }, [lines, search, buFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [search, buFilter]);

  const totalRows = filteredLines.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / T_PER_PAGE));
  const start = (page - 1) * T_PER_PAGE;
  const pageRows = filteredLines.slice(start, start + T_PER_PAGE);

  // ── Pagination — mirrors ApAgingTab's numbered page buttons ──
  function goToPage(p: number) {
    if (p < 1 || p > totalPages) return;
    setPage(p);
  }

  function renderPageButtons() {
    const buttons: JSX.Element[] = [];
    const buildBtn = (p: number) => {
      const isActive = p === page;
      buttons.push(
        <button
          key={p}
          onClick={() => goToPage(p)}
          className={`ap-page-btn${isActive ? " is-active" : ""}`}
        >
          {p}
        </button>,
      );
    };
    const addDots = (key: string) =>
      buttons.push(
        <span key={key} className="ap-page-dots">
          …
        </span>,
      );

    if (totalPages <= 7) {
      for (let p = 1; p <= totalPages; p++) buildBtn(p);
    } else {
      buildBtn(1);
      const s = Math.max(2, page - 1);
      const e = Math.min(totalPages - 1, page + 1);
      if (s > 2) addDots("dots-start");
      for (let p = s; p <= e; p++) buildBtn(p);
      if (e < totalPages - 1) addDots("dots-end");
      buildBtn(totalPages);
    }
    return buttons;
  }

  // ── Edit modal — mirrors openTreasuryPPLModal(): show cached row
  // immediately, then refresh the single record from Dataverse. ──
  async function openEditModal(row: PPLine) {
    setEditRow(row);
    setEditStatus(row.treasuryStatus != null ? String(row.treasuryStatus) : "");
    setEditComment(row.lastComment || "");

    try {
      const fresh = await fetchSinglePaymentPlanLine(row.id, agingDues, insuranceBUs);
      setEditRow((current) => (current && current.id === row.id ? fresh : current));
      setEditStatus((current) =>
        current || (fresh.treasuryStatus != null ? String(fresh.treasuryStatus) : ""),
      );
      setEditComment((current) => current || fresh.lastComment || "");
    } catch (e) {
      console.error("Error loading Payment Plan record from Dataverse:", e);
      showToast("Error", "Could not load the latest Payment Plan record.", "alert");
    }
  }

  function closeEditModal() {
    setEditRow(null);
    setEditStatus("");
    setEditComment("");
  }

  // ── Export — mirrors exportTreasuryWorkflowXLS() ──
  function handleExport() {
    const headers = [
      "Category", "Sub Ledger Code", "Vendor Name", "BU", "Initial Amount",
      "Amount", "Due Date", "AP Notes", "Treasury Status", "Treasury Comment", "STATUS",
    ];
    const exportRows = filteredLines.map((r) => [
      r.category || "-",
      r.code || "-",
      r.vendor || "-",
      r.bu || "-",
      r.plannedAmount != null ? Number(r.plannedAmount) : "",
      r.currentAmount != null ? Number(r.currentAmount) : "",
      r.due || "-",
      r.notes || "-",
      r.treasuryDecision || "-",
      r.lastComment || "-",
      r.currentStage || "-",
    ]);
    if (!exportRowsToXLS(`Treasury_Workflow_${exportFilenameStamp()}`, headers, exportRows)) {
      showToast("Nothing to Export", "No rows match the current filters.", "alert");
      return;
    }
    showToast("Exported", `${exportRows.length} row(s) exported to Excel.`, "success");
  }

  async function handleSave() {
    if (!editRow) return;
    if (!editStatus) {
      showToast("Error", "Please select a Treasury Status.", "alert");
      return;
    }
    setSaving(true);
    try {
      await saveTreasuryReview(editRow.id, parseInt(editStatus, 10), editComment);
      showToast("Saved", "Treasury review saved.", "success");
      closeEditModal();
      await loadLines();
    } catch (e) {
      console.error("Error saving Treasury review to Dataverse:", e);
      showToast("Error", "Failed to save the Treasury review. Please try again.", "alert");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cfs-root">
      <div id="treasury-workflow" className="ap-screen active">
        {/* ── PAGE HEADER ── */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 20,
            gap: 16,
          }}
        >
          <div>
            <div
              style={{
                font: "700 10px var(--sans)",
                textTransform: "uppercase",
                letterSpacing: 1,
                color: "var(--muted)",
                marginBottom: 5,
              }}
            >
              Treasury · Workflow
            </div>
            <div style={{ font: "800 26px var(--sans)", color: "var(--brand-black)", letterSpacing: -0.4 }}>
              Treasury Workflow
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-outline" onClick={loadLines}>
              Refresh Data
            </button>
            <button className="btn btn-outline" onClick={handleExport}>
              Export PP
            </button>
          </div>
        </div>

        <TreasuryBudgetPanel />

        <div style={{ font: "700 15px var(--sans)", color: "var(--brand-black)", marginBottom: 12 }}>
          Payment Plans Pending Treasury
        </div>

        {/* ── TOOLBAR (Search + BU only) ── */}
        <div className="pp-panel" style={{ marginBottom: 16, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, width: "100%", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ font: "700 9px var(--sans)", textTransform: "uppercase", letterSpacing: 0.8, color: "var(--dim)" }}>
                Search
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                style={{
                  padding: "5px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  font: "500 12px var(--sans)",
                  width: 140,
                  background: "#fff",
                }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ font: "700 9px var(--sans)", textTransform: "uppercase", letterSpacing: 0.8, color: "var(--dim)" }}>
                BU
              </span>
              <div className="select-wrap">
                <select value={buFilter} onChange={(e) => setBuFilter(e.target.value)}>
                  <option value="all">All</option>
                  {buOptions.map((bu) => (
                    <option key={bu} value={bu}>
                      {bu}
                    </option>
                  ))}
                </select>
                <span className="sel-arrow">▾</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── GRID ── */}
        <div className="pp-panel">
          <div className="pp-table-scroll">
            <div className="pp-grid-cols pp-header-row" style={{ gridTemplateColumns: "130px 110px 1.2fr 70px 115px 145px 110px 1.3fr 140px 1.1fr 120px" }}>
              <div className="pp-header-cell">Category</div>
              <div className="pp-header-cell">Sub Ledger Code</div>
              <div className="pp-header-cell">Vendor Name</div>
              <div className="pp-header-cell">BU</div>
              <div className="pp-header-cell" style={{ textAlign: "right", paddingRight: 16 }}>
                Initial Amount
              </div>
              <div className="pp-header-cell" style={{ textAlign: "right", paddingRight: 16 }}>
                Amount
              </div>
              <div className="pp-header-cell">Due Date</div>
              <div className="pp-header-cell">AP Notes</div>
              <div className="pp-header-cell" style={{ textAlign: "center" }}>
                Treasury Status
              </div>
              <div className="pp-header-cell">Treasury Comment</div>
              <div className="pp-header-cell" style={{ textAlign: "center" }}>
                STATUS
              </div>
            </div>

            {loading ? (
              <div className="pp-empty">Loading…</div>
            ) : pageRows.length === 0 ? (
              <div className="pp-empty">No lines are currently pending Treasury review.</div>
            ) : (
              pageRows.map((r) => (
                <div
                  key={r.id}
                  className="pp-grid-cols pp-row"
                  style={{ gridTemplateColumns: "130px 110px 1.2fr 70px 115px 145px 110px 1.3fr 140px 1.1fr 120px", cursor: "pointer" }}
                  onDoubleClick={() => openEditModal(r)}
                  title="Double-click to edit Treasury review"
                >
                  <div className="pp-cell" style={{ font: "500 12px var(--sans)", color: "var(--brand-black)" }}>
                    {r.category || "-"}
                  </div>
                  <div className="pp-cell" style={{ font: "500 11px var(--mono)", color: "var(--muted)" }}>
                    {r.code || "-"}
                  </div>
                  <div className="pp-cell" style={{ font: "700 13px var(--sans)", color: "var(--brand-black)" }}>
                    {r.vendor || "-"}
                  </div>
                  <div className="pp-cell" style={{ font: "700 11px var(--mono)", color: "var(--muted)" }}>
                    {r.bu || "-"}
                  </div>
                  <div className="pp-cell pp-cell--right" style={{ font: "700 12px var(--mono)", color: "var(--brand-black)" }}>
                    {r.plannedAmount != null ? fmtAmountEnUS(r.plannedAmount) : "-"}
                  </div>
                  <div className="pp-cell pp-cell--right" style={{ font: "700 12px var(--mono)", color: "var(--gold-dark)" }}>
                    {r.currentAmount != null ? fmtAmountEnUS(r.currentAmount) : "-"}
                  </div>
                  <div className="pp-cell">{r.due || "-"}</div>
                  <div className="pp-cell pp-cell--muted">{r.notes || "-"}</div>
                  <div className="pp-cell--center">
                    <Badge style={getDecisionBadgeStyle(r.treasuryDecision)} />
                  </div>
                  <div className="pp-cell pp-cell--muted">{r.lastComment || "-"}</div>
                  <div className="pp-cell--center">
                    <Badge style={getStageBadgeStyle(r.currentStage)} />
                  </div>
                </div>
              ))
            )}
          </div>

          {totalRows > 0 && (
            <div className="pp-pagination">
              <span style={{ font: "400 12px var(--body)", color: "var(--muted)" }}>
                Page {page} of {totalPages} · {totalRows} lines
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button
                  className="ap-page-btn"
                  disabled={page <= 1}
                  onClick={() => goToPage(page - 1)}
                >
                  ‹
                </button>
                {renderPageButtons()}
                <button
                  className="ap-page-btn"
                  disabled={page >= totalPages}
                  onClick={() => goToPage(page + 1)}
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── TREASURY REVIEW MODAL — mirrors openTreasuryPPLModal()/saveTreasuryPPLModal() ── */}
        {editRow && (
          <div className="modal-overlay active" onClick={closeEditModal}>
            <div className="modal-box" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-hdr">
                <div>
                  <div className="modal-title">Treasury Review</div>
                  <div className="modal-sub">Review AP Payment Plan line and set Treasury status.</div>
                </div>
                <button className="modal-close" onClick={closeEditModal}>
                  ×
                </button>
              </div>

              <div className="modal-body">
                <div className="form-2col">
                  <div className="form-field">
                    <label className="field-lbl">Sub Ledger Code</label>
                    <input className="field-input" type="text" disabled value={editRow.code || ""} style={{ background: "var(--canvas)", color: "var(--muted)", fontWeight: 600 }} />
                  </div>
                  <div className="form-field">
                    <label className="field-lbl">Vendor Name</label>
                    <input className="field-input" type="text" disabled value={editRow.vendor || ""} style={{ background: "var(--canvas)", color: "var(--muted)", fontWeight: 600 }} />
                  </div>
                  <div className="form-field">
                    <label className="field-lbl">Category</label>
                    <input className="field-input" type="text" disabled value={editRow.category || ""} style={{ background: "var(--canvas)", color: "var(--muted)", fontWeight: 600 }} />
                  </div>
                  <div className="form-field">
                    <label className="field-lbl">Due Date</label>
                    <input className="field-input" type="text" disabled value={editRow.due || ""} style={{ background: "var(--canvas)", color: "var(--muted)", fontWeight: 600 }} />
                  </div>
                  <div className="form-field">
                    <label className="field-lbl">Initial Amount</label>
                    <input
                      className="field-input"
                      type="text"
                      disabled
                      value={editRow.plannedAmount != null ? fmtAmountEnUS(editRow.plannedAmount) : "-"}
                      style={{ background: "var(--canvas)", color: "var(--muted)", fontWeight: 700, fontFamily: "var(--mono)" }}
                    />
                  </div>
                  <div className="form-field">
                    <label className="field-lbl">Amount</label>
                    <input
                      className="field-input"
                      type="text"
                      disabled
                      value={editRow.currentAmount != null ? fmtAmountEnUS(editRow.currentAmount) : "-"}
                      style={{ background: "var(--canvas)", color: "var(--muted)", fontWeight: 700, fontFamily: "var(--mono)" }}
                    />
                  </div>
                </div>

                <div className="form-2col">
                  <div className="form-field">
                    <label className="field-lbl">AP Notes</label>
                    <textarea
                      className="field-input"
                      disabled
                      rows={2}
                      value={editRow.notes || ""}
                      style={{ background: "var(--canvas)", color: "var(--muted)", fontWeight: 600 }}
                    />
                  </div>
                  <div className="form-field">
                    <label className="field-lbl">AP Review</label>
                    <input className="field-input" type="text" disabled value={editRow.statusLabel || ""} style={{ background: "var(--canvas)", color: "var(--muted)", fontWeight: 600 }} />
                  </div>
                </div>

                <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "4px 0 16px" }} />

                <div className="form-field">
                  <label className="field-lbl">Treasury Status *</label>
                  <div className="select-wrap">
                    <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                      <option value="" disabled>
                        Select Treasury Status
                      </option>
                      {TREASURY_STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <span className="sel-arrow">▾</span>
                  </div>
                </div>

                <div className="form-field">
                  <label className="field-lbl">Treasury Comment</label>
                  <textarea
                    className="field-input"
                    rows={2}
                    placeholder="Add Treasury notes..."
                    value={editComment}
                    onChange={(e) => setEditComment(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn btn-outline" onClick={closeEditModal} disabled={saving}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}