// ─────────────────────────────────────────────────────────────────────────
// Payment Plan (AP view) — types
// Mirrors mapPaymentPlanRecord() / ppStageBadge() / ppDecisionBadge() from
// CFM_APNew.html exactly — same status numbers, same labels, same colors.
// ─────────────────────────────────────────────────────────────────────────

/** cfm_paymentplanstatus choice values — matches Cfm_paymentplanscfm_paymentplanstatus. */
export type PaymentPlanStatusCode = 1 | 2 | 3 | 4 | 5 | 6;

/** cfm_treasurystatus choice values — matches Cfm_paymentplanscfm_treasurystatus. */
export type TreasuryStatusCode = 1 | 2 | 3 | 4;

/** A single badge's visual spec — bg/border/text color, resolved from CSS vars. */
export interface BadgeStyle {
  bg: string;
  border: string;
  color: string;
  label: string;
}

/**
 * A mapped Payment Plan line, as displayed in the grid — same shape as an
 * entry in the legacy `ppLines` array (built by mapPaymentPlanRecord()).
 */
export interface PPLine {
  id: string;
  scPriorityId: string | undefined;
  category: string; // formatted SC Priority name, or "—"
  code: string; // Sub Ledger Code (from cfm_insurancecompany via CompanyCode lookup, or cfm_plancode fallback)
  vendor: string; // Vendor Name (read-only from DotCare/insurance company)
  bu: string;
  modifiedOn: string | null;
  initialAmount: number | null; // read-only, always from Aging Total Dues — never stored on the plan itself
  plannedAmount: number | null; // same value as initialAmount (legacy keeps both names)
  currentAmount: number | null; // the ONLY AP-editable amount field — cfm_amount
  due: string; // formatted display date ("dd Mon yyyy") or "-"
  dueRaw: string; // raw YYYY-MM-DD for a native <input type="date">
  notes: string | null; // cfm_apnotes
  status: PaymentPlanStatusCode | undefined;
  statusLabel: string; // e.g. "AP Draft", "Pending SC", ...
  currentStage: string; // same as statusLabel — used for the STATUS badge
  treasuryStatus: TreasuryStatusCode | undefined;
  treasuryDecision: string; // e.g. "Pending", "Paid", ... — used for the Treasury Decision badge
  lastComment: string | null; // cfm_treasurycomment
  apComment: string | null; // same as notes
  region: string; // always "EGY" for now (legacy default)
}

export const PP_PER_PAGE = 10;