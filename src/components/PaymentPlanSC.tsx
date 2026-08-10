// src/components/PaymentPlanSC.tsx

import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import {
  fetchPaymentPlanLines,
  getDecisionBadgeStyle,
  getStageBadgeStyle,
  updatePaymentPlanStatus,
} from "../lib/apPaymentPlanService";
import type { PPLine } from "../types/apPaymentPlan";
import { PP_PER_PAGE } from "../types/apPaymentPlan";
import {
  fetchScPriorityForEdit,
  buildScPriorityPayload,
  saveScPriority,
  formatScDisplayDateTime,
} from "../lib/scPriorityService";
import { useToast } from "../lib/ToastContext";
import "../styles/CashFlowStatement.css";

/** Comma-grouped display — mirrors r.currentAmount.toLocaleString(). */
function fmtAmountEnUS(v: number | null | undefined): string {
  return v != null ? v.toLocaleString("en-US") : "";
}

function Badge({
  style,
}: {
  style: { bg: string; border: string; color: string; label: string };
}) {
  return (
    <span
      className="pp-badge"
      style={{
        background: style.bg,
        borderColor: style.border,
        color: style.color,
      }}
    >
      {style.label}
    </span>
  );
}

// ── SC Priority modal form state ──
interface ScFormState {
  priorityStatus: string; // "123200000" | "123200001" | "123200002" | "931940001"
  priorityRank: string;
  recommendedAmount: string;
  recommendedDate: string; // "YYYY-MM-DD"
  vendorCriticality: string; // "1" | "2" | "3" — FIXED to real choice values (see chat)
  altVendor: "Yes" | "No" | "";
  partialAccepted: "Yes" | "No" | "";
  scOwner: string;
  // Display-only, NOT saved — mirrors the original's disabled/commented fields.
  recommendedAction: string;
  supplyRisk: string;
  /** Read-only display string — the record's actual creation timestamp, or "Not yet created" for a brand-new priority. Replaces the old manually-editable Response Date & Time input. */
  createdOnDisplay: string;
}

const EMPTY_SC_FORM: ScFormState = {
  priorityStatus: "",
  priorityRank: "",
  recommendedAmount: "",
  recommendedDate: "",
  vendorCriticality: "",
  altVendor: "",
  partialAccepted: "",
  scOwner: "",
  recommendedAction: "",
  supplyRisk: "",
  createdOnDisplay: "Not yet created",
};



