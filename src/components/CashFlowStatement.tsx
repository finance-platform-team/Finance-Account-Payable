import { useEffect, useMemo, useState } from "react";
import { fetchCashFlowData } from "../lib/dataverseClient";

import {
  aggregateMeasures,
  getItemsForActivity,
  resolveCurrency,
  formatNumberParts,
  MONTH_NAMES,
} from "../lib/cashflowUtils";
import type {
  CfmCashFlowCategory,
  CfmCashFlowNetMeasures,
} from "../types/cashflow";
import { RefreshCw, ClipboardCheck, Search, ChevronUp, ChevronDown } from "lucide-react";import CreateDecisionModal from "./CreateDecisionModal";
import RevenueSummaryBar from "./RevenueSummaryBar";
import Loader from "./Loader";

// عنصر بسيط لعرض رقم مقسوم (صحيح + كسري بخط أصغر) زي الأصلي بالظبط
function Num({ value }: { value: number | null | undefined }) {
  const { whole, decimal } = formatNumberParts(value);
  return (
    <>
      {whole}
      {decimal && <span className="num-decimal">{decimal}</span>}
    </>
  );
}

interface ActivityDef {
  key: "operating" | "investing" | "financing";
  label: string;
  sub: string;
  activityName: string; // القيمة اللي بتتخزن في cfm_cashflowactivity
}

const ACTIVITIES: ActivityDef[] = [
  {
    key: "operating",
    label: "Operating Activities",
    sub: "Day-to-day core business cash movement",
    activityName: "Operating Activities",
  },
  {
    key: "investing",
    label: "Investing Activities",
    sub: "Purchase and sale of long-term assets",
    activityName: "Investing Activities",
  },
  {
    key: "financing",
    label: "Financing Activities",
    sub: "Debt, equity, and dividend transactions",
    activityName: "Financing Activities",
  },
];

export default function CashFlowStatement() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rawTransactions, setRawTransactions] = useState<CfmCashFlowCategory[]>([]);
  const [rawMeasures, setRawMeasures] = useState<CfmCashFlowNetMeasures[]>([]);

  const [selectedYear, setSelectedYear] = useState<string>("All");
  const [selectedMonth, setSelectedMonth] = useState<string>("All");
  const [selectedGroup, setSelectedGroup] = useState<string>("EGY");
  const [selectedBU, setSelectedBU] = useState<string>("All");
  const [searchTerm, setSearchTerm] = useState("");
