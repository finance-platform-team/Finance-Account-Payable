import { Cfm_requestbudgetsService } from "../generated/services/Cfm_requestbudgetsService";
import type {
  BudgetGrid,
  BudgetGridRow,
  BudgetRegion,
  BudgetRequestRow,
  MonthKey,
} from "../types/apBudgetRequest";
import { MONTH_KEYS } from "../types/apBudgetRequest";

/** Region -> BU short-name list — mirrors getBUNamesForRegion() exactly. */
export function getBUNamesForRegion(region: BudgetRegion): string[] {
  const egy = ["ASH", "AMH", "SMH"];
  const ksa = [
    "AEH",
    "AES",
    "AHS",
    "AKW",
    "ALW",
    "ATS",
    "EGY_GEO",
    "ElHegaz",
    "FWZ",
    "Ghernada",
    "HJH",
    "Heliopolis",
    "KSA-HC",
    "KSA_GEO",
    "LCH",
    "MKR",
    "SNB",
  ];
  return region === "Egypt" ? [...egy] : [...ksa];
}

/** cfm_region choice mapping — Egypt=922190001, KSA=922190000. */
function regionToCode(region: BudgetRegion): number {
  return region === "Egypt" ? 922190001 : 922190000;
}

/**
 * Fetches raw cfm_requestbudget rows for a Year + Region — mirrors the
 * Dataverse query inside loadAPBudgetTable().
 */
export async function fetchBudgetRequests(
  year: string,
  region: BudgetRegion,
): Promise<BudgetRequestRow[]> {
  const result = await Cfm_requestbudgetsService.getAll({
    select: ["cfm_requestbudgetid", "cfm_amount", "cfm_bu", "cfm_month", "cfm_year"],
    filter: `cfm_year eq '${year}' and cfm_region eq ${regionToCode(region)}`,
    maxPageSize: 1000,
    top: 2000,
  });
  return (result.data ?? []) as unknown as BudgetRequestRow[];
}

/**
 * Assembles the BU × Month grid — mirrors the table-building logic in
 * loadAPBudgetTable(): every BU for the region gets a row (even with no
 * matching records, showing zeros), months missing data show 0/"-".
 */
export function buildBudgetGrid(
  rows: BudgetRequestRow[],
  buList: string[],
): BudgetGrid {
  const emptyAmounts = (): Record<MonthKey, number> =>
    MONTH_KEYS.reduce(
      (acc, m) => ({ ...acc, [m]: 0 }),
      {} as Record<MonthKey, number>,
    );

  const gridRows: BudgetGridRow[] = buList.map((bu) => ({
    bu,
    amounts: emptyAmounts(),
    total: 0,
  }));

  const rowByBU: Record<string, BudgetGridRow> = {};
  gridRows.forEach((r) => (rowByBU[r.bu] = r));

  rows.forEach((r) => {
    const bu = r.cfm_bu || "";
    const row = rowByBU[bu];
    if (!row || !r.cfm_month) return;
    const monthKey = MONTH_KEYS[r.cfm_month - 1];
    const amount = Number(r.cfm_amount || 0);
    row.amounts[monthKey] += amount;
    row.total += amount;
  });

  const totalsRow: BudgetGridRow = {
    bu: "TOTAL",
    amounts: emptyAmounts(),
    total: 0,
  };
  gridRows.forEach((r) => {
    MONTH_KEYS.forEach((m) => {
      totalsRow.amounts[m] += r.amounts[m];
    });
    totalsRow.total += r.total;
  });

  return { rows: gridRows, totalsRow };
}   