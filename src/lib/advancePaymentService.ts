// src/lib/advancePaymentService.ts

import { Cfm_advancedpaymentsService } from "../generated/services/Cfm_advancedpaymentsService";
import { Cfm_insurancecompaniesService } from "../generated/services/Cfm_insurancecompaniesService";
import type { AdvancePayment, MatchedAdvCompany, AdvPaymentStatusValue } from "../types/advancePayment";
import { advStatusMeta } from "../types/advancePayment";

// ─────────────────────────────────────────────────────────────────────────
// Raw row shapes
// ─────────────────────────────────────────────────────────────────────────
interface RawAdvancePaymentRow {
  cfm_advancedpaymentid: string;
  cfm_amount?: number;
  cfm_date?: string;
  cfm_notes?: string;
  cfm_companyname?: string;
  cfm_bu?: string;
  cfm_category?: string;
  cfm_statusofadvancepayment?: number;
  createdon?: string;
  "_cfm_requestedby_value@OData.Community.Display.V1.FormattedValue"?: string;
  _cfm_companycode_value?: string;
  "_cfm_companycode_value@OData.Community.Display.V1.FormattedValue"?: string;
}

interface RawInsuranceCompanyLookupRow {
  cfm_insurancecompanyid?: string;
  cfm_name?: string;
  cfm_code?: string;
  cfm_category?: string;
  _cfm_bu_value?: string;
  "_cfm_bu_value@OData.Community.Display.V1.FormattedValue"?: string;
}

/** Formats a raw date as "dd Mon yyyy" — mirrors loadAdvancePayments()'s dateStr build. */
function formatAdvDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Loads all Advance Payment records — mirrors loadAdvancePayments().
 * Note: the original also $expands cfm_CompanyCode for cfm_code/cfm_name;
 * here we read the generated client's own formatted-name property instead
 * (cfm_companycodename), consistent with how apPaymentPlanService handles
 * company code lookups.
 */
export async function fetchAdvancePayments(): Promise<AdvancePayment[]> {
  const result = await Cfm_advancedpaymentsService.getAll({
    select: [
      "cfm_advancedpaymentid",
      "cfm_amount",
      "cfm_date",
      "cfm_notes",
      "cfm_companyname",
      "cfm_bu",
      "cfm_category",
      "cfm_statusofadvancepayment",
      "createdon",
      "_cfm_requestedby_value",
      "_cfm_companycode_value",
    ],
    orderBy: ["createdon desc"],
    maxPageSize: 1000,
    top: 2000,
  } as never);
  return (result.data ?? []).map((r: RawAdvancePaymentRow) => {
    const statusVal = r.cfm_statusofadvancepayment ?? 0;
    return {
      id: r.cfm_advancedpaymentid,
      vendorCode: r["_cfm_companycode_value@OData.Community.Display.V1.FormattedValue"] || "-",
      vendorName: r.cfm_companyname || "-",
      bu: r.cfm_bu || "-",
      amount: r.cfm_amount || 0,
      date: formatAdvDate(r.cfm_date),
      dateRaw: r.cfm_date ? String(r.cfm_date).split("T")[0] : "",
      notes: r.cfm_notes || "",
      statusValue: statusVal as AdvPaymentStatusValue,
      status: advStatusMeta(statusVal).label,
      requestedBy:
        r["_cfm_requestedby_value@OData.Community.Display.V1.FormattedValue"] || "-",
      category: r.cfm_category || "-",
    };
  });
}

/**
 * Looks up a company by its code — mirrors lookupAdvVendor()'s Dataverse
 * branch. Returns null if not found (caller shows "Company not found").
 */
export async function lookupCompanyByCode(
  code: string,
): Promise<MatchedAdvCompany | null> {
  const trimmed = code.trim();
  if (trimmed.length < 2) return null;

  const result = await Cfm_insurancecompaniesService.getAll({
    select: ["cfm_insurancecompanyid", "cfm_name", "cfm_code", "cfm_category", "_cfm_bu_value"],
    filter: `cfm_code eq '${trimmed.replace(/'/g, "''")}'`,
    top: 1,
  } as never);

  const rows = (result.data ?? []) as RawInsuranceCompanyLookupRow[];
  if (rows.length === 0) return null;

  const comp = rows[0];
  return {
    id: comp.cfm_insurancecompanyid || null,
    name: comp.cfm_name || "-",
    code: comp.cfm_code || trimmed,
    bu: comp["_cfm_bu_value@OData.Community.Display.V1.FormattedValue"] || "",
    category: comp.cfm_category || "",
  };
}

/** Payload for creating/updating an Advance Payment — mirrors proceedSubmitAdvancePayment(). */
export interface AdvancePaymentSubmitPayload {
  amount: number;
  dateIso: string; // "YYYY-MM-DD"
  notes: string;
  companyName: string;
  bu: string;
  category: string;
  matchedCompanyId: string | null;
}

/**
 * Creates a new Advance Payment (editId absent) or resubmits an existing
 * rejected one (editId present) — mirrors proceedSubmitAdvancePayment().
 * Status is always (re)set to 0 (Pending in AP): a resubmit always
 * re-enters the workflow at the AP review step.
 *
 * NOTE: cfm_RequestedBy@odata.bind is intentionally NOT set here — the
 * original stamped it with the signed-in user's systemuser id, which the
 * Code App cannot currently resolve (see identity-resolution notes).
 * Dataverse's own createdby/modifiedby are still recorded automatically.
 */
export async function submitAdvancePayment(
  payload: AdvancePaymentSubmitPayload,
  editId?: string,
): Promise<void> {
  const recordData: Record<string, unknown> = {
    cfm_amount: payload.amount,
    cfm_date: payload.dateIso,
    cfm_notes: payload.notes,
    cfm_companyname: payload.companyName,
    cfm_bu: payload.bu,
    cfm_category: payload.category,
    cfm_statusofadvancepayment: 0,
  };

  if (payload.matchedCompanyId) {
    recordData["cfm_CompanyCode@odata.bind"] =
      `/cfm_insurancecompanies(${payload.matchedCompanyId})`;
  }

  if (editId) {
    await Cfm_advancedpaymentsService.update(editId, recordData as never);
  } else {
    await Cfm_advancedpaymentsService.create(recordData as never);
  }
}

/** Advances the workflow status — mirrors saveAdvReviewDecision(). */
export async function updateAdvancePaymentStatus(
  id: string,
  nextStatus: AdvPaymentStatusValue,
): Promise<void> {
  await Cfm_advancedpaymentsService.update(id, {
    cfm_statusofadvancepayment: nextStatus,
  } as never);
}