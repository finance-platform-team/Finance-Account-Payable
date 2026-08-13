// src/lib/treasuryBudgetService.ts

/* ════════════════════════════════════════
   TREASURY BUDGET — Service
   Reuses cfm_requestbudget + apBudgetRequestService.ts's fetch/BU-list
   helpers (no duplicated table-reading logic). Adds what the AP-side
   read-only panel doesn't need: per-cell record guids (to know
   create vs. update) and the actual save operation.
   Source of truth: CFM_APNew.html
     - fetchBudgetRequests() / generateBudgetTableHTML()  (line ~14249)
     - confirmSaveTreasuryBudget()                        (line ~12932)
════════════════════════════════════════ */

import { Cfm_requestbudgetsService } from "../generated/services/Cfm_requestbudgetsService";
import { fetchBudgetRequests, getBUNamesForRegion } from "./apBudgetRequestService";
import type { BudgetRegion, BudgetRequestRow, MonthKey } from "../types/apBudgetRequest";
import { MONTH_KEYS } from "../types/apBudgetRequest";

export { fetchBudgetRequests, getBUNamesForRegion };

/** cfm_region choice mapping — Egypt=922190001, KSA=922190000 (same as apBudgetRequestService's internal mapping). */
function regionToCode(region: BudgetRegion): number {
  return region === "Egypt" ? 922190001 : 922190000;
}

export interface TreasuryBudgetGridRow {
  bu: string;
  amounts: Record<MonthKey, number>;
  monthGuids: Record<MonthKey, string | null>;
  total: number;
}

export interface TreasuryBudgetGrid {
  rows: TreasuryBudgetGridRow[];
  totalsRow: { amounts: Record<MonthKey, number>; total: number };
}

/**
 * Assembles the BU × Month grid WITH per-cell record guids — mirrors
 * fetchBudgetRequests()'s rowsMap building in the original, extended
 * with the guid tracking generateBudgetTableHTML()/confirmSaveTreasuryBudget()
 * need to tell create vs. update apart.
 */
export function buildTreasuryBudgetGrid(
  rows: BudgetRequestRow[],
  buList: string[],
): TreasuryBudgetGrid {
  const emptyAmounts = (): Record<MonthKey, number> =>
    MONTH_KEYS.reduce((acc, m) => ({ ...acc, [m]: 0 }), {} as Record<MonthKey, number>);
  const emptyGuids = (): Record<MonthKey, string | null> =>
    MONTH_KEYS.reduce((acc, m) => ({ ...acc, [m]: null }), {} as Record<MonthKey, string | null>);

  const gridRows: TreasuryBudgetGridRow[] = buList.map((bu) => ({
    bu,
    amounts: emptyAmounts(),
    monthGuids: emptyGuids(),
    total: 0,
  }));
  const rowByBU: Record<string, TreasuryBudgetGridRow> = {};
  gridRows.forEach((r) => (rowByBU[r.bu] = r));

  rows.forEach((r) => {
    const bu = r.cfm_bu || "";
    const row = rowByBU[bu];
    if (!row || !r.cfm_month) return;
    const monthKey = MONTH_KEYS[r.cfm_month - 1];
    row.amounts[monthKey] = Number(r.cfm_amount || 0);
    row.monthGuids[monthKey] = r.cfm_requestbudgetid;
  });

  gridRows.forEach((r) => {
    r.total = MONTH_KEYS.reduce((s, m) => s + r.amounts[m], 0);
  });

  const totalsRow = { amounts: emptyAmounts(), total: 0 };
  gridRows.forEach((r) => {
    MONTH_KEYS.forEach((m) => (totalsRow.amounts[m] += r.amounts[m]));
    totalsRow.total += r.total;
  });

  return { rows: gridRows, totalsRow };
}

/** True if at least one cell across all BUs has real data — mirrors budgetRowsHaveAnyData(). */
export function treasuryBudgetGridHasAnyData(grid: TreasuryBudgetGrid): boolean {
  return grid.rows.some((r) => MONTH_KEYS.some((m) => r.monthGuids[m] !== null));
}