export default function PaymentPlanSCTab() {
  const { showToast } = useToast();

  const [lines, setLines] = useState<PPLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [buFilter, setBuFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  // ── SC Priority modal state ──
  const [scModalRow, setScModalRow] = useState<PPLine | null>(null);
  const [scForm, setScForm] = useState<ScFormState>(EMPTY_SC_FORM);
  const [scLoading, setScLoading] = useState(false);
  const [scSaving, setScSaving] = useState(false);

  const loadLines = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPaymentPlanLines();
      setLines(data);
    } catch (e) {
      console.error("Error loading payment plan (SC view):", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount; loadLines is async and only sets state after the await.
    loadLines();
  }, [loadLines]);

  // SC view: only lines pending Supply Chain review — mirrors renderPaymentPlanLinesSC()'s hardcoded r.status !== 3 filter (no status dropdown exists in this screen's toolbar).
  const scLines = useMemo(() => lines.filter((r) => r.status === 3), [lines]);

  const buOptions = useMemo(() => {
    const set = new Set<string>();
    scLines.forEach((r) => {
      if (r.bu && r.bu !== "-") set.add(r.bu);
    });
    return Array.from(set).sort();
  }, [scLines]);

  // ── Filtering — mirrors renderPaymentPlanLinesSC() ──
  const filteredLines = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = scLines.filter((r) => {
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
  }, [scLines, search, buFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [search, buFilter]);

  const totalRows = filteredLines.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PP_PER_PAGE));
  const start = (page - 1) * PP_PER_PAGE;
  const pageRows = filteredLines.slice(start, start + PP_PER_PAGE);

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

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Select All — mirrors toggleSelectAllSC(): selects ALL matching rows
  // across every page (search only — original doesn't apply the BU filter
  // here even though the row-level render does). Kept literal to source. ──
  function toggleSelectAll(checked: boolean) {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    const q = search.trim().toLowerCase();
    const ids = scLines
      .filter((r) => {
        if (q) {
          const combined = `${r.vendor} ${r.code} ${r.notes || ""}`.toLowerCase();
          if (!combined.includes(q)) return false;
        }
        return true;
      })
      .map((r) => r.id);
    setSelected(new Set(ids));
  }

  const allFilteredSelected =
    filteredLines.length > 0 && filteredLines.every((r) => selected.has(r.id));

  const selectedRows = lines.filter((r) => selected.has(r.id));
  const selectedCount = selectedRows.length;

  // ── Toolbar validation — mirrors updatePPToolbarSC() ──
  let primaryActionText = "Process Selected";
  let isValidAction = true;
  let validationMsg = "";

  if (selectedCount > 0) {
    const firstStage = selectedRows[0].currentStage;
    const allSameStage = selectedRows.every((r) => r.currentStage === firstStage);

    if (!allSameStage) {
      isValidAction = false;
      primaryActionText = "Process Selected";
      validationMsg =
        "Selected lines have different workflow stages. Please select lines with the same stage.";
    } else if (firstStage === "Pending SC") {
      primaryActionText = "Return Selected to AP";
    } else {
      isValidAction = false;
      if (firstStage === "AP Draft" || firstStage === "Pending AP Approval") {
        primaryActionText = "Return Selected to AP";
        validationMsg = "Selected lines are not pending Supply Chain review.";
      } else if (firstStage === "Returned to AP") {
        primaryActionText = "Return Selected to AP";
        validationMsg = "Selected lines are already returned to AP.";
      } else if (firstStage === "Pending Treasury") {
        primaryActionText = "Return Selected to AP";
        validationMsg = "Selected lines are already submitted to Treasury.";
      } else if (firstStage === "Closed") {
        primaryActionText = "Return Selected to AP";
        validationMsg = "Selected lines are closed.";
      } else {
        primaryActionText = "Process Selected";
        validationMsg = "Selected stage is not eligible for further actions.";
      }
    }
  }

  async function handleReturnToAP() {
    if (!isValidAction) return;
    const ids = Array.from(selected);
    setLoading(true);
    try {
      await Promise.all(ids.map((id) => updatePaymentPlanStatus(id, 4)));
      showToast("Returned to AP", `${ids.length} line(s) returned to AP.`, "success");
      setSelected(new Set());
      await loadLines();
    } catch (e) {
      console.error("Error returning to AP:", e);
      showToast("Error", "Failed to return to AP.", "alert");
    } finally {
      setLoading(false);
    }
  }

  // ── SC Priority modal — mirrors loadAndOpenSCPriority() + openPPLineDetail() ──
