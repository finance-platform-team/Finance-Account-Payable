import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchPaymentPlanLines,
  getDecisionBadgeStyle,
  getStageBadgeStyle,
  updatePaymentPlanAmount,
  updatePaymentPlanDueDate,
  updatePaymentPlanNotes,
  updatePaymentPlanStatus,
} from "../lib/apPaymentPlanService";
import type { PPLine } from "../types/apPaymentPlan";
import { PP_PER_PAGE } from "../types/apPaymentPlan";
import CreateDecisionModal from "./CreateDecisionModal";
import BudgetRequestPanel from "./BudgetRequestPanel";
import { useToast } from "../lib/ToastContext";
import "../styles/CashFlowStatement.css";

const TREASURY_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "1", label: "Pending" },
  { value: "2", label: "Paid" },
  { value: "3", label: "Scheduled" },
  { value: "4", label: "Clarification Required" },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "1", label: "AP Draft" },
  { value: "3", label: "Pending SC" },
  { value: "4", label: "Returned to AP" },
  { value: "5", label: "Pending Treasury" },
  { value: "2", label: "Pending AP Approval" },
  { value: "6", label: "Closed" },
];

function fmtAmount(v: number | null): string {
  return v || v === 0
    ? Number(v).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "-";
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

export default function PaymentPlanTab() {
  const { showToast } = useToast();

  const [lines, setLines] = useState<PPLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [treasuryStatusFilter, setTreasuryStatusFilter] = useState("all");
  const [buFilter, setBuFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [editingDueId, setEditingDueId] = useState<string | null>(null);
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [commentTarget, setCommentTarget] = useState<PPLine | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [savingComment, setSavingComment] = useState(false);

  const loadLines = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPaymentPlanLines();
      setLines(data);
    } catch (e) {
      console.error("Error loading payment plan:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLines();
  }, [loadLines]);

  const buOptions = useMemo(() => {
    const set = new Set<string>();
    lines.forEach((r) => {
      if (r.bu && r.bu !== "-") set.add(r.bu);
    });
    return Array.from(set).sort();
  }, [lines]);

  // ── Filtering — mirrors renderPaymentPlanLines()'s filter/search logic ──
  const filteredLines = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((r) => {
      if (statusFilter !== "all" && String(r.status ?? "") !== statusFilter) {
        return false;
      }
      if (
        treasuryStatusFilter !== "all" &&
        String(r.treasuryStatus ?? "") !== treasuryStatusFilter
      ) {
        return false;
      }
      if (buFilter !== "all" && r.bu !== buFilter) {
        return false;
      }
      if (q) {
        const combined = `${r.vendor} ${r.code} ${r.notes || ""}`.toLowerCase();
        if (!combined.includes(q)) return false;
      }
      return true;
    });
  }, [lines, search, statusFilter, treasuryStatusFilter, buFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, treasuryStatusFilter, buFilter]);

  const totalRows = filteredLines.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PP_PER_PAGE));
  const start = (page - 1) * PP_PER_PAGE;
  const pageRows = filteredLines.slice(start, start + PP_PER_PAGE);

  // ── Selection — mirrors toggleSelectRowPP / toggleSelectAllPP ──
  function toggleRow(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllOnPage(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      pageRows.forEach((r) => {
        if (checked) next.add(r.id);
        else next.delete(r.id);
      });
      return next;
    });
  }

  const allOnPageChecked =
    pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));

  // ── Bulk actions ──
  async function sendSelectedToSupplyChain() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setLoading(true);
    try {
      await Promise.all(ids.map((id) => updatePaymentPlanStatus(id, 3)));
      showToast(
        "Pending SC",
        `${ids.length} line(s) sent to Supply Chain for priority.`,
        "success",
      );
      setSelected(new Set());
      await loadLines();
    } catch (e) {
      console.error("Error sending to Supply Chain:", e);
      showToast("Error", "Failed to update record in Dataverse.", "alert");
    } finally {
      setLoading(false);
    }
  }

  // ── Due Date inline edit — mirrors handlePPDueDateChange() ──
  async function handleDueDateChange(id: string, value: string) {
    setEditingDueId(null);
    if (!value) return;
    try {
      await updatePaymentPlanDueDate(id, value);
      await loadLines();
    } catch (e) {
      console.error("Error updating due date:", e);
      showToast("Error", "Failed to update due date.", "alert");
    }
  }

  // ── Amount inline edit + reset-to-initial ──
  function getAmountDraft(row: PPLine): string {
    if (row.id in amountDrafts) return amountDrafts[row.id];
    return row.currentAmount != null ? String(row.currentAmount) : "";
  }

  async function saveAmount(id: string, value: string) {
    const num = Number(value);
    if (value.trim() === "" || isNaN(num)) return;
    try {
      await updatePaymentPlanAmount(id, num);
      await loadLines();
      setAmountDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (e) {
      console.error("Error updating amount:", e);
      showToast("Error", "Failed to update amount.", "alert");
    }
  }

  async function resetAmountToInitial(row: PPLine) {
    if (row.initialAmount == null) return;
    await saveAmount(row.id, String(row.initialAmount));
  }

  // ── AP Comment modal (shown only when exactly one line is selected) ──
  function openComment(row: PPLine) {
    setCommentTarget(row);
    setCommentDraft(row.notes || "");
  }

  async function saveComment() {
    if (!commentTarget) return;
    setSavingComment(true);
    try {
      await updatePaymentPlanNotes(commentTarget.id, commentDraft.trim());
      showToast("Comment Saved", commentTarget.vendor, "success");
      setCommentTarget(null);
      await loadLines();
    } catch (e) {
      console.error("Error saving AP comment:", e);
      showToast("Error", "Failed to save AP comment.", "alert");
    } finally {
      setSavingComment(false);
    }
  }

  const selectedCount = selected.size;
  const selectedSingleRow =
    selectedCount === 1
      ? lines.find((r) => selected.has(r.id)) || null
      : null;

  return (
    <div className="cfs-root">
      <div id="ap-payment-plan" className="ap-screen active">
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
          </div>
          <button className="btn btn-outline" onClick={loadLines}>
            Refresh Data
          </button>
        </div>

        <BudgetRequestPanel />

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
                  <span
                    style={{
                      font: "800 14px var(--sans)",
                      color: "var(--brand-black)",
                      display: "block",
                    }}
                  >
                    Payment Plan Lines
                  </span>
                  <span
                    style={{
                      font: "400 11px var(--body)",
                      color: "var(--muted)",
                    }}
                  >
                    Select lines to initiate Supply Chain review or submit to
                    Treasury.
                  </span>
                </div>
                <div
                  style={{
                    marginLeft: "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: 18,
                  }}
                >
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
                      Status
                    </span>
                    <div className="select-wrap">
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={{ padding: "5px 28px 5px 12px" }}
                      >
                        {STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <span className="sel-arrow">▾</span>
                    </div>
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
                      Treasury Status
                    </span>
                    <div className="select-wrap">
                      <select
                        value={treasuryStatusFilter}
                        onChange={(e) => setTreasuryStatusFilter(e.target.value)}
                        style={{ padding: "5px 28px 5px 12px" }}
                      >
                        {TREASURY_STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <span className="sel-arrow">▾</span>
                    </div>
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
                      <select
                        value={buFilter}
                        onChange={(e) => setBuFilter(e.target.value)}
                        style={{ padding: "5px 28px 5px 12px" }}
                      >
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
                <span style={{ font: "800 14px var(--sans)", color: "var(--brand-black)" }}>
                  {selectedCount} line(s) selected
                </span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                  <button className="btn btn-outline" onClick={() => setSelected(new Set())}>
                    Clear
                  </button>
                  {selectedSingleRow && (
                    <button
                      className="btn btn-outline"
                      onClick={() => openComment(selectedSingleRow)}
                    >
                      AP Comment
                    </button>
                  )}
                  <button className="btn btn-primary" onClick={sendSelectedToSupplyChain}>
                    Send to Supply Chain
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ background: "var(--gold-dark)" }}
                    onClick={() => setDecisionOpen(true)}
                  >
                    Submit to Treasury (TMS)
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── GRID ── */}
        <div className="pp-panel">
          <div className="pp-grid-cols pp-header-row">
            <div className="pp-header-cell--center">
              <input
                type="checkbox"
                className="pp-checkbox"
                checked={allOnPageChecked}
                onChange={(e) => toggleAllOnPage(e.target.checked)}
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
            <div className="pp-empty">No data matching criteria</div>
          ) : (
            pageRows.map((r) => (
              <div
                key={r.id}
                className={`pp-grid-cols pp-row${selected.has(r.id) ? " is-selected" : ""}`}
              >
                <div className="pp-cell--center" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="pp-checkbox"
                    checked={selected.has(r.id)}
                    onChange={(e) => toggleRow(r.id, e.target.checked)}
                  />
                </div>
                <div className="pp-cell">{r.category}</div>
                <div className="pp-cell">{r.code}</div>
                <div className="pp-cell pp-cell--vendor">{r.vendor}</div>
                <div className="pp-cell pp-cell--muted">{r.bu}</div>
                <div className="pp-cell pp-cell--right">
                  {fmtAmount(r.initialAmount)}
                </div>
                <div
                  className="pp-cell pp-cell--right"
                  onClick={(e) => e.stopPropagation()}
                  style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}
                >
                  <input
                    type="number"
                    value={getAmountDraft(r)}
                    onChange={(e) =>
                      setAmountDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))
                    }
                    onBlur={(e) => saveAmount(r.id, e.target.value)}
                    style={{
                      width: 90,
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      padding: "5px 8px",
                      background: "#fff",
                      font: "700 12px var(--mono)",
                      color: "var(--brand-black)",
                      textAlign: "right",
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={() => resetAmountToInitial(r)}
                    title="Reset to Initial Amount"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--dim)",
                      padding: 2,
                      display: "flex",
                    }}
                  >
                    ↺
                  </button>
                </div>
                <div className="pp-cell" onClick={(e) => e.stopPropagation()}>
                  {editingDueId === r.id ? (
                    <input
                      type="date"
                      autoFocus
                      defaultValue={r.dueRaw}
                      onBlur={(e) => handleDueDateChange(r.id, e.target.value)}
                      onChange={(e) => handleDueDateChange(r.id, e.target.value)}
                      style={{
                        width: "100%",
                        maxWidth: 135,
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        padding: "5px 6px",
                        background: "#fff",
                        font: "500 11.5px var(--body)",
                        color: "var(--text-body)",
                        outline: "none",
                      }}
                    />
                  ) : (
                    <span
                      onClick={() => setEditingDueId(r.id)}
                      style={{
                        cursor: "pointer",
                        color: r.due && r.due !== "-" ? "inherit" : "var(--dim)",
                        fontStyle: r.due && r.due !== "-" ? "normal" : "italic",
                      }}
                    >
                      {r.due && r.due !== "-" ? r.due : "Set due date"}
                    </span>
                  )}
                </div>
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

          {totalRows > 0 && (
            <div className="pp-pagination">
              <span style={{ font: "400 12px var(--body)", color: "var(--muted)" }}>
                Page {page} of {totalPages} · {totalRows} records
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="btn btn-outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{ padding: "6px 14px", fontSize: 11 }}
                >
                  ← Prev
                </button>
                <button
                  className="btn btn-outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  style={{ padding: "6px 14px", fontSize: 11 }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>

        <CreateDecisionModal
          open={decisionOpen}
          sectionName="Treasury Submit"
          onClose={() => setDecisionOpen(false)}
          onSuccess={() => {
            setDecisionOpen(false);
            setSelected(new Set());
          }}
        />

        {/* ── AP Comment modal ── */}
        {commentTarget && (
          <div className="modal-overlay active" onClick={() => setCommentTarget(null)}>
            <div className="modal-box" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-hdr">
                <div>
                  <div className="modal-title">AP Comment</div>
                  <div className="modal-sub">{commentTarget.vendor}</div>
                </div>
                <button className="modal-close" onClick={() => setCommentTarget(null)}>
                  ×
                </button>
              </div>
              <div className="modal-body">
                <div className="form-field">
                  <label className="field-lbl">Comment</label>
                  <textarea
                    className="field-input"
                    rows={4}
                    style={{ resize: "vertical" }}
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-outline"
                  onClick={() => setCommentTarget(null)}
                  disabled={savingComment}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={saveComment}
                  disabled={savingComment}
                >
                  {savingComment ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}