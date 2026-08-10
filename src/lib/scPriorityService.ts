// src/lib/scPriorityService.ts

/* ════════════════════════════════════════
   SC PRIORITY — Service
   Table: cfm_scpriority (LogicalName) / cfm_scpriorities (EntitySetName)
   Source of truth: CFM_APNew.html
     - loadAndOpenSCPriority()  (line ~15820)
     - savePPLineDetail()       (line ~19236)

   Deviations from original (explicit user decisions):
   1. Vendor Criticality now uses the REAL choice values (1/2/3) and is
      actually persisted. The original HTML built a mismatched string
      <select> ("Strategic Vendor"/"Critical"/"Standard") whose value
      never passed parseInt(), so it silently never saved.
   2. Recommended Action / Supply Risk if Not Paid are now ACTUALLY
      SAVED — the original HTML had this logic commented out
      (disabled), so these two fields looked editable but silently
      never persisted. Enabled by explicit user decision.
   3. Response Date & Time is no longer a manually-editable input — it
      now just displays the record's own `createdon` timestamp
      (read-only), instead of writing a user-picked value to
      cfm_responsedatetime.
   Every other field/flow below is replicated 1:1 from the HTML.
════════════════════════════════════════ */

import { Cfm_scprioritiesService } from "../generated/services/Cfm_scprioritiesService";
import { Cfm_paymentplansService } from "../generated/services/Cfm_paymentplansService";

// ─────────────────────────────────────────────────────────────────────────
// Raw row shape — only the fields loadAndOpenSCPriority() actually selects.
// ─────────────────────────────────────────────────────────────────────────
interface RawScPriorityRow {
  cfm_prioritystatus?: number;
  cfm_priorityrank?: number;
  cfm_recommendedaction?: number;
  cfm_recommendedamount?: number;
  cfm_recommendeddate?: string;
  cfm_supplyriskifnotpaid?: number;
  cfm_vendorcriticality?: number;
  cfm_alternativevendor?: boolean;
  cfm_partialpaymentaccepted?: boolean;
  cfm_responsedatetime?: string;
  createdon?: string;
  "_modifiedby_value@OData.Community.Display.V1.FormattedValue"?: string;
}

const SC_PRIORITY_SELECT: string[] = [
  "cfm_prioritystatus",
  "cfm_priorityrank",
  "cfm_recommendedaction",
  "cfm_recommendedamount",
  "cfm_recommendeddate",
  "cfm_supplyriskifnotpaid",
  "cfm_vendorcriticality",
  "cfm_alternativevendor",
  "cfm_partialpaymentaccepted",
  "_modifiedby_value",
  "cfm_responsedatetime",
  "createdon",
];

// ── Label maps — mirror the inline maps inside loadAndOpenSCPriority() (isEditable=false branch) ──
export const SC_PRIORITY_STATUS_LABEL: Record<number, string> = {
  123200000: "Low",
  123200001: "Medium",
  123200002: "High",
  931940001: "Critical",
};
export const SC_RECOMMENDED_ACTION_LABEL: Record<number, string> = {
  4: "Pay First",
  1: "Pay Partial",
  2: "Hold",
  3: "Defer",
};
export const SC_SUPPLY_RISK_LABEL: Record<number, string> = {
  1: "High Risk",
  2: "No Risk",
  3: "Medium Risk",
  4: "Critical Operational Risk",
};
// Fixed (was the buggy string <select> in the original) — real Dataverse choice labels.
export const SC_VENDOR_CRITICALITY_LABEL: Record<number, string> = {
  1: "Critical Vendor",
  2: "Strategic Vendor",
  3: "Normal Vendor",
};

// ── Edit-form shape returned to the modal ──
export interface ScPriorityEditData {
  priorityStatus: number | null;
  priorityRank: number | null;
  recommendedAction: number | null; // now saved — see file header
  recommendedAmount: number | null;
  recommendedDate: string | null; // "YYYY-MM-DD" for <input type="date">
  supplyRisk: number | null; // now saved — see file header
  vendorCriticality: number | null;
  altVendor: boolean | null;
  partialAccepted: boolean | null;
  responseDateTime: string | null; // "YYYY-MM-DDTHH:mm" — kept for backward reference, no longer user-editable
  scOwner: string | null;
  /** Raw ISO creation timestamp of the cfm_scpriority record — null if not yet created. */
  createdOn: string | null;
}

/**
 * Loads an existing SC Priority record for the EDIT form.
 * Mirrors loadAndOpenSCPriority()'s isEditable=true branch — raw
 * numeric/boolean values are kept (not translated to labels) so the
 * <select> options can be pre-selected correctly.
 */
