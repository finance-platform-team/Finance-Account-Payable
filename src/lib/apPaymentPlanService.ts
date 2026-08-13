import { Cfm_paymentplansService } from "../generated/services/Cfm_paymentplansService";
import { Cfm_finance_apsService } from "../generated/services/Cfm_finance_apsService";
import { Cfm_insurancecompaniesService } from "../generated/services/Cfm_insurancecompaniesService";
import { Cfm_amounthistoriesService } from "../generated/services/Cfm_amounthistoriesService";
import type {
  BadgeStyle,
  PPLine,
  PaymentPlanStatusCode,
  TreasuryStatusCode,
} from "../types/apPaymentPlan";

// ─────────────────────────────────────────────────────────────────────────
// Raw row shapes — cover only the fields we actually read from each
// generated service's getAll() response (replaces 'any' with real types).
// ─────────────────────────────────────────────────────────────────────────
interface RawFinanceApRow {
  cfm_vendorenglishname?: string;
  cfm_dueamount?: number;
  cfm_category?: string;
  "cfm_category@OData.Community.Display.V1.FormattedValue"?: string;
}

interface RawInsuranceCompanyRow {
  cfm_insurancecompanyid?: string;
  cfm_buname?: string;
  cfm_code?: string;
  cfm_category?: string;
  "cfm_category@OData.Community.Display.V1.FormattedValue"?: string;
}

interface RawPaymentPlanRow {
  cfm_paymentplanid: string;
  cfm_plancode?: string;
  cfm_amount?: number;
  cfm_duedate?: string;
  cfm_paymentplanstatus?: PaymentPlanStatusCode;
  cfm_apnotes?: string;
  cfm_treasurystatus?: TreasuryStatusCode;
  cfm_treasurycomment?: string;
  cfm_companyname?: string;
  cfm_companycodename?: string;
  cfm_scpriorityname?: string;
   cfm_bu?: string; 
  modifiedon?: string;
  _cfm_companycode_value?: string;
  _cfm_scpriority_value?: string;
}

interface RawAmountHistoryRow {
  cfm_amounthistoryid: string;
  cfm_amount?: number;
  cfm_reasonforthischange?: string;
  createdon?: string;
  "_createdby_value@OData.Community.Display.V1.FormattedValue"?: string;
}

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
  "cfm_bu",
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

function normalizeCodeKey(code: string | undefined | null): string {
  return (code || "").trim().toLowerCase();
}

export async function fetchAgingDuesByVendor(): Promise<Record<string, number>> {
  const result = await Cfm_finance_apsService.getAll({
    select: ["cfm_vendorenglishname", "cfm_dueamount"],
    maxPageSize: 1000,
    top: 2000,
  });
  const map: Record<string, number> = {};
  (result.data ?? []).forEach((r: RawFinanceApRow) => {
    const key = normalizeVendorKey(r.cfm_vendorenglishname);
    if (key) map[key] = Number(r.cfm_dueamount || 0);
  });
  return map;
}

/**
 * Category source 1/2 — cfm_finance_ap (Aging), matched by vendor name —
 * mirrors loadAgingDuesLookup()'s agingCategoryByVendor.
 */
export async function fetchAgingCategoryByVendor(): Promise<Record<string, string>> {
  const result = await Cfm_finance_apsService.getAll({
    select: ["cfm_vendorenglishname", "cfm_category"],
    maxPageSize: 1000,
    top: 2000,
  });
  const map: Record<string, string> = {};
  (result.data ?? []).forEach((r: RawFinanceApRow) => {
    const key = normalizeVendorKey(r.cfm_vendorenglishname);
    if (!key) return;
    const catVal =
      r["cfm_category@OData.Community.Display.V1.FormattedValue"] || r.cfm_category;
    if (catVal) map[key] = catVal;
  });
  return map;
}

/**
 * Category source 2/2 — cfm_insurancecompany, matched by Code — mirrors
 * loadAgingDuesLookup()'s companyCategoryByCode fallback.
 */
export async function fetchCompanyCategoryByCode(): Promise<Record<string, string>> {
  const result = await Cfm_insurancecompaniesService.getAll({
    select: ["cfm_code", "cfm_category"],
    maxPageSize: 1000,
    top: 2000,
  });
  const map: Record<string, string> = {};
  (result.data ?? []).forEach((r: RawInsuranceCompanyRow) => {
    const key = normalizeCodeKey(r.cfm_code);
    if (!key) return;
    const catVal =
      r["cfm_category@OData.Community.Display.V1.FormattedValue"] || r.cfm_category;
    if (catVal) map[key] = catVal;
  });
  return map;
}

/**
 * Vendor Category — 1) cfm_finance_ap (Aging) by vendor name, 2) falling
 * back to cfm_insurancecompany by Code. Never sourced from the linked SC
 * Priority record — mirrors getVendorCategory().
 */
