import { useCallback, useEffect, useState, type JSX } from "react";
import {
  applyApAgingLocalFilters,
  buildStagedApVendor,
  fetchApAgingRows,
  fetchApBUChipsForGroup,
  getApAgingVendorKey,
  sendStagedVendorsToPlan,
} from "../lib/apAgingService";
import type {
  ApAgingBracket,
  ApAgingGroup,
  ApAgingRow,
  ApAgingTier,
  StagedApVendorMap,
} from "../types/apAging";
import { AP_PER_PAGE } from "../types/apAging";
import CreateDecisionModal from "./CreateDecisionModal";
import { useToast } from "../lib/ToastContext";
import "../styles/CashFlowStatement.css";

// Formats a number the same way the legacy fmt() helper does inside
// renderDynamicAPAgingTable(): "-" for falsy/zero, else 2-decimal grouped.
function fmt(v: number | undefined): string {
  return v
    ? Number(v).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "-";
}

export default function ApAgingTab() {
  const { showToast } = useToast();
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [group, setGroup] = useState<ApAgingGroup>("EGY");
  const [vendorSearch, setVendorSearch] = useState("");
  const [tier] = useState<ApAgingTier>("All"); // no functional UI yet — cfm_finance_ap never carries a tier field (see chat history)
  const [bracket, setBracket] = useState<ApAgingBracket>("All");
  const [selectedBU, setSelectedBU] = useState<string>("All");
  const [buChips, setBuChips] = useState<string[]>([]);
  const [buChipsLoading, setBuChipsLoading] = useState(false);
  const buChipCacheRef = useState<Record<string, string[]>>({})[0];

  // Loads the BU chip list for the current Group — fixed list for EGY,
  // dynamic (cached per-group) for KSA — mirrors apFilter()'s apBuCache.
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedBU("All");
    const cached = buChipCacheRef[group];
    if (cached) {
      setBuChips(cached);
      return;
    }
    setBuChipsLoading(true);
    fetchApBUChipsForGroup(group)
      .then((chips) => {
        if (cancelled) return;
        buChipCacheRef[group] = chips;
        setBuChips(chips);
      })
      .catch((e) => console.error("Error loading BU chips:", e))
      .finally(() => {
        if (!cancelled) setBuChipsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group]);

  const [rows, setRows] = useState<ApAgingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [staged, setStaged] = useState<StagedApVendorMap>({});
  const [decisionOpen, setDecisionOpen] = useState(false);

  // Server-side fetch — mirrors fetchAPAgingData(), triggered whenever
  // Group or the vendor search box changes (legacy has no debounce either).
  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApAgingRows(group, vendorSearch, selectedBU);
      setRows(data);
      setPage(1);
    } catch (e) {
      console.error("Error fetching AP Aging data:", e);
    } finally {
      setLoading(false);
    }
  }, [group, vendorSearch, selectedBU]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRows();
  }, [loadRows]);

  // Client-side Tier/Bracket filter — mirrors apFilterLocal().
  const hasLocalFilter = tier !== "All" || bracket !== "All";
  const filteredRows = hasLocalFilter
    ? applyApAgingLocalFilters(rows, tier, bracket)
    : rows;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [bracket, tier]);

  const totalCount = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / AP_PER_PAGE));
  const start = (page - 1) * AP_PER_PAGE;
  const pageRows = filteredRows.slice(start, start + AP_PER_PAGE);

  // ── Row / select-all staging — mirrors toggleAPAgingRow / toggleAllAPAgingRows ──
  function toggleRow(row: ApAgingRow, checked: boolean) {
    const vKey = getApAgingVendorKey(row);
    setStaged((prev) => {
      const next = { ...prev };
      if (checked) {
        next[vKey] = buildStagedApVendor(row);
      } else {
        delete next[vKey];
      }
      return next;
    });
  }

  function toggleAllRows(checked: boolean) {
    setStaged((prev) => {
      const next = { ...prev };
      filteredRows.forEach((row) => {
        const vKey = getApAgingVendorKey(row);
        if (checked) {
          next[vKey] = buildStagedApVendor(row);
        } else {
          delete next[vKey];
        }
      });
      return next;
    });
  }