async function openScPriorityModal(row: PPLine) {
    setScModalRow(row);
    // Default the Recommended Amount to the line's Initial Amount — mirrors
    // the request that SC always start from the planned figure and adjust
    // it from there, rather than a blank field.
    const defaultAmount = row.plannedAmount != null ? String(row.plannedAmount) : "";

    if (!row.scPriorityId) {
      setScForm({
        ...EMPTY_SC_FORM,
        recommendedAmount: defaultAmount,
        scOwner: "",
        createdOnDisplay: "Not yet created",
      });
      return;
    }

    setScLoading(true);
    try {
      const data = await fetchScPriorityForEdit(row.scPriorityId);
      setScForm({
        priorityStatus: data.priorityStatus != null ? String(data.priorityStatus) : "",
        priorityRank: data.priorityRank != null ? String(data.priorityRank) : "",
        recommendedAmount:
          data.recommendedAmount != null ? String(data.recommendedAmount) : defaultAmount,
        recommendedDate: data.recommendedDate || "",
        vendorCriticality: data.vendorCriticality != null ? String(data.vendorCriticality) : "",
        altVendor: data.altVendor == null ? "" : data.altVendor ? "Yes" : "No",
        partialAccepted:
          data.partialAccepted == null ? "" : data.partialAccepted ? "Yes" : "No",
        scOwner: data.scOwner || "",
        recommendedAction:
          data.recommendedAction != null ? String(data.recommendedAction) : "",
        supplyRisk: data.supplyRisk != null ? String(data.supplyRisk) : "",
        createdOnDisplay: formatScDisplayDateTime(data.createdOn),
      });
    } catch (e) {
      console.error("Error loading SC Priority record:", e);
      showToast("Error", "Failed to load SC Priority.", "alert");
    } finally {
      setScLoading(false);
    }
  }

  function closeScModal() {
    setScModalRow(null);
    setScForm(EMPTY_SC_FORM);
  }

  async function handleSaveScPriority() {
    if (!scModalRow) return;
    setScSaving(true);
    try {
      const payload = buildScPriorityPayload({
        priorityStatus: scForm.priorityStatus,
        priorityRank: scForm.priorityRank,
        recommendedAmount: scForm.recommendedAmount,
        recommendedDate: scForm.recommendedDate,
        vendorCriticality: scForm.vendorCriticality,
        altVendor: scForm.altVendor,
        partialAccepted: scForm.partialAccepted,
        recommendedAction: scForm.recommendedAction,
        supplyRisk: scForm.supplyRisk,
        // responseDateTime intentionally omitted — no longer a manual input;
        // Response Date & Time now just displays the record's own createdon.
      });
            console.log(
        "SC PRIORITY SAVE PAYLOAD DEBUG:",
        JSON.stringify(
          {
            formRecommendedAction: scForm.recommendedAction,
            formSupplyRisk: scForm.supplyRisk,
            payloadRecommendedAction: payload.cfm_recommendedaction,
            payloadSupplyRisk: payload.cfm_supplyriskifnotpaid,
            existingId: scModalRow.scPriorityId,
          },
          null,
          2,
        ),
      );

      await saveScPriority(scModalRow.id, scModalRow.scPriorityId, payload);
      showToast("Saved", "SC Priority saved successfully.", "success");
      closeScModal();
      await loadLines();
    } catch (e) {
      console.error("Error saving SC Priority:", e);
      showToast("Error", "Failed to save SC Priority.", "alert");
    } finally {
      setScSaving(false);
    }
  }

  return (
    <div className="cfs-root">
      <div id="ap-payment-plan-sc" className="ap-screen active">
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
              AP Planning · Payment Plan
            </div>
            <div
              style={{
                font: "800 26px var(--sans)",
                color: "var(--brand-black)",
                letterSpacing: -0.4,
              }}
            >
              Payment Plan
            </div>
            <div style={{ font: "400 12px var(--body)", color: "var(--muted)", marginTop: 3 }}>
              Scheduled vendor payments · Supply Chain view · Cash-flow alignment
            </div>
          </div>
          <button className="btn btn-outline" onClick={loadLines}>
            Refresh Data
          </button>
        </div>

        {/* ── TOOLBAR ── */}
        <div className="pp-panel" style={{ marginBottom: 16, padding: "14px 16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              flexWrap: "wrap",
            }}
          >
            {selectedCount === 0 ? (
              <>
                <div>
                  <span style={{ font: "800 14px var(--sans)", color: "var(--brand-black)", display: "block" }}>
                    Payment Plan
                  </span>
                  <span style={{ font: "400 11px var(--body)", color: "var(--muted)" }}>
                    Select lines to submit to Treasury.
                  </span>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        font: "700 9px var(--sans)",
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                        color: "var(--dim)",
                        whiteSpace: "nowrap",
                      }}
                    >
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
                    <span
                      style={{
                        font: "700 9px var(--sans)",
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                        color: "var(--dim)",
                        whiteSpace: "nowrap",
                      }}
                    >
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
              </>
            ) : (
              <>
                <div>
                  <span style={{ font: "800 14px var(--sans)", color: "var(--brand-black)", display: "block" }}>
                    Payment Plan
                  </span>
                  <span style={{ font: "400 11px var(--body)", color: "var(--muted)" }}>
                    {selectedCount} lines selected.
                  </span>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        font: "700 9px var(--sans)",
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                        color: "var(--dim)",
                        whiteSpace: "nowrap",
                      }}
                    >
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
                  {!isValidAction && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        font: "700 11px var(--sans)",
                        color: "var(--danger)",
                        background: "rgba(178,58,58,0.06)",
                        border: "1px solid rgba(178,58,58,0.18)",
                        padding: "5px 10px",
                        borderRadius: "var(--r-md)",
                      }}
                    >
                      {validationMsg}
                    </span>
                  )}
                  <button className="btn btn-outline" onClick={() => setSelected(new Set())}>
                    Cancel
                  </button>
                  {isValidAction ? (
                    <button className="btn btn-primary" onClick={handleReturnToAP}>
                      {primaryActionText}
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      disabled
                      style={{
                        opacity: 0.5,
                        cursor: "not-allowed",
                        background: "var(--muted)",
                        borderColor: "var(--muted)",
                        color: "var(--brand-black)",
                      }}
                    >
                      {primaryActionText}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── GRID ── */}
        <div className="pp-panel">
          <div className="pp-table-scroll">
            <div className="pp-grid-cols pp-header-row">
              <div className="pp-header-cell--center">
                <input
                  type="checkbox"
                  className="pp-checkbox"
                  checked={allFilteredSelected}
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                />
              </div>
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
              <div className="pp-empty">No lines are currently pending Supply Chain review.</div>
            ) : (
              pageRows.map((r) => {
                const hasAmounts = r.plannedAmount != null && r.currentAmount != null;
                const variance = hasAmounts ? (r.currentAmount as number) - (r.plannedAmount as number) : null;
                return (
                  <div
                    key={r.id}
                    className={`pp-grid-cols pp-row${selected.has(r.id) ? " is-selected" : ""}`}
                    onDoubleClick={() => openScPriorityModal(r)}
                  >
                    <div
                      className="pp-cell--center"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRow(r.id);
                      }}
                    >
                      <input
                        type="checkbox"
                        className="pp-checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleRow(r.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="pp-cell" style={{ font: "500 12px var(--sans)", color: "var(--brand-black)" }}>
                      {r.category}
                    </div>
                    <div className="pp-cell" style={{ font: "500 11px var(--mono)", color: "var(--muted)" }}>
                      {r.code}
                    </div>
                    <div className="pp-cell" style={{ font: "700 13px var(--sans)", color: "var(--brand-black)" }}>
                      {r.vendor}
                    </div>
                    <div className="pp-cell" style={{ font: "700 11px var(--mono)", color: "var(--muted)" }}>
                      {r.bu}
                    </div>
                    <div className="pp-cell pp-cell--right">
                      {r.plannedAmount != null ? fmtAmountEnUS(r.plannedAmount) : "-"}
                    </div>
                    <div
                      className="pp-cell pp-cell--right"
                      style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}
                    >
                      <span style={{ font: "700 12.5px var(--mono)", color: "var(--brand-black)" }}>
                        {r.currentAmount != null ? fmtAmountEnUS(r.currentAmount) : "-"}
                      </span>
                      {variance != null && variance !== 0 && (
                        <span
                          style={{
                            font: "800 8.5px var(--sans)",
                            color: "var(--gold-dark)",
                            textTransform: "uppercase",
                            letterSpacing: 0.3,
                            background: "rgba(165,132,91,.1)",
                            padding: "1px 5px",
                            borderRadius: 3,
                          }}
                        >
                          Changed
                        </span>
                      )}
                    </div>
                    <div className="pp-cell">{r.due || "-"}</div>
                    <div className="pp-cell pp-cell--muted">{r.notes || "-"}</div>
                    <div className="pp-cell--center">
                      <Badge style={getStageBadgeStyle(r.currentStage)} />
                    </div>
                    <div className="pp-cell pp-cell--muted">{r.lastComment || "-"}</div>
                    <div className="pp-cell--center">
                      <Badge style={getDecisionBadgeStyle(r.treasuryDecision)} />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {totalRows > 0 && (
            <div className="pp-pagination">
              <span style={{ font: "400 12px var(--body)", color: "var(--muted)" }}>
                Page {page} of {totalPages} · {totalRows} records
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

        {/* ── SC Priority modal — mirrors openPPLineDetail() edit branch ── */}
        {scModalRow && (
          <div className="modal-overlay active" onClick={closeScModal}>
<div className="modal-box" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>              <div className="modal-hdr">
                <div>
                  <div className="modal-title">Edit Supply Chain Priority</div>
                  <div className="modal-sub">{scModalRow.vendor}</div>
                </div>
                <button className="modal-close" onClick={closeScModal}>
                  ×
                </button>
              </div>

              <div className="modal-body">
                {scLoading ? (
                  <div className="pp-empty">Loading…</div>
                ) : (
                  <div className="sc-detail-grid">
                    {/* ── LEFT COLUMN ── */}
                    <div className="sc-detail-col">
                      <div className="sc-detail-row">
                        <span className="sc-detail-label">Priority Status</span>
                        <div className="sc-detail-value">
                          <select
                            value={scForm.priorityStatus}
                            onChange={(e) =>
                              setScForm((f) => ({ ...f, priorityStatus: e.target.value }))
                            }
                          >
                            <option value="">— Not set —</option>
                            <option value="123200000">Low</option>
                            <option value="123200001">Medium</option>
                            <option value="123200002">High</option>
                            <option value="931940001">Critical</option>
                          </select>
                        </div>
                      </div>
                      <div className="sc-detail-row">
                        <span className="sc-detail-label">Priority Rank</span>
                        <div className="sc-detail-value">
                          <input
                            type="number"
                            value={scForm.priorityRank}
                            onChange={(e) =>
                              setScForm((f) => ({ ...f, priorityRank: e.target.value }))
                            }
                            style={{ textAlign: "right", font: "700 12px var(--mono)" }}
                          />
                        </div>
                      </div>
                      <div className="sc-detail-row">
                        <span className="sc-detail-label">Recommended Action</span>
                        <div className="sc-detail-value">
                          <select
                            value={scForm.recommendedAction}
                            onChange={(e) =>
                              setScForm((f) => ({ ...f, recommendedAction: e.target.value }))
                            }
                          >
                            <option value="">— Not set —</option>
                            <option value="4">Pay First</option>
                            <option value="1">Pay Partial</option>
                            <option value="2">Hold</option>
                            <option value="3">Defer</option>
                          </select>
                        </div>
                      </div>
                      <div className="sc-detail-row">
                        <span className="sc-detail-label">Recommended Amount</span>
                        <div className="sc-detail-value">
                          <input
                            type="text"
                            value={scForm.recommendedAmount}
                            onChange={(e) =>
                              setScForm((f) => ({ ...f, recommendedAmount: e.target.value }))
                            }
                            style={{ textAlign: "right", font: "600 12px var(--mono)" }}
                          />
                        </div>
                      </div>
                      <div className="sc-detail-row">
                        <span className="sc-detail-label">Recommended Date</span>
                        <div className="sc-detail-value">
                          <input
                            type="date"
                            value={scForm.recommendedDate}
                            onChange={(e) =>
                              setScForm((f) => ({ ...f, recommendedDate: e.target.value }))
                            }
                          />
                        </div>
                      </div>
                      <div className="sc-detail-row">
                        <span className="sc-detail-label">Supply Risk if Not Paid</span>
                        <div className="sc-detail-value">
                          <select
                            value={scForm.supplyRisk}
                            onChange={(e) =>
                              setScForm((f) => ({ ...f, supplyRisk: e.target.value }))
                            }
                          >
                            <option value="">— Not set —</option>
                            <option value="1">High Risk</option>
                            <option value="2">No Risk</option>
                            <option value="3">Medium Risk</option>
                            <option value="4">Critical Operational Risk</option>
                          </select>
                        </div>
                      </div>
                      <div className="sc-detail-row sc-detail-row--last">
                        <span className="sc-detail-label">Vendor Criticality</span>
                        <div className="sc-detail-value">
                          <select
                            value={scForm.vendorCriticality}
                            onChange={(e) =>
                              setScForm((f) => ({ ...f, vendorCriticality: e.target.value }))
                            }
                          >
                            <option value="">— Not set —</option>
                            <option value="1">Critical Vendor</option>
                            <option value="2">Strategic Vendor</option>
                            <option value="3">Normal Vendor</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* ── RIGHT COLUMN ── */}
                    <div className="sc-detail-col">
                      <div className="sc-detail-row">
                        <span className="sc-detail-label">Alternative Vendor</span>
                        <div className="sc-detail-value">
                          <select
                            value={scForm.altVendor}
                            onChange={(e) =>
                              setScForm((f) => ({
                                ...f,
                                altVendor: e.target.value as "Yes" | "No" | "",
                              }))
                            }
                          >
                            <option value="">— Not set —</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>
                        </div>
                      </div>
                      <div className="sc-detail-row">
                        <span className="sc-detail-label">Partial Payment Accepted</span>
                        <div className="sc-detail-value">
                          <select
                            value={scForm.partialAccepted}
                            onChange={(e) =>
                              setScForm((f) => ({
                                ...f,
                                partialAccepted: e.target.value as "Yes" | "No" | "",
                              }))
                            }
                          >
                            <option value="">— Not set —</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>
                        </div>
                      </div>
                      <div className="sc-detail-row">
                        <span className="sc-detail-label">Supply Chain Owner</span>
                        <div className="sc-detail-value">
                          <input type="text" value={scForm.scOwner} disabled />
                        </div>
                      </div>
                 <div className="sc-detail-row sc-detail-row--last">
                        <span className="sc-detail-label">Response Date & Time</span>
                        <div className="sc-detail-value">
                          <input
                            type="text"
                            value={scForm.createdOnDisplay}
                            disabled
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button className="btn btn-outline" onClick={closeScModal} disabled={scSaving}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleSaveScPriority}
                  disabled={scSaving || scLoading}
                >
                  {scSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}