export async function fetchScPriorityForEdit(
  scPriorityId: string,
): Promise<ScPriorityEditData> {
  const result = await Cfm_scprioritiesService.get(scPriorityId, {
    select: SC_PRIORITY_SELECT,
  } as never);
  const r = (result.data ?? {}) as RawScPriorityRow;
    console.log(
    "SC PRIORITY RAW DEBUG:",
    JSON.stringify(
      {
        recommendedActionRaw: r.cfm_recommendedaction,
        supplyRiskRaw: r.cfm_supplyriskifnotpaid,
        priorityStatusRaw: r.cfm_prioritystatus,
        vendorCriticalityRaw: r.cfm_vendorcriticality,
      },
      null,
      2,
    ),
  );

  let recommendedDate: string | null = null;
  if (r.cfm_recommendeddate) {
    recommendedDate = new Date(r.cfm_recommendeddate)
      .toISOString()
      .split("T")[0];
  }

  let responseDateTime: string | null = null;
  if (r.cfm_responsedatetime) {
    const d = new Date(r.cfm_responsedatetime);
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    const hr = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    responseDateTime = `${yr}-${mo}-${da}T${hr}:${mi}`;
  }

  return {
    priorityStatus: r.cfm_prioritystatus ?? null,
    priorityRank: r.cfm_priorityrank ?? null,
    recommendedAction: r.cfm_recommendedaction ?? null,
    recommendedAmount: r.cfm_recommendedamount ?? null,
    recommendedDate,
    supplyRisk: r.cfm_supplyriskifnotpaid ?? null,
    vendorCriticality: r.cfm_vendorcriticality ?? null,
    altVendor: r.cfm_alternativevendor ?? null,
    partialAccepted: r.cfm_partialpaymentaccepted ?? null,
    responseDateTime,
    scOwner:
      r["_modifiedby_value@OData.Community.Display.V1.FormattedValue"] ??
      null,
    createdOn: r.createdon ?? null,
  };
}