// ── Send to Plan — mirrors sendToPlan()/proceedSendToPlan() ──
  function openSendToPlanConfirm() {
    if (Object.keys(staged).length === 0) return;
    setSendConfirmOpen(true);
  }

  async function handleConfirmSendToPlan() {
    const planData = Object.values(staged);
    setSending(true);
    try {
      const { created, updated, errors } = await sendStagedVendorsToPlan(planData);

      if (errors.length > 0) {
        showToast(
          "Partial Success",
          `${created + updated} lines processed. Failed: ${errors.join(", ")}`,
          "alert",
        );
      } else {
        let succMsg = "";
        if (created > 0 && updated > 0) {
          succMsg = `${created} created, ${updated} updated successfully.`;
        } else if (created > 0) {
          succMsg = `${created} vendor(s) added as new AP Draft.`;
        } else {
          succMsg = `${updated} vendor(s) updated successfully.`;
        }
        showToast("Plan Updated", succMsg, "success");
      }

      setStaged({});
      setSendConfirmOpen(false);
    } catch (e) {
      console.error("Error sending staged vendors to Payment Plan:", e);
      showToast("Error", "Failed to send vendors to the Payment Plan.", "alert");
    } finally {
      setSending(false);
    }
  }
  const allOnPageChecked =
    pageRows.length > 0 &&
    pageRows.every((r) => !!staged[getApAgingVendorKey(r)]);

  // ── Pagination — mirrors renderAPPagination()/apPaginate() ──
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

  const showingEnd = Math.min(start + AP_PER_PAGE, totalCount);

  return (
    <div className="cfs-root">
    <div id="ap-supervision" className="ap-screen active">
      {/* ── PAGE HEADER ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
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
            AP Planning · Supervision
          </div>
          <div
            style={{
              font: "800 26px var(--sans)",
              color: "var(--brand-black)",
              letterSpacing: -0.4,
            }}
          >
            AP Supervision
          </div>
          <div
            style={{
              font: "400 12px var(--body)",
              color: "var(--muted)",
              marginTop: 3,
            }}
          >
            AP Aging from DotCare · Vendor payment verification · Batch
            approval
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-outline" onClick={loadRows}>
            Refresh Data
          </button>
      <button
            className="btn btn-primary"
            disabled={Object.keys(staged).length === 0}
            style={{ padding: "8px 18px" }}
            onClick={openSendToPlanConfirm}
          >
            Send to Plan ({Object.keys(staged).length})
          </button>
          <button
            className="btn btn-primary"
            style={{ padding: "8px 18px" }}
            onClick={() => setDecisionOpen(true)}
          >
            Create Decision
          </button>
        </div>
      </div>

      {/* ── FILTERS BAR ── */}
      <div className="filters-bar" style={{ marginBottom: 16 }}>
        <div className="filters-top">
          <div className="filters-label">Filters</div>
        </div>
        <div className="filters-row">
          <div className="filter-group">
            <span className="filter-lbl">Group</span>
            <div className="select-wrap">
              <select
                value={group}
                onChange={(e) => setGroup(e.target.value as ApAgingGroup)}
              >
                <option value="EGY">Egypt</option>
                <option value="KSA">KSA</option>
              </select>
              <span className="sel-arrow">▾</span>
            </div>
          </div>

          <div className="filter-group">
            <span className="filter-lbl">Aging Bracket</span>
            <div className="select-wrap">
              <select
                value={bracket}
                onChange={(e) => setBracket(e.target.value as ApAgingBracket)}
              >
                <option value="All">All Brackets</option>
                <option value="Current">Current (Not Due)</option>
                <option value="1-30">1–30 Days</option>
                <option value="31-60">31–60 Days</option>
                <option value="61-90">61–90 Days</option>
                <option value="90+">90+ Days</option>
              </select>
              <span className="sel-arrow">▾</span>
            </div>
          </div>

          <div className="search-box">
            <input
              type="text"
              value={vendorSearch}
              onChange={(e) => setVendorSearch(e.target.value)}
              placeholder="Search by Vendor Name or Sub Ledger Code…"
            />
          </div>
        </div>

        <div className="bu-chips">
          <button
            className={`bu-chip${selectedBU === "All" ? " active" : ""}`}
            onClick={() => setSelectedBU("All")}
          >
            {group === "EGY" ? "All Egypt" : "All KSA"}
          </button>
          {buChipsLoading
            ? [1, 2].map((i) => (
                <button
                  key={i}
                  className="bu-chip"
                  style={{
                    color: "transparent",
                    background: "var(--neutral-200)",
                    borderColor: "transparent",
                    pointerEvents: "none",
                  }}
                >
                  Loading
                </button>
              ))
            : buChips.map((bu) => (
                <button
                  key={bu}
                  className={`bu-chip${selectedBU === bu ? " active" : ""}`}
                  onClick={() => setSelectedBU(bu)}
                >
                  {bu}
                </button>
              ))}
        </div>
      </div>

      {/* ── AP AGING TABLE ── */}
      <div className="ap-aging-section-label">
        AP Aging from DotCare — by Vendor (EGP)
      </div>

      <div className="ap-aging-panel">
        <div className="ap-aging-scroll">
          <table className="ap-aging-table">
            <thead className="ap-aging-thead">
              <tr className="ap-aging-thead-row">
                <th className="ap-aging-th ap-aging-th--check">
                  <input
                    type="checkbox"
                    className="ap-aging-checkbox"
                    checked={allOnPageChecked}
                    onChange={(e) => toggleAllRows(e.target.checked)}
                    title="Select all filtered vendors"
                  />
                </th>
                <th className="ap-aging-th ap-aging-th--vendor">
                  Vendor Name
                </th>
                <th className="ap-aging-th ap-aging-th--right">BU</th>
                <th className="ap-aging-th ap-aging-th--right">
                  Opening Balance
                </th>
                <th className="ap-aging-th ap-aging-th--right">
                  Original Payable Voucher
                </th>
                <th className="ap-aging-th ap-aging-th--right">
                  Total Deductions
                </th>
                <th className="ap-aging-th ap-aging-th--right">
                  Total Payment
                </th>
                <th className="ap-aging-th ap-aging-th--right">
                  Not Allocated
                </th>
                <th className="ap-aging-th ap-aging-th--right">
                  Due Amount
                </th>
                <th className="ap-aging-th ap-aging-th--amber">Not Due</th>
                <th className="ap-aging-th">1–30</th>
                <th className="ap-aging-th">31–60</th>
                <th className="ap-aging-th ap-aging-th--amber">61–90</th>
                <th className="ap-aging-th ap-aging-th--amber">91–120</th>
                <th className="ap-aging-th ap-aging-th--danger">121–150</th>
                <th className="ap-aging-th ap-aging-th--danger">&gt;150</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={16} className="ap-aging-empty">
                    Loading…
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={16} className="ap-aging-empty">
                    {rows.length === 0
                      ? "No data available"
                      : "No data matching criteria"}
                  </td>
                </tr>
              ) : (
                pageRows.map((r) => {
                  const vKey = getApAgingVendorKey(r);
                  const isChecked = !!staged[vKey];
                  return (
                    <tr
                      key={vKey}
                      className={`ap-aging-row${isChecked ? " is-checked" : ""}`}
                    >
                      <td className="ap-aging-td ap-aging-td--check">
                        <input
                          type="checkbox"
                          className="ap-aging-checkbox"
                          checked={isChecked}
                          onChange={(e) => toggleRow(r, e.target.checked)}
                        />
                      </td>
                      <td className="ap-aging-td ap-aging-td--sans ap-aging-td--vendor">
                        {r.cfm_vendorenglishname || "-"}
                      </td>
                      <td className="ap-aging-td ap-aging-td--sans ap-aging-td--center ap-aging-td--muted">
                        {r.cfm_bushortname || "-"}
                      </td>
                      <td className="ap-aging-td ap-aging-td--right">
                        {fmt(r.cfm_openingbalance)}
                      </td>
                      <td className="ap-aging-td ap-aging-td--right">
                        {fmt(r.cfm_originalpayablevoucheramount)}
                      </td>
                      <td className="ap-aging-td ap-aging-td--right ap-aging-td--danger">
                        {fmt(r.cfm_totaldeductions)}
                      </td>
                      <td className="ap-aging-td ap-aging-td--right ap-aging-td--green">
                        {fmt(r.cfm_totalpayment)}
                      </td>
                      <td className="ap-aging-td ap-aging-td--right">
                        {fmt(r.cfm_notallocatedpayment)}
                      </td>
                      <td className="ap-aging-td--due">
                        {fmt(r.cfm_dueamount)}
                      </td>
                      <td className="ap-aging-td ap-aging-td--amber">
                        {fmt(r.cfm_notdue)}
                      </td>
                      <td className="ap-aging-td ap-aging-td--text-body">
                        {fmt(r.cfm_jan)}
                      </td>
                      <td className="ap-aging-td ap-aging-td--text-body">
                        {fmt(r.cfm_60)}
                      </td>
                      <td className="ap-aging-td ap-aging-td--amber">
                        {fmt(r.cfm_90)}
                      </td>
                      <td className="ap-aging-td ap-aging-td--amber">
                        {fmt(r.cfm_120)}
                      </td>
                      <td className="ap-aging-td ap-aging-td--danger">
                        {fmt(r.cfm_150)}
                      </td>
                      <td className="ap-aging-td ap-aging-td--danger">
                        {fmt(r.cfm_above150)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination — "Showing X–Y of Z vendors" ── */}
        {rows.length > 0 && (
          <div className="ap-aging-pagination">
            <span style={{ font: "400 12px var(--body)", color: "var(--muted)" }}>
              Showing{" "}
              <strong style={{ color: "var(--brand-black)" }}>
                {start + 1}–{showingEnd}
              </strong>{" "}
              of{" "}
              <strong style={{ color: "var(--brand-black)" }}>
                {totalCount}
              </strong>{" "}
              vendors
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                className="ap-page-btn"
                disabled={page === 1}
                onClick={() => goToPage(page - 1)}
              >
                ‹
              </button>
              {renderPageButtons()}
              <button
                className="ap-page-btn"
                disabled={page === totalPages}
                onClick={() => goToPage(page + 1)}
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>

<CreateDecisionModal
        open={decisionOpen}
        sectionName="AP Planning"
        onClose={() => setDecisionOpen(false)}
        onSuccess={() => setDecisionOpen(false)}
      />

      {/* ── Send to Plan confirm modal — mirrors showConfirmModal() in sendToPlan() ── */}
      {sendConfirmOpen && (
        <div className="modal-overlay active" onClick={() => !sending && setSendConfirmOpen(false)}>
          <div className="modal-box" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr">
              <div className="modal-title">Send to Plan</div>
              <button className="modal-close" onClick={() => setSendConfirmOpen(false)} disabled={sending}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div style={{ font: "500 12.5px var(--body)", color: "var(--text-body)", lineHeight: 1.8 }}>
                {Object.keys(staged).length} vendor(s) totalling EGP{" "}
                {Object.values(staged)
                  .reduce((s, v) => s + v.initialAmount, 0)
                  .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                will be added or updated in the Payment Plan as AP Draft.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setSendConfirmOpen(false)} disabled={sending}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleConfirmSendToPlan} disabled={sending}>
                {sending ? "Processing…" : "Proceed"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}