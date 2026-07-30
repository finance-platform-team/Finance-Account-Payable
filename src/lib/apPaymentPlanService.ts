import { Cfm_paymentplansService } from "../generated/services/Cfm_paymentplansService";
import { Cfm_finance_apsService } from "../generated/services/Cfm_finance_apsService";
import { Cfm_insurancecompaniesService } from "../generated/services/Cfm_insurancecompaniesService";
import type {
  BadgeStyle,
  PPLine,
  PaymentPlanStatusCode,
  TreasuryStatusCode,
} from "../types/apPaymentPlan";

// ─────────────────────────────────────────────────────────────────────────
// $select — exact match to PP_LINE_FIELDS in CFM_APNew.html, expressed with
// the generated client's field names (formatted lookup names come back as
// their own properties, e.g. cfm_companycodename / cfm_scpriorityname,
// instead of the "@OData...FormattedValue" annotations Xrm.WebApi used).
// ─────────────────────────────────────────────────────────────────────────
const PP_LINE_SELECT: string[] = [
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

// ── Status label helpers — mirror getPaymentPlanStatusLabel() / getTreasuryStatusLabel() ──
export function getPaymentPlanStatusLabel(
  status: PaymentPlanStatusCode | undefined,
): string {
  switch (status) {
    case 1:
      return "AP Draft";
    case 2:
      return "Pending AP Approval";
    case 3:
      return "Pending SC";
    case 4:
      return "Returned to AP";
    case 5:
      return "Pending Treasury";
    case 6:
      return "Closed";
    default:
      return "-";
  }
}

export function getTreasuryStatusLabel(
  status: TreasuryStatusCode | undefined,
): string {
  switch (status) {
    case 1:
      return "Pending";
    case 2:
      return "Paid";
    case 3:
      return "Scheduled";
    case 4:
      return "Clarification Required";
    default:
      return "-";
  }
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Formats a Payment Plan date the same way formatPPDate() does. */
export function formatPPDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// ── Aging Total Dues lookup — mirrors loadAgingDuesLookup()/getAgingTotalDues() ──
// Initial Amount on the Payment Plan grid is READ-ONLY and always comes live
// from cfm_finance_ap's Total Dues (cfm_dueamount), matched by vendor name.
// It is never stored on cfm_paymentplan itself.
function normalizeVendorKey(name: string | undefined | null): string {
  return (name || "").trim().toLowerCase();
}

export async function fetchAgingDuesByVendor(): Promise<Record<string, number>> {
  const result = await Cfm_finance_apsService.getAll({
    select: ["cfm_vendorenglishname", "cfm_dueamount"],
    maxPageSize: 1000,
    top: 2000,
  });
  const map: Record<string, number> = {};
  (result.data ?? []).forEach((r: any) => {
    const key = normalizeVendorKey(r.cfm_vendorenglishname);
    if (key) map[key] = Number(r.cfm_dueamount || 0);
  });
  return map;
}

/**
 * Builds a lookup of cfm_insurancecompanyid -> BU name. The Payment Plan's
 * Business Unit isn't stored on cfm_paymentplan itself (cfm_bu is present in
 * the local schema but not published on the live OData endpoint — see chat
 * history); it's carried by the linked cfm_insurancecompany record instead
 * (via its own cfm_BU lookup, exposed as cfm_buname).
 */
export async function fetchInsuranceCompanyBUs(): Promise<Record<string, string>> {
  const result = await Cfm_insurancecompaniesService.getAll({
    select: ["cfm_insurancecompanyid", "_cfm_bu_value"],
    maxPageSize: 1000,
    top: 2000,
  });
  const map: Record<string, string> = {};
  (result.data ?? []).forEach((r: any) => {
    if (r.cfm_insurancecompanyid) {
      map[r.cfm_insurancecompanyid] = r.cfm_buname || "-";
    }
  });
  return map;
}

// ── Record mapping — mirrors mapPaymentPlanRecord() ──
// NOTE: the generated client returns formatted lookup display names as their
// own properties (cfm_companycodename, cfm_scpriorityname) rather than the
// "@OData...FormattedValue" annotations Xrm.WebApi used — this function
// reads from those instead, but the fallback chain is otherwise identical.
export function mapPaymentPlanRecord(
  r: any,
  agingDuesByVendor: Record<string, number>,
  insuranceCompanyBUs: Record<string, string>,
): PPLine {
  const companyCodeFormatted: string = r.cfm_companycodename || "";
  const companyName: string = r.cfm_companyname || "";

  let vendorName = "-";
  let companyCode = "-";

  if (r._cfm_companycode_value) {
    companyCode = companyCodeFormatted || "-";
    vendorName = companyName || companyCodeFormatted || "-";
  } else {
    vendorName = companyName || "-";
    companyCode = "-";
  }

  if (companyCode === "-" && r.cfm_plancode) {
    companyCode = r.cfm_plancode;
  }

  const category: string = r.cfm_scpriorityname || "—";
  const treasuryLabel = getTreasuryStatusLabel(r.cfm_treasurystatus);
  const statusLabel = getPaymentPlanStatusLabel(r.cfm_paymentplanstatus);

  // Initial Amount — read ONLY from the Aging dataset's Total Dues.
  const key = normalizeVendorKey(vendorName);
  const agingInitialAmount =
    key && Object.prototype.hasOwnProperty.call(agingDuesByVendor, key)
      ? agingDuesByVendor[key]
      : null;

  return {
    id: r.cfm_paymentplanid,
    scPriorityId: r._cfm_scpriority_value,
    category,
    code: companyCode,
    vendor: vendorName,
    bu:
      (r._cfm_companycode_value &&
        insuranceCompanyBUs[r._cfm_companycode_value]) ||
      "-",
    modifiedOn: r.modifiedon || null,
    initialAmount: agingInitialAmount,
    plannedAmount: agingInitialAmount,
    currentAmount: r.cfm_amount ?? null,
    due: formatPPDate(r.cfm_duedate),
    dueRaw: r.cfm_duedate ? String(r.cfm_duedate).split("T")[0] : "",
    notes: r.cfm_apnotes || null,
    status: r.cfm_paymentplanstatus,
    statusLabel,
    currentStage: statusLabel,
    treasuryStatus: r.cfm_treasurystatus,
    treasuryDecision: treasuryLabel,
    lastComment: r.cfm_treasurycomment || null,
    apComment: r.cfm_apnotes || null,
    region: "EGY",
  };
}

/**
 * Loads all Payment Plan lines for the AP view (no status filter — the AP
 * screen shows every stage) — mirrors loadPaymentPlanFromDataverse().
 */
export async function fetchPaymentPlanLines(): Promise<PPLine[]> {
  const [agingDuesByVendor, insuranceCompanyBUs, ppResult] = await Promise.all([
    fetchAgingDuesByVendor(),
    fetchInsuranceCompanyBUs(),
    Cfm_paymentplansService.getAll({
      select: PP_LINE_SELECT,
      maxPageSize: 1000,
      top: 2000,
    }),
  ]);

  return (ppResult.data ?? []).map((r: any) =>
    mapPaymentPlanRecord(r, agingDuesByVendor, insuranceCompanyBUs),
  );
}

// ── Badge color maps — mirror ppStageBadge() / ppDecisionBadge() ──
const STAGE_BADGE_COLORS: Record<string, BadgeStyle> = {
  "AP Draft": {
    bg: "rgba(165,132,91,.1)",
    border: "rgba(165,132,91,.26)",
    color: "var(--gold-dark)",
    label: "AP Draft",
  },
  "Pending AP Approval": {
    bg: "rgba(201,138,30,.08)",
    border: "rgba(201,138,30,.22)",
    color: "var(--amber)",
    label: "Pending AP Approval",
  },
  "Pending SC": {
    bg: "rgba(201,138,30,.08)",
    border: "rgba(201,138,30,.22)",
    color: "var(--amber)",
    label: "Pending SC",
  },
  "Returned to AP": {
    bg: "rgba(178,58,58,.09)",
    border: "rgba(178,58,58,.28)",
    color: "var(--danger)",
    label: "Returned to AP",
  },
  "Pending Treasury": {
    bg: "rgba(73,96,76,.12)",
    border: "rgba(73,96,76,.28)",
    color: "var(--green-dark)",
    label: "Pending Treasury",
  },
  Closed: {
    bg: "rgba(128,128,128,.08)",
    border: "rgba(128,128,128,.2)",
    color: "var(--dim)",
    label: "Closed",
  },
};

const DEFAULT_BADGE: Omit<BadgeStyle, "label"> = {
  bg: "rgba(128,128,128,.08)",
  border: "rgba(128,128,128,.2)",
  color: "var(--dim)",
};

/** Returns the visual spec for a STATUS badge — mirrors ppStageBadge(). */
export function getStageBadgeStyle(stage: string): BadgeStyle {
  return STAGE_BADGE_COLORS[stage] ?? { ...DEFAULT_BADGE, label: stage };
}

const DECISION_BADGE_COLORS: Record<string, Omit<BadgeStyle, "label">> = {
  Pending: {
    bg: "rgba(201,138,30,.09)",
    border: "rgba(201,138,30,.28)",
    color: "var(--amber)",
  },
  Scheduled: {
    bg: "rgba(73,96,76,.09)",
    border: "rgba(73,96,76,.28)",
    color: "var(--green-dark)",
  },
  Paid: {
    bg: "rgba(73,96,76,.16)",
    border: "rgba(73,96,76,.32)",
    color: "var(--green-dark)",
  },
  Deferred: {
    bg: "rgba(128,128,128,.08)",
    border: "rgba(128,128,128,.2)",
    color: "var(--dim)",
  },
  "Clarification Required": {
    bg: "rgba(178,58,58,.09)",
    border: "rgba(178,58,58,.28)",
    color: "var(--danger)",
  },
  "Escalated to CFO": {
    bg: "rgba(178,58,58,.16)",
    border: "rgba(178,58,58,.32)",
    color: "var(--danger)",
  },
};

/**
 * Returns the visual spec for a Treasury Decision badge — mirrors
 * ppDecisionBadge(), including the "Clarification Required" → "Need Info"
 * display-label swap.
 */
export function getDecisionBadgeStyle(decision: string): BadgeStyle {
  const colors = DECISION_BADGE_COLORS[decision] ?? DEFAULT_BADGE;
  const label = decision === "Clarification Required" ? "Need Info" : decision;
  return { ...colors, label };
}

// ── Write operations ──

/** Sends selected lines to Supply Chain — mirrors sendSelectedPPToSupplyChain(). */
export async function updatePaymentPlanStatus(
  id: string,
  status: PaymentPlanStatusCode,
): Promise<void> {
  await Cfm_paymentplansService.update(id, {
    cfm_paymentplanstatus: status,
  } as never);
}

/** Updates a line's Due Date — mirrors handlePPDueDateChange(). */
export async function updatePaymentPlanDueDate(
  id: string,
  dueDateIso: string,
): Promise<void> {
  await Cfm_paymentplansService.update(id, {
    cfm_duedate: dueDateIso,
  } as never);
}

/** Updates a line's Amount — mirrors the editable Amount field's save logic. */
export async function updatePaymentPlanAmount(
  id: string,
  amount: number,
): Promise<void> {
  await Cfm_paymentplansService.update(id, {
    cfm_amount: amount,
  } as never);
}

/** Updates a line's AP Notes — mirrors the AP Comment popup save logic. */
export async function updatePaymentPlanNotes(
  id: string,
  notes: string,
): Promise<void> {
  await Cfm_paymentplansService.update(id, {
    cfm_apnotes: notes,
  } as never);
}