const [decisionModalOpen, setDecisionModalOpen] = useState(false);
const [decisionSection, setDecisionSection] = useState("Cash Flow Statement");
const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  // ── تحميل كل البيانات مرة واحدة (زي allTransactions / allMeasures بالأصلي) ──
  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const { transactions, measures } = await fetchCashFlowData({
        year: "All",
        month: "All",
        group: "All",
        bu: "All",
      });
   console.log("Transactions fetched:", transactions.length, transactions[0]);
      console.log("Measures fetched:", measures.length, measures[0]);
      setRawTransactions(transactions);
      setRawMeasures(measures); 

      // تحديد السنة الافتراضية (الأحدث) زي initializeDynamicFilters
  const years = Array.from(
        new Set(
          [...transactions, ...measures]
            .map((r) => r._parsedYear)
            .filter((y): y is number => !!y)
        )
      ).sort((a, b) => b - a);
      if (years.length > 0) {
        const latestYear = years[0];
        setSelectedYear(String(latestYear));

        // نختار أحدث شهر متاح لنفس السنة تلقائيًا بدل "All Months"
        const monthsInLatestYear = Array.from(
          new Set(
            [...transactions, ...measures]
              .filter((r) => r._parsedYear === latestYear)
              .map((r) => r._parsedMonth)
              .filter((m): m is number => m !== undefined)
          )
        ).sort((a, b) => b - a);
        if (monthsInLatestYear.length > 0) {
          setSelectedMonth(String(monthsInLatestYear[0]));
        }
      }
    } catch (e) {
      console.error(e);
        setError( "Failed to load cash flow data. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
  }, []);

  // ── خيارات فلتر السنة ──
  const yearOptions = useMemo(() => {
    const set = new Set<number>();
    [...rawTransactions, ...rawMeasures].forEach((r) => {
      if (r._parsedYear) set.add(r._parsedYear);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [rawTransactions, rawMeasures]);

  // ── خيارات فلتر الشهر (حسب السنة المختارة) ──
  const monthOptions = useMemo(() => {
    const set = new Set<number>();
    const byYear = (r: { _parsedYear?: number }) =>
      selectedYear === "All" || String(r._parsedYear) === selectedYear;
    [...rawTransactions.filter(byYear), ...rawMeasures.filter(byYear)].forEach(
      (r) => {
        if (r._parsedMonth !== undefined) set.add(r._parsedMonth);
      }
    );
    return Array.from(set).sort((a, b) => a - b);
  }, [rawTransactions, rawMeasures, selectedYear]);

  // ── خيارات فلتر المجموعة (Egypt / KSA) ──
  const groupOptions = useMemo(() => {
    const set = new Set<string>();
    const byPeriod = (r: { _parsedYear?: number; _parsedMonth?: number }) => {
      if (selectedYear !== "All" && String(r._parsedYear) !== selectedYear)
        return false;
      if (selectedMonth !== "All" && String(r._parsedMonth) !== selectedMonth)
        return false;
      return true;
    };
    [...rawTransactions.filter(byPeriod), ...rawMeasures.filter(byPeriod)].forEach(
      (r) => {
        if (r._country) set.add(r._country);
      }
    );
    return Array.from(set).sort();
  }, [rawTransactions, rawMeasures, selectedYear, selectedMonth]);

  // ── فلترة البيانات فعليًا حسب كل الاختيارات ──
  const filteredTransactions = useMemo(() => {
    return rawTransactions.filter((r) => {
      if (selectedYear !== "All" && String(r._parsedYear) !== selectedYear)
        return false;
      if (selectedMonth !== "All" && String(r._parsedMonth) !== selectedMonth)
        return false;
      if (selectedBU !== "All") return r.cfm_name === selectedBU;
      if (selectedGroup !== "All") return r._country === selectedGroup;
      return true;
    });
  }, [rawTransactions, selectedYear, selectedMonth, selectedGroup, selectedBU]);

  const filteredMeasures = useMemo(() => {
    return rawMeasures.filter((r) => {
      if (selectedYear !== "All" && String(r._parsedYear) !== selectedYear)
        return false;
      if (selectedMonth !== "All" && String(r._parsedMonth) !== selectedMonth)
        return false;
      if (selectedBU !== "All") return r.cfm_name === selectedBU;
      if (selectedGroup !== "All") return r._country === selectedGroup;
      return true;
    });
  }, [rawMeasures, selectedYear, selectedMonth, selectedGroup, selectedBU]);

  // ── الـ BUs المتاحة للفلتر الحالي ──
  const availableBUs = useMemo(() => {
    const set = new Set<string>();
    const byPeriodAndGroup = (r: {
      _parsedYear?: number;
      _parsedMonth?: number;
      _country?: string;
    }) => {
      if (selectedYear !== "All" && String(r._parsedYear) !== selectedYear)
        return false;
      if (selectedMonth !== "All" && String(r._parsedMonth) !== selectedMonth)
        return false;
      if (selectedGroup !== "All" && r._country !== selectedGroup) return false;
      return true;
    };
    [
      ...rawMeasures.filter(byPeriodAndGroup),
      ...rawTransactions.filter(byPeriodAndGroup),
    ].forEach((r) => {
      if (r.cfm_name) set.add(r.cfm_name);
    });
    return Array.from(set).sort();
  }, [rawTransactions, rawMeasures, selectedYear, selectedMonth, selectedGroup]);

  // ── تجميع المقاييس (aggregateMeasures) ──
  const agg = useMemo(
    () => aggregateMeasures(filteredMeasures),
    [filteredMeasures]
  );

  const netChange = agg.netOperating + agg.netInvesting + agg.netFinancing;
  const currency = resolveCurrency(selectedGroup);

  const freeCashFlow = agg.beginningBalance + agg.netOperating + agg.netInvesting;

  // ── دالة البحث: تفلتر السطور اللي اسمها مش متطابق مع نص البحث ──
  const matchesSearch = (name: string) =>
    !searchTerm || name.toLowerCase().includes(searchTerm.toLowerCase());

function handleYearChange(v: string) {
    setSelectedYear(v);
  }
  function handleMonthChange(v: string) {
    setSelectedMonth(v);
  }
  function handleGroupChange(v: string) {
    setSelectedGroup(v);
  } 

  if (loading) {
    return (
      <div className="cfs-root">
        <Loader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="cfs-root">
        <div className="cfs-error">{error}</div>
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <button className="btn btn-outline" onClick={loadAll}>
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cfs-root">
      {/* ── العنوان ── */}
      <div className="cfs-header">
        <div>
          <div className="cfs-eyebrow">cfm · Statement</div>
          <div className="cfs-title">Cash Flow Statement</div>
        </div>
   <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-outline" onClick={loadAll}>
            <RefreshCw size={13} /> Refresh Data
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setDecisionSection("Cash Flow Statement");
              setDecisionModalOpen(true);
            }}
          >
            <ClipboardCheck size={13} /> Create Decision
          </button>  
        </div>
      </div>

      {/* ── الفلاتر ── */}
      <div className="filters-bar">
        <div className="filters-row">
          <div className="filter-group">
            <span className="filter-lbl">Year</span>
            <div className="select-wrap">
              <select
                value={selectedYear}
                onChange={(e) => handleYearChange(e.target.value)}
              >
                <option value="All">All Years</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <span className="sel-arrow">▾</span>
            </div>
          </div>

          <div className="filter-group">
            <span className="filter-lbl">Month</span>
            <div className="select-wrap">
              <select
                value={selectedMonth}
                onChange={(e) => handleMonthChange(e.target.value)}
              >
                <option value="All">All Months</option>
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {(MONTH_NAMES[m] || "").substring(0, 3)}
                  </option>
                ))}
              </select>
              <span className="sel-arrow">▾</span>
            </div>
          </div>

          <div className="filter-group">
            <span className="filter-lbl">Group</span>
            <div className="select-wrap">
              <select
                value={selectedGroup}
                onChange={(e) => handleGroupChange(e.target.value)}
              >
                <option value="All">All</option>
                {groupOptions.map((g) => (
                  <option key={g} value={g}>
                    {g === "EGY" ? "Egypt" : g}
                  </option>
                ))}
              </select>
              <span className="sel-arrow">▾</span>
            </div>
          </div>

         <div className="search-box">
            <Search size={13} style={{ color: "var(--dim)" }} />
            <input
              type="text"
              placeholder="Search Cash Flow…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="bu-chips">
        <button
            className={`bu-chip ${selectedBU === "All" ? "active" : ""}`}
            onClick={() => setSelectedBU("All")}
          >
            {selectedGroup === "All" ? "All" : selectedGroup === "EGY" ? "All Egypt" : `All ${selectedGroup}`}
          </button>
          {availableBUs.map((bu) => (
            <button
              key={bu}
              className={`bu-chip ${selectedBU === bu ? "active" : ""}`}
              onClick={() => setSelectedBU(bu)}
            >
              {bu}
            </button>
          ))}
        </div>
      </div>

