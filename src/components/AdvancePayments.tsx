// src/components/AdvancePayments.tsx

import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import {
  fetchAdvancePayments,
  lookupCompanyByCode,
  submitAdvancePayment,
  updateAdvancePaymentStatus,
} from "../lib/advancePaymentService";
import type {
  AdvancePayment,
  AdvPaymentStatusValue,
  MatchedAdvCompany,
} from "../types/advancePayment";
import { advStatusMeta, ADV_PER_PAGE } from "../types/advancePayment";
import { useToast } from "../lib/ToastContext";
import { exportRowsToXLS, exportFilenameStamp } from "../lib/xlsExport";
import { useCurrentUser } from "../lib/CurrentUserContext";
import "../styles/CashFlowStatement.css";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "0", label: "Pending in AP" },
  { value: "2", label: "Pending in Treasury" },
  { value: "1", label: "Approved" },
  { value: "3", label: "Rejected By AP" },
  { value: "766340001", label: "Rejected By Treasury" },
  { value: "766340002", label: "Closed" },
];

function fmtAmountEnUS(v: number): string {
  return v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function StatusBadge({ statusValue }: { statusValue: number }) {
  const meta = advStatusMeta(statusValue);
  return (
    <span
      className="adv-status-badge"
      style={{ background: meta.bg, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

// ── Add/Edit form state ──
interface AdvFormState {
  editId: string | null;
  code: string;
  name: string;
  bu: string;
  category: string;
  amount: string;
  date: string; // "YYYY-MM-DD"
  notes: string;
}

const EMPTY_ADV_FORM: AdvFormState = {
  editId: null,
  code: "",
  name: "",
  bu: "",
  category: "",
  amount: "",
  date: "",
  notes: "",
};

export default function AdvancePaymentsTab() {
  const { showToast } = useToast();
  const { hasRole } = useCurrentUser();

  const [lines, setLines] = useState<AdvancePayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [buFilter, setBuFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  // ── Add/Edit form ──
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<AdvFormState>(EMPTY_ADV_FORM);
  const [matchedCompany, setMatchedCompany] = useState<MatchedAdvCompany | null>(null);
  const [nameStatus, setNameStatus] = useState<"idle" | "found" | "not-found" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);

  // ── Confirm-submit modal (self-contained replacement for showConfirmModal()) ──
  const [confirmOpen, setConfirmOpen] = useState(false);

  // ── Review modal ──
  const [reviewTarget, setReviewTarget] = useState<AdvancePayment | null>(null);
  const [reviewSaving, setReviewSaving] = useState(false);

  const loadLines = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdvancePayments();
      setLines(data);
    } catch (e) {
      console.error("Error loading advance payments:", e);
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

  // ── Filtering — mirrors renderAdvGrid() ──
  const filteredLines = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((r) => {
      if (statusFilter !== "all" && String(r.statusValue) !== statusFilter) return false;
      if (buFilter !== "all" && (r.bu || "-") !== buFilter) return false;
      if (dateFrom && (!r.dateRaw || r.dateRaw < dateFrom)) return false;
      if (dateTo && (!r.dateRaw || r.dateRaw > dateTo)) return false;
      if (q) {
        const combined = `${r.vendorCode} ${r.vendorName} ${r.notes || ""} ${r.requestedBy || ""} ${r.category || ""}`.toLowerCase();
        if (!combined.includes(q)) return false;
      }
      return true;
    });
  }, [lines, search, statusFilter, buFilter, dateFrom, dateTo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [search, statusFilter, buFilter, dateFrom, dateTo]);

  const totalRows = filteredLines.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / ADV_PER_PAGE));
  const start = (page - 1) * ADV_PER_PAGE;
  const pageRows = filteredLines.slice(start, start + ADV_PER_PAGE);

  // ── Export — mirrors exportAdvancePaymentsXLS() ──
  function handleExport() {
    const headers = ["Code", "Name", "BU", "Category", "Advance Payment Amount", "Date", "Notes", "Requested By", "Status"];
    const exportRows = filteredLines.map((req) => [
      req.vendorCode || "-",
      req.vendorName || "-",
      req.bu || "-",
      req.category || "-",
      Number(req.amount || 0),
      req.date || "-",
      req.notes || "-",
      req.requestedBy || "-",
      advStatusMeta(req.statusValue).label,
    ]);
    if (!exportRowsToXLS(`Advance_Payments_${exportFilenameStamp()}`, headers, exportRows)) {
      showToast("Nothing to Export", "No rows match the current filters.", "alert");
      return;
    }
    showToast("Exported", `${exportRows.length} row(s) exported to Excel.`, "success");
  }

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

  // ── Form open/close/clear — mirrors clearAdvForm()/openAdvAddForm()/cancelAdvForm() ──
  function openAddForm() {
    if (!hasRole("SC")) {
      showToast("Not Authorized", "Only Supply Chain / HR Head can raise an advance payment request.", "alert");
      return;
    }
    setForm(EMPTY_ADV_FORM);
    setMatchedCompany(null);
    setNameStatus("idle");
    setFormOpen(true);
  }

  function cancelForm() {
    setForm(EMPTY_ADV_FORM);
    setMatchedCompany(null);
    setNameStatus("idle");
    setFormOpen(false);
  }

  // ── Resubmit a rejected request — mirrors openAdvEditForm() (no role check, per current decision) ──
  function openEditForm(req: AdvancePayment) {
    if (!hasRole("SC")) {
      showToast("Not Authorized", "Only Supply Chain / HR Head can edit and resubmit a rejected request.", "alert");
      return;
    }
    const meta = advStatusMeta(req.statusValue);
    if (meta.stage !== "sc-edit") {
      showToast("Not Editable", "Only rejected requests can be edited and resubmitted.", "alert");
      return;
    }
    setForm({
      editId: req.id,
      code: req.vendorCode === "-" ? "" : req.vendorCode,
      name: req.vendorName === "-" ? "" : req.vendorName,
      bu: req.bu && req.bu !== "-" ? req.bu : "",
      category: req.category && req.category !== "-" ? req.category : "",
      amount: req.amount ? fmtAmountEnUS(req.amount) : "",
      date: req.dateRaw || "",
      notes: req.notes || "",
    });
    setMatchedCompany({
      id: null,
      name: req.vendorName,
      code: req.vendorCode,
      bu: req.bu && req.bu !== "-" ? req.bu : "",
      category: req.category && req.category !== "-" ? req.category : "",
    });
    setNameStatus(req.vendorName && req.vendorName !== "-" ? "found" : "idle");
    setFormOpen(true);
  }

// ── Vendor code lookup — mirrors lookupAdvVendor(), triggered on every
  // keystroke like the original's oninput. Guards against race conditions
  // from fast typing by checking the code is still current when the
  // response comes back (mirrors the original's currentEl.value check). ──
  async function handleCodeLookup(code: string) {
    const trimmed = code.trim();
    if (trimmed.length < 2) {
      setForm((f) => ({ ...f, name: "", bu: "", category: "" }));
      setMatchedCompany(null);
      setNameStatus("idle");
      return;
    }
    try {
      const comp = await lookupCompanyByCode(trimmed);
      setForm((f) => {
        if (f.code.trim() !== trimmed) return f; // stale response, code changed since
        return {
          ...f,
          name: comp ? comp.name : "Company not found",
          bu: comp ? comp.bu || "-" : "",
          category: comp ? comp.category || "-" : "",
        };
      });
      if (comp) {
        setMatchedCompany(comp);
        setNameStatus("found");
      } else {
        setMatchedCompany(null);
        setNameStatus("not-found");
      }
    } catch (e) {
      console.warn("Insurance company lookup failed:", e);
      setMatchedCompany(null);
      setForm((f) => (f.code.trim() !== trimmed ? f : { ...f, name: "Lookup error", bu: "", category: "" }));
      setNameStatus("error");
    }
  }

  // ── Validation + confirm step — mirrors submitAdvancePayment() ──
  function handleOpenConfirm() {
    if (!form.code.trim()) {
      showToast("Required", "Please enter the Company Code.", "alert");
      return;
    }
    if (!form.name.trim() || form.name === "Company not found" || form.name === "Lookup error") {
      showToast("Required", "Company not found — please check the code.", "alert");
      return;
    }
    if (!form.amount.trim()) {
      showToast("Required", "Please enter the advance payment amount.", "alert");
      return;
    }
    if (!form.date.trim()) {
      showToast("Required", "Please enter the required payment date.", "alert");
      return;
    }
    const parsed = parseFloat(form.amount.replace(/,/g, ""));
    if (isNaN(parsed) || parsed <= 0) {
      showToast("Invalid", "Amount must be a positive number.", "alert");
      return;
    }
    setConfirmOpen(true);
  }

  // ── Final submit — mirrors proceedSubmitAdvancePayment() ──
  async function handleConfirmSubmit() {
    const parsedAmount = parseFloat(form.amount.replace(/,/g, ""));
    setSubmitting(true);
    try {
      await submitAdvancePayment(
        {
          amount: parsedAmount,
          dateIso: form.date,
          notes: form.notes.trim(),
          companyName: form.name.trim(),
          bu: matchedCompany?.bu || "",
          category: matchedCompany?.category || "",
          matchedCompanyId: matchedCompany?.id || null,
        },
        form.editId || undefined,
      );
      showToast(
        form.editId ? "Advance Request Resubmitted" : "Advance Request Submitted",
        `${form.name.trim()} — ${parsedAmount.toLocaleString()}`,
        "success",
      );
      setConfirmOpen(false);
      cancelForm();
      await loadLines();
    } catch (e) {
      console.error("Failed to save cfm_advancedpayment record:", e);
      showToast("Error", "Failed to submit the advance payment.", "alert");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Review modal — mirrors openAdvReviewModal() (no role check, per current decision) ──
  function openReview(req: AdvancePayment) {
    const meta = advStatusMeta(req.statusValue);
    const allowed =
      (meta.stage === "ap" && hasRole("AP")) ||
      (meta.stage === "treasury" && hasRole("TREASURY")) ||
      (meta.stage === "ap-close" && hasRole("AP"));
    if (!allowed) {
      showToast("Not Authorized", "You do not have permission to review this request at its current stage.", "alert");
      return;
    }
    setReviewTarget(req);
  }

  async function handleReviewDecision(nextStatus: AdvPaymentStatusValue) {
    if (!reviewTarget) return;
    const stage = advStatusMeta(reviewTarget.statusValue).stage;
    const allowed =
      (stage === "ap" && hasRole("AP")) ||
      (stage === "treasury" && hasRole("TREASURY")) ||
      (stage === "ap-close" && hasRole("AP"));
    if (!allowed) {
      showToast("Not Authorized", "You do not have permission to set this status.", "alert");
      return;
    }
    setReviewSaving(true);
    try {
      await updateAdvancePaymentStatus(reviewTarget.id, nextStatus);
      showToast("Advance Payment Updated", advStatusMeta(nextStatus).label, "success");
      setReviewTarget(null);
      await loadLines();
    } catch (e) {
      console.error("Error updating advance payment status:", e);
      showToast("Error", "Failed to update the advance payment.", "alert");
    } finally {
      setReviewSaving(false);
    }
  }

  const reviewMeta = reviewTarget ? advStatusMeta(reviewTarget.statusValue) : null;

  return (
    <div className="cfs-root">
      <div id="ap-advance-payments" className="ap-screen active">
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
              AP Planning · Advance Payments
            </div>
            <div style={{ font: "800 26px var(--sans)", color: "var(--brand-black)", letterSpacing: -0.4 }}>
              Advance Payments
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-outline" onClick={loadLines}>
              Refresh Data
            </button>
            <button className="btn btn-outline" onClick={handleExport}>
              Export
            </button>
            {!formOpen && hasRole("SC") && (
              <button className="btn btn-primary" onClick={openAddForm}>
                + Add advance payment
              </button>
            )}
          </div>
        </div>

        {/* ── ADD / EDIT FORM PANEL ── */}
        {formOpen && (
          <div className="adv-form-panel">
            <div style={{ font: "800 14px var(--sans)", color: "var(--brand-black)", marginBottom: 14 }}>
              {form.editId ? "Resubmit advance payment" : "Add advance payment"}
            </div>
            <div className="adv-form-grid">
              <div className="form-field">
                <label className="field-lbl">Company Code</label>
            <input
                  className="field-input"
                  type="text"
                  value={form.code}
                  onChange={(e) => {
                    const newCode = e.target.value;
                    setForm((f) => ({ ...f, code: newCode }));
                    handleCodeLookup(newCode);
                  }}
                  placeholder="e.g. VEND-001"
                />
              </div>
              <div className="form-field">
                <label className="field-lbl">Company Name</label>
                <input
                  className="field-input"
                  type="text"
                  value={form.name}
                  disabled
                  style={{
                    color:
                      nameStatus === "found"
                        ? "var(--green-dark)"
                        : nameStatus === "not-found" || nameStatus === "error"
                          ? "var(--danger)"
                          : "var(--muted)",
                    fontWeight: nameStatus === "found" ? 700 : 600,
                  }}
                />
              </div>
              <div className="form-field">
                <label className="field-lbl">BU</label>
                <input
                  className="field-input"
                  type="text"
                  value={form.bu}
                  disabled
                  style={{
                    color: form.bu ? "var(--green-dark)" : "var(--muted)",
                    fontWeight: form.bu ? 700 : 600,
                  }}
                />
              </div>
              <div className="form-field">
                <label className="field-lbl">Category</label>
                <input
                  className="field-input"
                  type="text"
                  value={form.category}
                  disabled
                  style={{
                    color: form.category ? "var(--green-dark)" : "var(--muted)",
                    fontWeight: form.category ? 700 : 600,
                  }}
                />
              </div>
              <div className="form-field">
                <label className="field-lbl">Amount</label>
                <input
                  className="field-input"
                  type="text"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="form-field">
                <label className="field-lbl">Required Payment Date</label>
                <input
                  className="field-input"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="form-field adv-form-grid--notes">
                <label className="field-lbl">Notes</label>
                <textarea
                  className="field-input"
                  rows={2}
                  style={{ resize: "vertical" }}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button className="btn btn-outline" onClick={cancelForm}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleOpenConfirm}>
                {form.editId ? "Resubmit advance payment" : "Add advance payment"}
              </button>
            </div>
          </div>
        )}

        {/* ── TOOLBAR / FILTERS ── */}
        <div className="pp-panel" style={{ marginBottom: 16, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", flexWrap: "wrap" }}>
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
                Status
              </span>
              <div className="select-wrap">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
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
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ font: "700 9px var(--sans)", textTransform: "uppercase", letterSpacing: 0.8, color: "var(--dim)" }}>
                From
              </span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{ padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 6, font: "500 12px var(--sans)" }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ font: "700 9px var(--sans)", textTransform: "uppercase", letterSpacing: 0.8, color: "var(--dim)" }}>
                To
              </span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={{ padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 6, font: "500 12px var(--sans)" }}
              />
            </div>
          </div>
        </div>

        {/* ── GRID ── */}
        <div className="pp-panel">
          <div className="pp-table-scroll">
            <div className="adv-grid-cols pp-header-row">
              <div className="pp-header-cell">Company Code</div>
              <div className="pp-header-cell">Company Name</div>
              <div className="pp-header-cell">BU</div>
              <div className="pp-header-cell">Category</div>
              <div className="pp-header-cell" style={{ textAlign: "center" }}>Amount</div>
              <div className="pp-header-cell">Date</div>
              <div className="pp-header-cell">Notes</div>
              <div className="pp-header-cell">Requested By</div>
              <div className="pp-header-cell">Status</div>
              <div className="pp-header-cell" style={{ textAlign: "center" }}>Action</div>
            </div>

            {loading ? (
              <div className="pp-empty">Loading…</div>
            ) : pageRows.length === 0 ? (
              <div className="pp-empty">
                {lines.length === 0
                  ? "No advance payments yet. Click Add advance payment to raise a request."
                  : "No advance payments match the current filters."}
              </div>
            ) : (
              pageRows.map((req) => {
                const meta = advStatusMeta(req.statusValue);
                return (
                  <div key={req.id} className="adv-grid-cols pp-row">
                    <div className="pp-cell" style={{ font: "600 12px var(--mono)", color: "var(--muted)" }}>
                      {req.vendorCode}
                    </div>
                    <div className="pp-cell" style={{ font: "700 12px var(--sans)", color: "var(--brand-black)" }}>
                      {req.vendorName}
                    </div>
                    <div className="pp-cell" style={{ font: "700 11px var(--mono)", color: "var(--muted)" }}>
                      {req.bu || "-"}
                    </div>
                    <div className="pp-cell pp-cell--muted">{req.category || "-"}</div>
                    <div className="pp-cell" style={{ font: "700 12px var(--mono)", color: "var(--gold-dark)", textAlign: "center" }}>
                      {fmtAmountEnUS(req.amount)}
                    </div>
                    <div className="pp-cell">{req.date}</div>
                    <div className="pp-cell pp-cell--muted">{req.notes || "-"}</div>
                    <div className="pp-cell">{req.requestedBy || "-"}</div>
                    <div className="pp-cell">
                      <StatusBadge statusValue={req.statusValue} />
                    </div>
                    <div className="pp-cell--center">
                      {(() => {
                        const canAct =
                          (meta.stage === "ap" && hasRole("AP")) ||
                          (meta.stage === "treasury" && hasRole("TREASURY")) ||
                          (meta.stage === "ap-close" && hasRole("AP")) ||
                          (meta.stage === "sc-edit" && hasRole("SC"));
                        if (!canAct) {
                          return <span style={{ color: "var(--dim)", fontSize: 11 }}>—</span>;
                        }
                        if (meta.stage === "sc-edit") {
                          return (
                            <button className="btn btn-outline" onClick={() => openEditForm(req)} style={{ padding: "6px 12px", fontSize: 11 }}>
                              Edit
                            </button>
                          );
                        }
                        return (
                          <button className="btn btn-outline" onClick={() => openReview(req)} style={{ padding: "6px 12px", fontSize: 11 }}>
                            {meta.stage === "ap-close" ? "Close" : "Review"}
                          </button>
                        );
                      })()}
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

        {/* ── CONFIRM SUBMIT MODAL ── */}
        {confirmOpen && (
          <div className="modal-overlay active" onClick={() => setConfirmOpen(false)}>
            <div className="modal-box" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-hdr">
                <div className="modal-title">
                  {form.editId ? "Resubmit this advance payment request?" : "Submit advance payment request?"}
                </div>
                <button className="modal-close" onClick={() => setConfirmOpen(false)}>
                  ×
                </button>
              </div>
              <div className="modal-body">
                <div style={{ font: "500 12.5px var(--body)", color: "var(--text-body)", lineHeight: 1.8 }}>
                  <div><strong>Company:</strong> {form.name.trim()} ({form.code.trim()})</div>
                  <div><strong>Amount:</strong> {fmtAmountEnUS(parseFloat(form.amount.replace(/,/g, "")) || 0)}</div>
                  <div><strong>Date:</strong> {form.date}</div>
                  <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 11.5 }}>
                    {form.editId
                      ? "This will move the request back to Pending in AP for a fresh review."
                      : "This will be routed to AP for review and Treasury for budget confirmation."}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleConfirmSubmit} disabled={submitting}>
                  {submitting ? "Submitting…" : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── REVIEW MODAL — mirrors openAdvReviewModal() ── */}
        {reviewTarget && reviewMeta && (
          <div className="modal-overlay active" onClick={() => setReviewTarget(null)}>
            <div className="modal-box" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-hdr">
                <div>
                  <div className="modal-title">Review Advance Payment</div>
                  <div className="modal-sub">{reviewTarget.vendorName}</div>
                </div>
                <button className="modal-close" onClick={() => setReviewTarget(null)}>
                  ×
                </button>
              </div>
              <div className="modal-body">
                <div className="adv-review-field">
                  <label>Company Code</label>
                  <div style={{ font: "600 12px var(--mono)", color: "var(--muted)" }}>{reviewTarget.vendorCode}</div>
                </div>
                <div className="adv-review-field">
                  <label>Company Name</label>
                  <div style={{ font: "700 13px var(--sans)", color: "var(--brand-black)" }}>{reviewTarget.vendorName}</div>
                </div>
                <div className="adv-review-field">
                  <label>Amount</label>
                  <div style={{ font: "700 13px var(--mono)", color: "var(--gold-dark)" }}>
                    {fmtAmountEnUS(reviewTarget.amount)}
                  </div>
                </div>
                <div className="adv-review-field">
                  <label>Date</label>
                  <div style={{ font: "500 12px var(--body)", color: "var(--brand-black)" }}>{reviewTarget.date}</div>
                </div>
                <div className="adv-review-field">
                  <label>Notes</label>
                  <div style={{ font: "400 12px var(--body)", color: "var(--muted)" }}>{reviewTarget.notes || "-"}</div>
                </div>
                <div className="adv-review-field">
                  <label>Current Status</label>
                  <span className="adv-status-badge" style={{ background: reviewMeta.bg, color: reviewMeta.color }}>
                    {reviewMeta.label}
                  </span>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline" onClick={() => setReviewTarget(null)} disabled={reviewSaving}>
                  Cancel
                </button>
                {reviewTarget.statusValue === 0 && (
                  <>
                    <button
                      className="btn btn-outline"
                      style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
                      onClick={() => handleReviewDecision(3)}
                      disabled={reviewSaving}
                    >
                      Reject (AP)
                    </button>
                    <button className="btn btn-primary" onClick={() => handleReviewDecision(2)} disabled={reviewSaving}>
                      {reviewSaving ? "Saving…" : "Approve (AP)"}
                    </button>
                  </>
                )}
                {reviewTarget.statusValue === 2 && (
                  <>
                    <button
                      className="btn btn-outline"
                      style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
                      onClick={() => handleReviewDecision(766340001)}
                      disabled={reviewSaving}
                    >
                      Reject (Treasury)
                    </button>
                    <button className="btn btn-primary" onClick={() => handleReviewDecision(1)} disabled={reviewSaving}>
                      {reviewSaving ? "Saving…" : "Approve (Treasury)"}
                    </button>
                  </>
                )}
                {reviewTarget.statusValue === 1 && (
                  <button className="btn btn-primary" onClick={() => handleReviewDecision(766340002)} disabled={reviewSaving}>
                    {reviewSaving ? "Saving…" : "Close"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}