export function getVendorCategory(
  vendorName: string | undefined | null,
  companyCode: string | undefined | null,
  agingCategoryByVendor: Record<string, string>,
  companyCategoryByCode: Record<string, string>,
): string | null {
  const vendorKey = normalizeVendorKey(vendorName);
  if (vendorKey && Object.prototype.hasOwnProperty.call(agingCategoryByVendor, vendorKey)) {
    return agingCategoryByVendor[vendorKey];
  }
  const codeKey = normalizeCodeKey(companyCode);
  if (codeKey && Object.prototype.hasOwnProperty.call(companyCategoryByCode, codeKey)) {
    return companyCategoryByCode[codeKey];
  }
  return null;
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
  (result.data ?? []).forEach((r: RawInsuranceCompanyRow) => {
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
  r: RawPaymentPlanRow,
  agingDuesByVendor: Record<string, number>,
  insuranceCompanyBUs: Record<string, string>,
  agingCategoryByVendor: Record<string, string> = {},
  companyCategoryByCode: Record<string, string> = {},
): PPLine {
  const companyCodeFormatted: string = r.cfm_companycodename || "";
  const companyName: string = r.cfm_companyname || "";

  let vendorName: string;
  let companyCode: string;

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

  const category: string =
    getVendorCategory(vendorName, companyCode, agingCategoryByVendor, companyCategoryByCode) || "—";
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
    bu: r.cfm_bu || (
      (r._cfm_companycode_value &&
        insuranceCompanyBUs[r._cfm_companycode_value]) || "-"
    ),
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
  const [
    agingDuesByVendor,
    insuranceCompanyBUs,
    agingCategoryByVendor,
    companyCategoryByCode,
    ppResult,
  ] = await Promise.all([
    fetchAgingDuesByVendor(),
    fetchInsuranceCompanyBUs(),
    fetchAgingCategoryByVendor(),
    fetchCompanyCategoryByCode(),
    Cfm_paymentplansService.getAll({
      select: PP_LINE_SELECT,
      maxPageSize: 1000,
      top: 2000,
    }),
  ]);

  return (ppResult.data ?? []).map((r: RawPaymentPlanRow) =>
    mapPaymentPlanRecord(r, agingDuesByVendor, insuranceCompanyBUs, agingCategoryByVendor, companyCategoryByCode),
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

/** Creates a new Amount History record — mirrors createAmountHistoryRecord(). */
export async function createAmountHistoryRecord(
  paymentPlanId: string,
  amount: number,
  reason: string,
): Promise<void> {
  await Cfm_amounthistoriesService.create({
    cfm_amount: amount,
    cfm_reasonforthischange: reason,
    "cfm_Paymentplan@odata.bind": `/cfm_paymentplans(${paymentPlanId})`,
  } as never);
}

/**
 * Saves an Amount change together with its required reason — mirrors
 * saveAmountChangeReason(): Step 1 updates cfm_paymentplan (Amount + Due
 * Date, if provided), Step 2 creates the linked cfm_amounthistory record.
 * Both steps run in sequence, matching the legacy's error-handling order.
 */
export async function saveAmountChangeWithReason(
  id: string,
  newAmount: number,
  reason: string,
  dueDateIso?: string,
): Promise<void> {
  const step1Payload: Record<string, unknown> = { cfm_amount: newAmount };
  if (dueDateIso) step1Payload.cfm_duedate = dueDateIso;

  await Cfm_paymentplansService.update(id, step1Payload as never);
  await createAmountHistoryRecord(id, newAmount, reason);
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

// ── Amount History — mirrors openInitialAmountHistoryModal() ──
export interface AmountHistoryEntry {
  id: string;
  amount: number | null;
  reason: string | null;
  createdOn: string | null;
  userName: string;
}

export async function fetchAmountHistory(
  paymentPlanId: string,
): Promise<AmountHistoryEntry[]> {
  const result = await Cfm_amounthistoriesService.getAll({
    select: [
      "cfm_amounthistoryid",
      "cfm_amount",
      "cfm_reasonforthischange",
      "createdon",
      "_createdby_value",
    ],
    filter: `_cfm_paymentplan_value eq ${paymentPlanId}`,
    orderBy: ["createdon desc"],
    maxPageSize: 200,
    top: 200,
  });
  return (result.data ?? []).map((r: RawAmountHistoryRow) => ({
    id: r.cfm_amounthistoryid,
    amount: r.cfm_amount ?? null,
    reason: r.cfm_reasonforthischange || null,
    createdOn: r.createdon || null,
    userName:
      r["_createdby_value@OData.Community.Display.V1.FormattedValue"] ||
      "Unknown User",
  }));
}