{/* ── ملخص الإيرادات (لو فيه بيانات) ── */}
      <RevenueSummaryBar
        year={selectedYear}
        month={selectedMonth}
        bu={selectedBU}
        availableBUs={availableBUs}
        currency={currency}
      />

      {/* ── ملخص الأرصدة ── */}
      <div className="summary-bar">        <div className="sum-cell">
          <div className="sum-label">Opening Balance</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span className="sum-currency">{currency}</span>
            <span className="sum-val">
              <Num value={agg.beginningBalance} />
            </span>
          </div>
          <div className="sum-sub">carried from last period</div>
        </div>

        <div className="sum-cell">
          <div className="sum-label">Net Change This Period</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span className="sum-currency">
              {netChange >= 0 ? "+ " : "- "}
              {currency}
            </span>
            <span className={`sum-val ${netChange >= 0 ? "positive" : ""}`}>
              <Num value={Math.abs(netChange)} />
            </span>
          </div>
          <div className="sum-sub">operating + investing + financing</div>
        </div>

        <div className="sum-cell ending">
          <div className="sum-label">Ending Balance</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span className="sum-currency">{currency}</span>
            <span className="sum-val">
              <Num value={agg.endingBalance} />
            </span>
          </div>
          <div className="sum-sub">cash in the bank, end of period</div>
        </div>
      </div>

      {/* ── شريط الأنشطة ── */}
      <div className="act-strip">
        {ACTIVITIES.map((act) => {
          const netVal =
            act.key === "operating"
              ? agg.netOperating
              : act.key === "investing"
              ? agg.netInvesting
              : agg.netFinancing;
          const dotColor =
            netVal >= 0 ? "var(--green-dark)" : "var(--danger)";
          return (
            <button
              key={act.key}
              className="act-cell"
              onClick={() =>
                document
                  .getElementById(`sec-${act.key}`)
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              <div className="act-dot" style={{ background: dotColor }} />
              <span className="act-cell-name">{act.key[0].toUpperCase() + act.key.slice(1)}</span>
              <span className={`act-cell-val ${netVal >= 0 ? "pos" : "neg"}`}>
                {netVal >= 0 ? "+ " : "- "}
                {currency} <Num value={Math.abs(netVal)} />
              </span>
            </button>
          );
        })}
      </div>

      {/* ── أقسام الأنشطة الثلاثة ── */}
      {ACTIVITIES.map((act) => {
        const netVal =
          act.key === "operating"
            ? agg.netOperating
            : act.key === "investing"
            ? agg.netInvesting
            : agg.netFinancing;

        const inItems = getItemsForActivity(
          filteredTransactions,
          act.activityName,
          "Cash In"
        ).filter((i) => matchesSearch(i.category));
        const outItems = getItemsForActivity(
          filteredTransactions,
          act.activityName,
          "Cash Out"
        ).filter((i) => matchesSearch(i.category));

        const totalIn = inItems.reduce((a, i) => a + i.amount, 0);
        const totalOut = outItems.reduce((a, i) => a + i.amount, 0);

        return (
          <div key={act.key}>
            {act.key === "financing" && (
              <div className="fcf-card">
                <div>
                  <div className="fcf-title">Free cash flow</div>
                  <div className="fcf-sub">
                    Beginning balance + net cash from operating + net cash
                    from investing
                  </div>
                </div>
                <div
                  className="fcf-val"
                  style={{
                    color:
                      freeCashFlow >= 0
                        ? "var(--green-dark)"
                        : "var(--danger)",
                  }}
                >
                  {freeCashFlow >= 0 ? "+" : "-"}
                  {currency} <Num value={Math.abs(freeCashFlow)} />
                </div>
              </div>
            )}

            <div className="section-block" id={`sec-${act.key}`}>
              <div className="sec-hdr">
                <div className="sec-hdr-left">
                  <div className="sec-hdr-title">{act.label}</div>
                  <div className="sec-hdr-sub">{act.sub}</div>
                </div>
              
              <div className="sec-hdr-right">
                  <div className={`net-pill ${netVal >= 0 ? "pos" : "neg"}`}>
                    <span className="net-pill-label">Net</span>
                    {netVal >= 0 ? "+ " : "- "}
                    {currency} <Num value={Math.abs(netVal)} />
                  </div>
             <button
                    className="decision-btn"
                    onClick={() => {
                      setDecisionSection(act.label);
                      setDecisionModalOpen(true);
                    }}
                  >
                    <ClipboardCheck size={12} /> Task Decision
                  </button>
                  <button
                    className="sec-collapse-btn"
                    onClick={() =>
                      setCollapsedSections((prev) => ({
                        ...prev,
                        [act.key]: !prev[act.key],
                      }))
                    }
                    aria-label="Toggle section"
                  >
                    {collapsedSections[act.key] ? (
                      <ChevronDown size={13} />
                    ) : (
                      <ChevronUp size={13} />
                    )}
                  </button>
                </div>
              </div>

{!collapsedSections[act.key] && (
              <div className="money-split">                <div className="money-col in">
            <div className="money-col-hdr">
                    <div className="money-dir-icon">
                      <ChevronUp size={13} />
                    </div>
                    <span className="money-dir-label">Money In</span>
                  </div>
                  {inItems.length === 0 ? (
                    <p className="no-inflows">No cash inflows this period</p>
                  ) : (
                    inItems.map((item) => (
                      <div className="line-item" key={item.category}>
                        <span className="line-name">{item.category}</span>
                        <span className="line-val in">
                          + <Num value={item.amount} />
                        </span>
                      </div>
                    ))
                  )}
                  <div className="total-row">
                    <span className="total-label">Total In</span>
                    <span className="total-val">
                      + <Num value={totalIn} />
                    </span>
                  </div>
                </div>

                <div className="money-col out">
                <div className="money-col-hdr">
                    <div className="money-dir-icon">
                      <i className="fa-solid fa-chevron-down icon-sm"></i>
                    </div>
                    <span className="money-dir-label">Money Out</span>
                  </div>
                  {outItems.length === 0 ? (
                    <p className="no-inflows">No cash outflows this period</p>
                  ) : (
                    outItems.map((item) => (
                      <div className="line-item" key={item.category}>
                        <span className="line-name">{item.category}</span>
                        <span className="line-val out">
                          - <Num value={item.amount} />
                        </span>
                      </div>
                    ))
                  )}
                  <div className="total-row">
                    <span className="total-label">Total Out</span>
                    <span className="total-val">
                      - <Num value={totalOut} />
                    </span>
                  </div>
                </div>
 </div>
              )}
            </div>
          </div>
        );
      })}

      <CreateDecisionModal
        open={decisionModalOpen}
        sectionName={decisionSection}
        onClose={() => setDecisionModalOpen(false)}
        onSuccess={() => {
          // ممكن نضيف Toast نجاح هنا لاحقًا
        }}
      />
    </div>
  );
}