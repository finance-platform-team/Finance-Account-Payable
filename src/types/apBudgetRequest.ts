// ─────────────────────────────────────────────────────────────────────────
// Budget Request panel — types
// Mirrors the "Budget Request" card at the top of the Payment Plan screen
// in CFM_APNew.html: a Year + Region filter driving a BU × Month grid of
// cfm_requestbudget amounts, with a "Request Budget" button that opens the
// Create Task Decision modal (sectionName="Request Budget").
// ─────────────────────────────────────────────────────────────────────────

export type BudgetRegion = "Egypt" | "KSA";

export const MONTH_KEYS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export type MonthKey = (typeof MONTH_KEYS)[number];

/** cfm_requestbudget's cfm_month choice values (1-12). */
export type BudgetMonthCode = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** A raw cfm_requestbudget record, as selected for this grid. */
export interface BudgetRequestRow {
  cfm_requestbudgetid: string;
  cfm_amount?: number;
  cfm_bu?: string;
  cfm_month?: BudgetMonthCode;
  cfm_year?: string;
}

/** One BU's row in the rendered grid — 12 month amounts + a total. */
export interface BudgetGridRow {
  bu: string;
  amounts: Record<MonthKey, number>;
  total: number;
}

/** The fully assembled grid — BU rows + a totals row across all BUs. */
export interface BudgetGrid {
  rows: BudgetGridRow[];
  totalsRow: BudgetGridRow;
}