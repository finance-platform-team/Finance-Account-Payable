import type {
  CfmCashFlowCategory,
  CfmCashFlowNetMeasures,
  AggregatedMeasures,
  CFSLineItem,
} from "../types/cashflow";

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Returns "EGY" for AMH, SMH, ASH; otherwise returns "KSA"
export function getCountryFromBU(bu?: string | null): string {
  const value = (bu || "").trim().toLowerCase();
  if (["amh", "smh", "ash"].includes(value)) return "EGY";
  return "KSA";
}

// IF value is null/undefined/empty string, returns { whole: "0", decimal: "" }
export function formatNumberParts(value: number | null | undefined): {
  whole: string;
  decimal: string;
} {
  if (value === null || value === undefined || (value as unknown) === "") {
    return { whole: "0", decimal: "" };
  }
  const num = Number(value);
  if (isNaN(num)) return { whole: "0", decimal: "" };

  const formatted = new Intl.NumberFormat("en-US", {
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);

  const dotIdx = formatted.indexOf(".");
  if (dotIdx !== -1) {
    return {
      whole: formatted.substring(0, dotIdx),
      decimal: formatted.substring(dotIdx),
    };
  }
  return { whole: formatted, decimal: "" };
}

// Returns a string like "1,234.56" or "0" (no decimal if zero)
export function formatNumber(value: number | null | undefined): string {
  const { whole, decimal } = formatNumberParts(value);
  return whole + decimal;
}

export function parsePeriod(dateStr?: string | null): {
  year: number;
  month: number;
  monthLabel: string;
} {
  if (!dateStr) return { year: 2026, month: 4, monthLabel: "June" };
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      const parts = String(dateStr).split("-");
      if (parts.length >= 2) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        return { year: y, month: m, monthLabel: MONTH_NAMES[m] };
      }
      return { year: 2026, month: 5, monthLabel: "June" };
    }
    return {
      year: d.getFullYear(),
      month: d.getMonth(),
      monthLabel: MONTH_NAMES[d.getMonth()],
    };
  } catch {
    return { year: 2026, month: 5, monthLabel: "June" };
  }
}

// Returns a string like "2026-06-01" (first day of month)
export function enrichTransactions(
  rows: CfmCashFlowCategory[]
): CfmCashFlowCategory[] {
  return rows.map((r) => {
    const parsed = parsePeriod(r.cfm_date || "2026-06-01");
    return {
      ...r,
      _parsedYear: parsed.year,
      _parsedMonth: parsed.month,
      _parsedMonthLabel: parsed.monthLabel,
      _country: getCountryFromBU(r.cfm_name),
    };
  });
}

export function enrichMeasures(
  rows: CfmCashFlowNetMeasures[]
): CfmCashFlowNetMeasures[] {
  return rows.map((r) => {
    const parsed = parsePeriod(r.cfm_month || "2026-06-01");
    return {
      ...r,
      _parsedYear: parsed.year,
      _parsedMonth: parsed.month,
      _parsedMonthLabel: parsed.monthLabel,
      _country: getCountryFromBU(r.cfm_name),
    };
  });
}

// Aggregates a list of CfmCashFlowNetMeasures into a single AggregatedMeasures object
export function aggregateMeasures(
  measuresList: CfmCashFlowNetMeasures[]
): AggregatedMeasures {
  const agg: AggregatedMeasures = {
    beginningBalance: 0,
    endingBalance: 0,
    netOperating: 0,
    netInvesting: 0,
    netFinancing: 0,
  };
  if (!measuresList || measuresList.length === 0) return agg;
  measuresList.forEach((m) => {
    agg.beginningBalance += Number(m.cfm_beginningbalance || 0);
    agg.endingBalance += Number(m.cfm_endingbalancecf || 0);
    agg.netOperating +=
      Number(m.cfm_netoperationin || 0) - Number(m.cfm_netoperationout || 0);
    agg.netInvesting += Number(m.cfm_netinvestingactivities || 0);
    agg.netFinancing += Number(m.cfm_netfinancingactivities || 0);
  });
  return agg;
}

// Returns a list of CFSLineItem objects for a given activity and direction (Cash In / Cash Out)
export function getItemsForActivity(
  transactions: CfmCashFlowCategory[],
  activityName: string,
  direction: string
): CFSLineItem[] {
  const categoryMap: Record<string, number> = {};
  transactions.forEach((t) => {
    const tAct = (t.cfm_cashflowactivity || "").trim().toLowerCase();
    const tDir = (t.cfm_cashdirection || "").trim().toLowerCase();

    if (
      tAct === activityName.toLowerCase() &&
      tDir === direction.toLowerCase()
    ) {
      const cat = t.cfm_cash_flow_category || "Uncategorized";
      categoryMap[cat] = (categoryMap[cat] || 0) + Number(t.cfm_amount || 0);
    }
  });

  return Object.keys(categoryMap)
    .sort()
    .map((cat) => ({ category: cat, amount: categoryMap[cat] }));
}

// Some categories are duplicated data: a bare "Visa" row and split
// "Visa - Arab" / "Visa - NBE" rows that already sum up to exactly the same
// amount as "Visa". Summing every row for Total In/Out would double-count
// that money. Returns the set of bare parent category names (no " - " in
// the name) that should be EXCLUDED from the total whenever at least one
// "Parent - Child" sibling exists for it — mirrors
// getBareParentCategoriesToExcludeFromTotal() in CFM_APNew.html.
export function getBareParentCategoriesToExcludeFromTotal(
  items: CFSLineItem[]
): Record<string, boolean> {
  const childPrefixes: Record<string, boolean> = {};
  items.forEach((item) => {
    const m = item.category.match(/^(.+?)\s*-\s*(.+)$/);
    if (m) childPrefixes[m[1].trim()] = true;
  });
  const exclude: Record<string, boolean> = {};
  items.forEach((item) => {
    const m = item.category.match(/^(.+?)\s*-\s*(.+)$/);
    if (!m && childPrefixes[item.category.trim()]) {
      exclude[item.category] = true;
    }
  });
  return exclude;
}

/** Operating/Investing/Financing nets from live category transactions. */
export interface LiveActivityNets {
  operating: number;
  investing: number;
  financing: number;
}

// Computes Net (Total In - Total Out) for each of the three activities
// directly from the live cfm_cashflowcategory transactions — the same
// source that drives the Money In/Out breakdown tables — instead of the
// separate cfm_cashflownetmeasures aggregate fields, which are maintained
// independently in Dataverse and aren't guaranteed to match the
// transaction-level totals. Mirrors computeLiveActivityNets() in
// CFM_APNew.html.
export function computeLiveActivityNets(
  transactions: CfmCashFlowCategory[]
): LiveActivityNets {
  const result: LiveActivityNets = { operating: 0, investing: 0, financing: 0 };
  (["Operating", "Investing", "Financing"] as const).forEach((act) => {
    const key = act.toLowerCase() as keyof LiveActivityNets;
    const inItems = getItemsForActivity(transactions, `${act} Activities`, "Cash In");
    const outItems = getItemsForActivity(transactions, `${act} Activities`, "Cash Out");
    const excludeIn = getBareParentCategoriesToExcludeFromTotal(inItems);
    const excludeOut = getBareParentCategoriesToExcludeFromTotal(outItems);
    const inSum = inItems.reduce(
      (acc, i) => (excludeIn[i.category] ? acc : acc + i.amount),
      0
    );
    const outSum = outItems.reduce(
      (acc, i) => (excludeOut[i.category] ? acc : acc + i.amount),
      0
    );
    result[key] = inSum - outSum;
  });
  return result;
}