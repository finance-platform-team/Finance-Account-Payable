// src/lib/treasuryService.ts

/* ════════════════════════════════════════
   TREASURY WORKFLOW — Service
   Reuses cfm_paymentplan (no new Dataverse table). Source of truth:
     - loadTreasuryPPLinesFromDataverse()  (line ~8671)
     - openTreasuryPPLModal()              (line ~12592)
     - saveTreasuryPPLModal()              (line ~13934)
════════════════════════════════════════ */

import { Cfm_paymentplansService } from "../generated/services/Cfm_paymentplansService";
import {
  fetchAgingDuesByVendor,
  fetchInsuranceCompanyBUs,
  mapPaymentPlanRecord,
} from "./apPaymentPlanService";
import type { PPLine } from "../types/apPaymentPlan";

// Same field list as PP_LINE_SELECT in apPaymentPlanService.ts — kept in
// sync manually since that constant isn't exported.
const TREASURY_PP_SELECT: string[] = [
  "cfm_paymentplanid",
  "cfm_plancode",
  "cfm_amount",
  "cfm_duedate",
  "cfm_paymentplanstatus",
  "cfm_apnotes",
  "cfm_treasurystatus",
  "cfm_treasurycomment",
  "cfm_companyname",
  "modifiedon",
  "_cfm_companycode_value",
  "_cfm_scpriority_value",
];

/**
 * Loads Payment Plan lines for the Treasury Workflow screen — server-side
 * filtered to cfm_paymentplanstatus eq 5 (Pending Treasury), mirroring
 * loadTreasuryPPLinesFromDataverse(). No client-side status filtering is
 * needed since the server already restricts the set.
 */
export async function fetchTreasuryPaymentPlanLines(): Promise<PPLine[]> {
  const [agingDuesByVendor, insuranceCompanyBUs, ppResult] = await Promise.all([
    fetchAgingDuesByVendor(),
    fetchInsuranceCompanyBUs(),
    Cfm_paymentplansService.getAll({
      select: TREASURY_PP_SELECT,
      filter: "cfm_paymentplanstatus eq 5",
      maxPageSize: 1000,
      top: 2000,
    } as never),
  ]);

  return (ppResult.data ?? []).map((r) =>
    mapPaymentPlanRecord(r as never, agingDuesByVendor, insuranceCompanyBUs),
  );
}

/**
 * Reloads a single Payment Plan record fresh from Dataverse — mirrors
 * openTreasuryPPLModal()'s re-fetch-by-id so the modal always reflects the
 * latest saved values rather than a stale client-side cache.
 */
export async function fetchSinglePaymentPlanLine(
  id: string,
  agingDuesByVendor: Record<string, number>,
  insuranceCompanyBUs: Record<string, string>,
): Promise<PPLine> {
  const result = await Cfm_paymentplansService.get(id, {
    select: TREASURY_PP_SELECT,
  } as never);
  return mapPaymentPlanRecord(result.data as never, agingDuesByVendor, insuranceCompanyBUs);
}

/**
 * Saves the Treasury review — mirrors saveTreasuryPPLModal(). Sets Treasury
 * Status + Comment, and moves cfm_paymentplanstatus to 2 (Pending AP
 * Approval) so the record leaves the Treasury queue immediately.
 */
export async function saveTreasuryReview(
  id: string,
  treasuryStatus: number,
  comment: string,
): Promise<void> {
  await Cfm_paymentplansService.update(id, {
    cfm_treasurystatus: treasuryStatus,
    cfm_treasurycomment: comment,
    cfm_paymentplanstatus: 2,
  } as never);
}