export interface BudgetCellEdit {
  bu: string;
  monthKey: MonthKey;
  /** Parsed numeric value, or null if the input was left blank (skipped, matching the original). */
  value: number | null;
  guid: string | null;
}

/**
 * Saves edited budget cells — mirrors confirmSaveTreasuryBudget(): creates
 * a record for cells with no guid, updates cfm_amount for cells that have
 * one. Blank cells (value === null) are skipped entirely, exactly like the
 * original's `if (entity && valStr !== "")` guard.
 */
export async function saveTreasuryBudgetCells(
  year: string,
  region: BudgetRegion,
  cells: BudgetCellEdit[],
): Promise<void> {
  const regionCode = regionToCode(region);
  const ops: Promise<unknown>[] = [];

  cells.forEach((cell) => {
    if (cell.value === null) return;
    const monthNum = MONTH_KEYS.indexOf(cell.monthKey) + 1;

    if (cell.guid) {
      ops.push(
        Cfm_requestbudgetsService.update(cell.guid, {
          cfm_amount: cell.value,
        } as never),
      );
    } else {
      ops.push(
        Cfm_requestbudgetsService.create({
          cfm_year: year,
          cfm_region: regionCode,
          cfm_bu: cell.bu,
          cfm_month: String(monthNum),
          cfm_amount: cell.value,
        } as never),
      );
    }
  });

  await Promise.all(ops);
}export interface EnsureBudgetResult {
  created: number;
  existing: number;
  errors: string[];
}

/**
 * Creates any missing cfm_requestbudget records for every BU × Month (1-12)
 * combination in the given Year/Region — mirrors ensureBudgetRequestRecordsExist().
 * Existing records are left untouched (never duplicated, never overwritten);
 * missing ones are created with only the identifying fields (cfm_amount stays
 * at its Dataverse default, i.e. 0/blank).
 */
export async function ensureBudgetRequestRecordsExist(
  year: string,
  region: BudgetRegion,
): Promise<EnsureBudgetResult> {
  const result: EnsureBudgetResult = { created: 0, existing: 0, errors: [] };
  if (!year || !region) return result;

  const buNames = getBUNamesForRegion(region);
  const regionCode = regionToCode(region);

  const existingRows = await fetchBudgetRequests(year, region);
  const existingKeys = new Set<string>();
  existingRows.forEach((r) => {
    if (r.cfm_bu != null && r.cfm_month != null) {
      existingKeys.add(`${r.cfm_bu}|${r.cfm_month}`);
    }
  });

  // Collect every missing (BU, month) combination first, then create them
  // in batches of 10 instead of one sequential await at a time — mirrors
  // ensureBudgetRequestRecordsExist()'s BATCH_SIZE in CFM_APNew.html,
  // which was added specifically because sequential creates were making
  // Request Budget slow for regions with many BUs (e.g. KSA's 17 BUs x 12
  // months = up to 204 creates).
  const missing: { bu: string; month: number }[] = [];
  for (const bu of buNames) {
    for (let m = 1; m <= 12; m++) {
      const key = `${bu}|${m}`;
      if (existingKeys.has(key)) {
        result.existing++;
      } else {
        missing.push({ bu, month: m });
      }
    }
  }

  const BATCH_SIZE = 10;
  for (let b = 0; b < missing.length; b += BATCH_SIZE) {
    const batch = missing.slice(b, b + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((item) =>
        Cfm_requestbudgetsService.create({
          cfm_year: year,
          cfm_region: regionCode,
          cfm_bu: item.bu,
          cfm_month: String(item.month),
        } as never)
          .then(() => ({ ok: true as const, item }))
          .catch((e: unknown) => ({ ok: false as const, item, error: e })),
      ),
    );
    batchResults.forEach((r) => {
      if (r.ok) {
        result.created++;
        existingKeys.add(`${r.item.bu}|${r.item.month}`);
      } else {
        console.error(`ensureBudgetRequestRecordsExist error for BU '${r.item.bu}' month ${r.item.month}:`, r.error);
        result.errors.push(`${r.item.bu}-${r.item.month}`);
      }
    });
  }

  return result;
}