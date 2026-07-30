import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAmountHistory,
  fetchPaymentPlanLines,
  getDecisionBadgeStyle,
  getStageBadgeStyle,
  saveAmountChangeWithReason,
  updatePaymentPlanDueDate,
  updatePaymentPlanNotes,
  updatePaymentPlanStatus,
} from "../lib/apPaymentPlanService";
import type { AmountHistoryEntry } from "../lib/apPaymentPlanService";
import type { PPLine } from "../types/apPaymentPlan";
import { PP_PER_PAGE } from "../types/apPaymentPlan";
import CreateDecisionModal from "./CreateDecisionModal";
import BudgetRequestPanel from "./BudgetRequestPanel";
import { useToast } from "../lib/ToastContext";
import { fetchScPriorityForView } from "../lib/scPriorityService";
import type { ScPriorityViewData } from "../lib/scPriorityService";import "../styles/CashFlowStatement.css";

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

/** Comma-grouped integer/decimal display — mirrors r.currentAmount.toLocaleString('en-US'). */
function fmtAmountEnUS(v: number | null | undefined): string {
  return v != null ? v.toLocaleString("en-US") : "";
}

/** Formats a raw YYYY-MM-DD date for display — "dd Mon yyyy". */
function formatDisplayDueDate(raw: string): string {
  if (!raw) return "";
  const d = new Date(`${raw}T00:00:00`);
  if (isNaN(d.getTime())) return raw;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(d.getDate()).padStart(2, "0")} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** Matches the legacy dateStr format: "29 Jul 2026 06:40 PM". */
function fmtHistoryDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  const datePart = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timePart = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart} ${timePart}`;
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
  const [historyTarget, setHistoryTarget] = useState<PPLine | null>(null);
  const [historyEntries, setHistoryEntries] = useState<AmountHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
    const [scViewRow, setScViewRow] = useState<PPLine | null>(null);
  const [scViewData, setScViewData] = useState<ScPriorityViewData | null>(null);
  const [scViewLoading, setScViewLoading] = useState(false);
  const [pendingAmountChange, setPendingAmountChange] = useState<{
    id: string;
    vendor: string;
    newAmount: number;
    dueDateRaw: string;
  } | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [reasonDueDate, setReasonDueDate] = useState("");
  const [reasonDueDateEditing, setReasonDueDateEditing] = useState(false);
  const [savingReason, setSavingReason] = useState(false);
  const [reasonError, setReasonError] = useState<string | null>(null);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount; loadLines is async and only sets state after the await, not synchronously in this effect.
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
    const result = lines.filter((r) => {
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
    // Default sort: most recently modified first — mirrors renderPaymentPlanLines().
    result.sort((a, b) => {
      const da = a.modifiedOn ? new Date(a.modifiedOn).getTime() : 0;
      const db = b.modifiedOn ? new Date(b.modifiedOn).getTime() : 0;
      return db - da;
    });
    return result;
  }, [lines, search, statusFilter, treasuryStatusFilter, buFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // ── Amount inline edit — mirrors handlePPAmountInputChange() ──
  function getAmountDraft(row: PPLine): string {
    if (row.id in amountDrafts) return amountDrafts[row.id];
    return fmtAmountEnUS(row.currentAmount);
  }

  function handleAmountBlur(row: PPLine, rawValue: string) {
    const cleaned = rawValue.replace(/,/g, "").trim();
    const newAmt = parseFloat(cleaned);

    if (cleaned === "" || isNaN(newAmt) || newAmt < 0) {
      showToast("Error", "Please enter a valid amount.", "alert");
      setAmountDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      return;
    }

    if (row.currentAmount != null && newAmt === row.currentAmount) {
      // No actual change — nothing to do.
      setAmountDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      return;
    }

    setPendingAmountChange({
      id: row.id,
      vendor: row.vendor,
      newAmount: newAmt,
      dueDateRaw: row.dueRaw,
    });
    setReasonText("");
    setReasonDueDate(row.dueRaw);
    setReasonDueDateEditing(false);
    setReasonError(null);
  }

  async function handleSaveAmountReason() {
    if (!pendingAmountChange) return;
    if (!reasonText.trim()) {
      setReasonError("Please enter a reason for this change.");
      return;
    }
    setSavingReason(true);
    try {
      await saveAmountChangeWithReason(
        pendingAmountChange.id,
        pendingAmountChange.newAmount,
        reasonText.trim(),
        reasonDueDate || undefined,
      );
      setAmountDrafts((prev) => {
        const next = { ...prev };
        delete next[pendingAmountChange.id];
        return next;
      });
      const wasHistoryOpenForSameRow = historyTarget?.id === pendingAmountChange.id;
      setPendingAmountChange(null);
      await loadLines();
      if (wasHistoryOpenForSameRow) {
        const refreshedRow = lines.find((r) => r.id === pendingAmountChange.id);
        if (refreshedRow) await openAmountHistory(refreshedRow);
      }
      showToast("Saved", "Amount updated and history recorded.", "success");
    } catch (e) {
      console.error("Error saving amount change:", e);
      showToast("Error", "Failed to save the amount change.", "alert");
    } finally {
      setSavingReason(false);
    }
  }

  // ── SC Priority (View Only) — mirrors loadAndOpenSCPriority(id, false) ──
  async function openScPriorityView(row: PPLine) {
    if (!row.scPriorityId) {
      showToast(
        "Not Prioritized",
        "Supply Chain has not set a priority for this line yet.",
        "alert",
      );
      return;
    }
    setScViewRow(row);
    setScViewLoading(true);
    try {
      const data = await fetchScPriorityForView(row.scPriorityId);
      setScViewData(data);
    } catch (e) {
      console.error("Error loading SC Priority for view:", e);
      showToast("Error", "Failed to load SC Priority.", "alert");
      setScViewRow(null);
    } finally {
      setScViewLoading(false);
    }
  }

  function closeScPriorityView() {
    setScViewRow(null);
    setScViewData(null);
  }
  // ── Amount History modal — mirrors openInitialAmountHistoryModal() ──
  async function openAmountHistory(row: PPLine) {
    setHistoryTarget(row);
    setHistoryLoading(true);
    try {
      const entries = await fetchAmountHistory(row.id);
      setHistoryEntries(entries);
    } catch (e) {
      console.error("Error loading amount history:", e);
      showToast("Error", "Failed to load amount history.", "alert");
    } finally {
      setHistoryLoading(false);
    }
  }

  function handleCancelAmountChange() {
    if (pendingAmountChange) {
      setAmountDrafts((prev) => {
        const next = { ...prev };
        delete next[pendingAmountChange.id];
        return next;
      });
    }
    setPendingAmountChange(null);
    setReasonError(null);
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

  const selectedRowsFull = lines.filter((r) => selected.has(r.id));

  let primaryActionText = "Process Selected";
  let primaryActionKind: "supplyChain" | "treasury" | "close" | "return" | "none" = "none";
  let isValidAction = true;
  let validationMsg = "";

  if (selectedRowsFull.length > 0) {
    const firstStage = selectedRowsFull[0].currentStage;
    const allSameStage = selectedRowsFull.every((r) => r.currentStage === firstStage);

    if (!allSameStage) {
      isValidAction = false;
      validationMsg =
        "Selected lines have different workflow stages. Please select lines with the same stage.";
    } else if (firstStage === "AP Draft" || firstStage === "Pending AP Approval") {
      if (selectedRowsFull.length === 1 && selectedRowsFull[0].treasuryStatus === 2) {
        primaryActionText = "Close Payment Plan";
        primaryActionKind = "close";
      } else if (selectedRowsFull.length === 1 && selectedRowsFull[0].treasuryStatus === 4) {
        primaryActionText = "Return to AP";
        primaryActionKind = "return";
      } else {
        primaryActionText = "Send Selected to Supply Chain";
        primaryActionKind = "supplyChain";
      }
    } else if (firstStage === "Returned to AP") {
      primaryActionText = "Submit Selected to Treasury (TMS)";
      primaryActionKind = "treasury";
    } else {
      isValidAction = false;
      if (firstStage === "Pending SC") {
        primaryActionText = "Send Selected to Supply Chain";
        validationMsg = "Selected lines are already pending Supply Chain review.";
      } else if (firstStage === "Pending Treasury") {
        primaryActionText = "Submit Selected to Treasury (TMS)";
        validationMsg = "Selected lines are already submitted to Treasury.";
      } else if (firstStage === "Closed") {
        primaryActionText = "Submit Selected to Treasury (TMS)";
        validationMsg = "Selected lines are closed.";
      } else {
        primaryActionText = "Process Selected";
        validationMsg = "Selected stage is not eligible for further actions.";
      }
    }
  }

  async function handlePrimaryAction() {
    if (!isValidAction) return;
    const ids = Array.from(selected);
    try {
      if (primaryActionKind === "supplyChain") {
        setLoading(true);
        await Promise.all(ids.map((id) => updatePaymentPlanStatus(id, 3)));
        showToast("Pending SC", `${ids.length} line(s) sent to Supply Chain for priority.`, "success");
        setSelected(new Set());
        await loadLines();
      } else if (primaryActionKind === "close") {
        setLoading(true);
        await updatePaymentPlanStatus(ids[0], 6);
        showToast("Saved", "Payment Plan closed.", "success");
        setSelected(new Set());
        await loadLines();
      } else if (primaryActionKind === "return") {
        setLoading(true);
        await updatePaymentPlanStatus(ids[0], 4);
        showToast("Saved", "Payment Plan returned to AP.", "success");
        setSelected(new Set());
        await loadLines();
      } else if (primaryActionKind === "treasury") {
        setDecisionOpen(true);
      }
    } catch (e) {
      console.error("Error processing selected Payment Plan lines:", e);
      showToast("Error", "Failed to update record in Dataverse.", "alert");
    } finally {
      setLoading(false);
    }
  }

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
                      Status
                    </span>
                    <div className="select-wrap" style={{ width: 140 }}>
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                      >
                        <option value="all">All Statuses</option>
                        <option value="1">AP Draft</option>
                        <option value="2">Pending AP Approval</option>
                        <option value="3">Pending SC</option>
                        <option value="4">Returned to AP</option>
                        <option value="5">Pending Treasury</option>
                        <option value="6">Closed</option>
                      </select>
                      <span className="sel-arrow">▾</span>
                    </div>
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
                  {selectedCount === 1 && selectedSingleRow && (
                    <button
                      className="btn btn-outline"
                      onClick={() => openComment(selectedSingleRow)}
                    >
                      AP Comment
                    </button>
                  )}
                  {isValidAction ? (
                    <button className="btn btn-primary" onClick={handlePrimaryAction}>
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
            pageRows.map((r) => {
              const hasAmounts = r.plannedAmount != null && r.currentAmount != null;
              const isChanged = hasAmounts && r.currentAmount !== r.plannedAmount;
              return (
               <div
                  key={r.id}
                  className={`pp-grid-cols pp-row${selected.has(r.id) ? " is-selected" : ""}`}
                  onClick={() => toggleRow(r.id, !selected.has(r.id))}
                  onDoubleClick={() => openScPriorityView(r)}
                >
                  <div
                    className="pp-cell--center"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleRow(r.id, !selected.has(r.id));
                    }}
                  >
                    <input
                      type="checkbox"
                      className="pp-checkbox"
                      checked={selected.has(r.id)}
                      onChange={(e) => toggleRow(r.id, e.target.checked)}
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
                    {r.plannedAmount != null ? `EGP ${fmtAmountEnUS(r.plannedAmount)}` : "-"}
                  </div>
                  <div
                    className="pp-cell pp-cell--right"
                    onClick={(e) => e.stopPropagation()}
                    style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "stretch",
                        width: "100%",
                        maxWidth: 150,
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        background: "#fff",
                        overflow: "hidden",
                      }}
                    >
                      <input
                        type="text"
                        value={getAmountDraft(r)}
                        onChange={(e) =>
                          setAmountDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))
                        }
                        onBlur={(e) => handleAmountBlur(r, e.target.value)}
                        style={{
                          flex: "1 1 auto",
                          minWidth: 0,
                          width: "100%",
                          textAlign: "right",
                          border: "none",
                          padding: "7px 8px",
                          background: "transparent",
                          font: "700 12px var(--mono)",
                          color: "var(--brand-black)",
                          outline: "none",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => openAmountHistory(r)}
                        title="Show Amount History"
                        style={{
                          flex: "0 0 auto",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 30,
                          border: "none",
                          borderLeft: "1px solid var(--border)",
                          background: "var(--brand-gold-100)",
                          color: "var(--gold-dark)",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        🕓
                      </button>
                    </div>
                    {isChanged && (
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
                          borderBottom: "1px dashed var(--border)",
                          paddingBottom: 1,
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
              );
            })
          )}
          </div>

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
          onSuccess={async () => {
            // Mirrors the original: after the Decision (TMS task) is sent,
            // the selected lines' cfm_paymentplanstatus moves to 5
            // (Pending Treasury) so they leave this queue and appear in
            // the Treasury Workflow screen.
            const idsToSubmit = Array.from(selected);
            try {
              await Promise.all(idsToSubmit.map((id) => updatePaymentPlanStatus(id, 5)));
            } catch (e) {
              console.error("Error updating payment plan status to Pending Treasury:", e);
              showToast(
                "Error",
                "Decision sent, but failed to move the line(s) to Pending Treasury.",
                "alert",
              );
            }
            setDecisionOpen(false);
            setSelected(new Set());
            await loadLines();
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

        {/* ── Reason for Amount Change modal — mirrors openAmountChangeReasonModal() ── */}
        {pendingAmountChange && (
          <div className="modal-overlay active" onClick={handleCancelAmountChange}>
            <div className="modal-box" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-hdr">
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      background: "var(--gold-soft)",
                      borderRadius: "var(--r-md)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      fontSize: 15,
                      color: "var(--gold-dark)",
                    }}
                  >
                    ✎
                  </div>
                  <div>
                    <div className="modal-title">Reason for Amount Change</div>
                    <div className="modal-sub">Please explain why the amount is being changed.</div>
                  </div>
                </div>
                <button className="modal-close" onClick={handleCancelAmountChange}>
                  ×
                </button>
              </div>

              <div className="modal-body">
                {reasonError && (
                  <div
                    style={{
                      background: "var(--danger-soft)",
                      color: "var(--danger)",
                      padding: "10px 12px",
                      borderRadius: "var(--r-md)",
                      fontSize: 12,
                      marginBottom: 14,
                    }}
                  >
                    {reasonError}
                  </div>
                )}

                <div className="form-2col">
                  <div className="form-field">
                    <label className="field-lbl">Amount</label>
                    <input
                      className="field-input"
                      type="text"
                      readOnly
                      value={`EGP ${fmtAmountEnUS(pendingAmountChange.newAmount)}`}
                      style={{ color: "var(--muted)", background: "var(--canvas)", fontWeight: 600 }}
                    />
                  </div>
                  <div className="form-field">
                    <label className="field-lbl">Due Date</label>
                    {reasonDueDateEditing ? (
                      <input
                        className="field-input"
                        type="date"
                        autoFocus
                        value={reasonDueDate}
                        onChange={(e) => setReasonDueDate(e.target.value)}
                        onBlur={() => setReasonDueDateEditing(false)}
                      />
                    ) : (
                      <div
                        className="field-input"
                        onClick={() => setReasonDueDateEditing(true)}
                        style={{
                          cursor: "pointer",
                          color: reasonDueDate ? "var(--brand-black)" : "var(--dim)",
                          fontStyle: reasonDueDate ? "normal" : "italic",
                        }}
                      >
                        {reasonDueDate ? formatDisplayDueDate(reasonDueDate) : "Select due date…"}
                      </div>
                    )}
                  </div>
                </div>

                <div className="form-field">
                  <label className="field-lbl">
                    Reason for this change <span className="field-req">*</span>
                  </label>
                  <textarea
                    className="field-input"
                    rows={3}
                    style={{ resize: "vertical" }}
                    placeholder="e.g. Vendor Discount, Management Decision…"
                    value={reasonText}
                    onChange={(e) => setReasonText(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn btn-outline" onClick={handleCancelAmountChange} disabled={savingReason}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleSaveAmountReason}
                  disabled={savingReason}
                >
                  {savingReason ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
        {scViewRow && (
          <div className="modal-overlay active" onClick={closeScPriorityView}>
            <div className="modal-box" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-hdr">
                <div>
                  <div className="modal-title">Supply Chain priority</div>
                  <div className="modal-sub">{scViewRow.vendor}</div>
                </div>
                <button className="modal-close" onClick={closeScPriorityView}>
                  ×
                </button>
              </div>
              <div className="modal-body">
                {scViewLoading || !scViewData ? (
                  <div className="pp-empty">Loading…</div>
                ) : (
                  <div className="sc-detail-grid">
                    <div className="sc-detail-col">
                      <div className="sc-detail-row">
                        <span className="sc-detail-label">Priority Status</span>
                        <div className="sc-detail-value" style={{ textAlign: "right" }}>
                          <span className="pp-badge">{scViewData.priorityStatusLabel}</span>
                        </div>
                      </div>
                      <div className="sc-detail-row">
                        <span className="sc-detail-label">Priority Rank</span>
                        <div className="sc-detail-value" style={{ textAlign: "right", font: "700 14px var(--mono)", color: "var(--brand-black)" }}>
                          {scViewData.priorityRank}
                        </div>
                      </div>
                      <div className="sc-detail-row">
                        <span className="sc-detail-label">Recommended Action</span>
                        <div className="sc-detail-value" style={{ textAlign: "right" }}>
                          <span className="pp-badge">{scViewData.recommendedActionLabel}</span>
                        </div>
                      </div>
                      <div className="sc-detail-row">
                        <span className="sc-detail-label">Recommended Amount</span>
                        <div className="sc-detail-value" style={{ textAlign: "right", font: "600 12px var(--mono)", color: "var(--brand-black)" }}>
                          {scViewData.recommendedAmount}
                        </div>
                      </div>
                      <div className="sc-detail-row">
                        <span className="sc-detail-label">Recommended Date</span>
                        <div className="sc-detail-value" style={{ textAlign: "right", font: "500 12px var(--body)", color: "var(--brand-black)" }}>
                          {scViewData.recommendedDate}
                        </div>
                      </div>
                      <div className="sc-detail-row">
                        <span className="sc-detail-label">Supply Risk if Not Paid</span>
                        <div className="sc-detail-value" style={{ textAlign: "right" }}>
                          <span className="pp-badge">{scViewData.supplyRiskLabel}</span>
                        </div>
                      </div>
                      <div className="sc-detail-row sc-detail-row--last">
                        <span className="sc-detail-label">Vendor Criticality</span>
                        <div className="sc-detail-value" style={{ textAlign: "right" }}>
                          <span className="pp-badge">{scViewData.vendorCriticalityLabel}</span>
                        </div>
                      </div>
                    </div>
                    <div className="sc-detail-col">
                      <div className="sc-detail-row">
                        <span className="sc-detail-label">Alternative Vendor</span>
                        <div className="sc-detail-value" style={{ textAlign: "right", font: "500 12px var(--body)", color: "var(--brand-black)" }}>
                          {scViewData.altVendorLabel}
                        </div>
                      </div>
                      <div className="sc-detail-row">
                        <span className="sc-detail-label">Partial Payment Accepted</span>
                        <div className="sc-detail-value" style={{ textAlign: "right", font: "500 12px var(--body)", color: "var(--brand-black)" }}>
                          {scViewData.partialAcceptedLabel}
                        </div>
                      </div>
                      <div className="sc-detail-row">
                        <span className="sc-detail-label">Supply Chain Owner</span>
                        <div className="sc-detail-value" style={{ textAlign: "right", font: "700 12px var(--sans)", color: "var(--brand-black)" }}>
                          {scViewData.scOwner}
                        </div>
                      </div>
                      <div className="sc-detail-row sc-detail-row--last">
                        <span className="sc-detail-label">Response Date &amp; Time</span>
                        <div className="sc-detail-value" style={{ textAlign: "right", font: "700 12px var(--sans)", color: "var(--brand-black)" }}>
                          {scViewData.responseDateTime}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline" onClick={closeScPriorityView}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
        
        {historyTarget && (
          <div className="modal-overlay active" onClick={() => setHistoryTarget(null)}>
            <div className="modal-box" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-hdr">
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      background: "var(--gold-soft)",
                      borderRadius: "var(--r-md)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      fontSize: 16,
                      color: "var(--gold-dark)",
                    }}
                  >
                    ↺
                  </div>
                  <div>
                    <div className="modal-title">Initial Amount History</div>
                    <div className="modal-sub">{historyTarget.vendor}</div>
                  </div>
                </div>
                <button className="modal-close" onClick={() => setHistoryTarget(null)}>
                  ×
                </button>
              </div>

              <div className="modal-body">
                {/* Initial Amount (from Aging Total Dues) reference box */}
                <div
                  style={{
                    background: "var(--canvas)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-md)",
                    padding: "12px 14px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 18,
                  }}
                >
                  <span
                    style={{
                      font: "700 9px var(--sans)",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      color: "var(--dim)",
                    }}
                  >
                    Initial Amount (from Aging Total Dues)
                  </span>
                  <span style={{ font: "700 15px var(--mono)", color: "var(--brand-black)" }}>
                    {historyTarget.initialAmount != null
                      ? `EGP ${fmtAmountEnUS(historyTarget.initialAmount)}`
                      : "—"}
                  </span>
                </div>

                <div
                  style={{
                    font: "700 10px var(--sans)",
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                    color: "var(--dim)",
                    marginBottom: 12,
                  }}
                >
                  🕓 Amount Change Timeline
                </div>

                {historyLoading ? (
                  <div className="pp-empty">Loading…</div>
                ) : historyEntries.length === 0 ? (
                  <div style={{ display: "flex", gap: 12 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: "var(--border)",
                          marginTop: 4,
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          font: "700 9px var(--sans)",
                          color: "var(--dim)",
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                        }}
                      >
                        Initial Amount
                      </div>
                      <div style={{ font: "700 13px var(--mono)", color: "var(--brand-black)", marginTop: 2 }}>
                        {historyTarget.initialAmount != null
                          ? `EGP ${fmtAmountEnUS(historyTarget.initialAmount)}`
                          : "—"}
                      </div>
                      <div style={{ font: "400 11px var(--body)", color: "var(--dim)", fontStyle: "italic", marginTop: 4 }}>
                        No amount changes have been recorded yet.
                      </div>
                    </div>
                  </div>
                ) : (
                  historyEntries.map((h, i) => {
                    const isLast = i === historyEntries.length - 1;
                    return (
                      <div key={h.id} style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <div
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              background: "var(--gold-dark)",
                              marginTop: 4,
                              flexShrink: 0,
                            }}
                          />
                          {!isLast && (
                            <div style={{ width: 1, flex: 1, background: "var(--border)", marginTop: 4 }} />
                          )}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ font: "700 11.5px var(--sans)", color: "var(--brand-black)" }}>
                            {fmtHistoryDate(h.createdOn)}
                          </div>
                          <div style={{ font: "600 11px var(--body)", color: "var(--muted)", marginTop: 2 }}>
                            {h.userName}
                          </div>
                          <div style={{ font: "500 11.5px var(--body)", color: "var(--text-body)", marginTop: 6 }}>
                            <span style={{ fontWeight: 700, color: "var(--gold-dark)" }}>Amount:</span>{" "}
                            {h.amount != null ? `EGP ${fmtAmountEnUS(h.amount)}` : "-"}
                          </div>
                          <div style={{ font: "500 11.5px var(--body)", color: "var(--text-body)", marginTop: 2 }}>
                            <span style={{ fontWeight: 700, color: "var(--dim)" }}>Reason:</span>{" "}
                            {h.reason || "-"}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="modal-footer">
                <button className="btn btn-outline" onClick={() => setHistoryTarget(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}