/** Formats "YYYY-MM-DDTHH:mm" or a full ISO string as "29 Jul 2026 12:02 PM" — used for both the edit form's read-only Created On display and the AP view-only modal's Response Date & Time. */
export function formatScDisplayDateTime(raw: string | null): string {
  if (!raw) return "-";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return "-";
  const datePart = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const timePart = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${datePart} ${timePart}`;
}

// ── Write payload shape (only fields the form actually collects) ──
export interface ScPriorityWritePayload {
  cfm_prioritystatus?: number;
  cfm_priorityrank?: number;
  cfm_recommendedamount?: number;
  cfm_recommendeddate?: string; // "YYYY-MM-DD"
  cfm_vendorcriticality?: number;
  cfm_alternativevendor?: boolean;
  cfm_partialpaymentaccepted?: boolean;
  /** Now saved (previously disabled/commented out in the original HTML — enabled by explicit user decision). */
  cfm_recommendedaction?: number;
  /** Now saved (previously disabled/commented out in the original HTML — enabled by explicit user decision). */
  cfm_supplyriskifnotpaid?: number;
}

/**
 * Builds the write payload from raw form field values — mirrors
 * savePPLineDetail()'s "only include if truthy/parseable" behavior.
 * Recommended Action and Supply Risk are now included (see file header —
 * these were disabled/commented out in the original, now enabled).
 * cfm_responsedatetime is intentionally never written here anymore —
 * Response Date & Time is a read-only display of createdon now.
 */
export function buildScPriorityPayload(form: {
  priorityStatus?: string; // select value, e.g. "123200000"
  priorityRank?: string; // number input value
  recommendedAmount?: string; // text input, may contain commas
  recommendedDate?: string; // "YYYY-MM-DD"
  vendorCriticality?: string; // select value, e.g. "1"
  altVendor?: "Yes" | "No" | "";
  partialAccepted?: "Yes" | "No" | "";
  recommendedAction?: string; // select value, e.g. "4"
  supplyRisk?: string; // select value, e.g. "1"
}): ScPriorityWritePayload {
  const data: ScPriorityWritePayload = {};

  if (form.priorityStatus) {
    data.cfm_prioritystatus = parseInt(form.priorityStatus, 10);
  }
  if (form.priorityRank) {
    data.cfm_priorityrank = parseInt(form.priorityRank, 10);
  }
  if (form.recommendedAmount) {
    const parsedAmt = parseFloat(form.recommendedAmount.replace(/,/g, ""));
    if (!isNaN(parsedAmt)) data.cfm_recommendedamount = parsedAmt;
  }
  if (form.recommendedDate) {
    data.cfm_recommendeddate = new Date(form.recommendedDate)
      .toISOString()
      .split("T")[0];
  }
  if (form.vendorCriticality) {
    const parsedCrit = parseInt(form.vendorCriticality, 10);
    if (!isNaN(parsedCrit)) data.cfm_vendorcriticality = parsedCrit;
  }
  if (form.altVendor) {
    data.cfm_alternativevendor = form.altVendor === "Yes";
  }
  if (form.partialAccepted) {
    data.cfm_partialpaymentaccepted = form.partialAccepted === "Yes";
  }
  if (form.recommendedAction) {
    const parsedAction = parseInt(form.recommendedAction, 10);
    if (!isNaN(parsedAction)) data.cfm_recommendedaction = parsedAction;
  }
  if (form.supplyRisk) {
    const parsedRisk = parseInt(form.supplyRisk, 10);
    if (!isNaN(parsedRisk)) data.cfm_supplyriskifnotpaid = parsedRisk;
  }

  return data;
}

/**
 * Creates or updates the SC Priority record for a payment plan line —
 * mirrors savePPLineDetail(). If no SC Priority exists yet, creates one
 * then binds it back onto the Payment Plan via cfm_SCPriority@odata.bind
 * (the confirmed real field name — no fallback chain needed, unlike the
 * original HTML which tried 4 possible names).
 *
 * @param paymentPlanId          cfm_paymentplan row id (row.id in ppLines)
 * @param existingScPriorityId   row.scPriorityId — null/undefined if none yet
 * @param payload                from buildScPriorityPayload()
 */
export async function saveScPriority(
  paymentPlanId: string,
  existingScPriorityId: string | null | undefined,
  payload: ScPriorityWritePayload,
): Promise<{ scPriorityId: string }> {
  if (!existingScPriorityId) {
    const created = await Cfm_scprioritiesService.create(payload as never);
    const newId = (created.data as { cfm_scpriorityid: string })
      .cfm_scpriorityid;

    await Cfm_paymentplansService.update(paymentPlanId, {
      "cfm_SCPriority@odata.bind": `/cfm_scpriorities(${newId})`,
    } as never);

    return { scPriorityId: newId };
  }

  await Cfm_scprioritiesService.update(existingScPriorityId, payload as never);
  return { scPriorityId: existingScPriorityId };
}

/** Read-only display view of an SC Priority record — for the AP View's "peek" modal. */
export interface ScPriorityViewData {
  priorityStatusLabel: string;
  priorityRank: string;
  recommendedActionLabel: string;
  recommendedAmount: string;
  recommendedDate: string;
  supplyRiskLabel: string;
  vendorCriticalityLabel: string;
  altVendorLabel: string;
  partialAcceptedLabel: string;
  scOwner: string;
  responseDateTime: string;
}

/**
 * Loads an SC Priority record for READ-ONLY display (AP View double-click).
 * Mirrors loadAndOpenSCPriority()'s isEditable=false branch: raw codes are
 * translated to their display labels. Fields with no real data source in
 * the original (Operational Impact, Justification, SLA Status, Escalation)
 * are intentionally omitted — by explicit decision, not oversight.
 */
export async function fetchScPriorityForView(
  scPriorityId: string,
): Promise<ScPriorityViewData> {
  const data = await fetchScPriorityForEdit(scPriorityId);

  return {
    priorityStatusLabel:
      data.priorityStatus != null
        ? SC_PRIORITY_STATUS_LABEL[data.priorityStatus] ?? String(data.priorityStatus)
        : "—",
    priorityRank: data.priorityRank != null ? String(data.priorityRank) : "—",
    recommendedActionLabel:
      data.recommendedAction != null
        ? SC_RECOMMENDED_ACTION_LABEL[data.recommendedAction] ?? String(data.recommendedAction)
        : "—",
    recommendedAmount:
      data.recommendedAmount != null ? data.recommendedAmount.toLocaleString("en-US") : "—",
    recommendedDate: data.recommendedDate || "—",
    supplyRiskLabel:
      data.supplyRisk != null
        ? SC_SUPPLY_RISK_LABEL[data.supplyRisk] ?? String(data.supplyRisk)
        : "—",
    vendorCriticalityLabel:
      data.vendorCriticality != null
        ? SC_VENDOR_CRITICALITY_LABEL[data.vendorCriticality] ?? String(data.vendorCriticality)
        : "—",
    altVendorLabel: data.altVendor == null ? "—" : data.altVendor ? "Yes" : "No",
    partialAcceptedLabel:
      data.partialAccepted == null ? "—" : data.partialAccepted ? "Yes" : "No",
    scOwner: data.scOwner || "—",
    responseDateTime: formatScDisplayDateTime(data.createdOn),
  };
}