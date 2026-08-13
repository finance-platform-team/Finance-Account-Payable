// src/types/advancePayment.ts

/* ════════════════════════════════════════
   ADVANCE PAYMENTS — Types
   Table: cfm_advancedpayment (LogicalName) / cfm_advancedpayments (EntitySetName)
   Source of truth: CFM_APNew.html
     - ADV_STATUS / advStatusMeta()     (line ~13034)
     - loadAdvancePayments()            (line ~13556)
     - submitAdvancePayment()           (line ~13325)
     - openAdvReviewModal()             (line ~13805)
     - saveAdvReviewDecision()          (line ~13880)

   NOTE: Role-based gating (hasRole("AP")/hasRole("SC")/hasRole("TREASURY"))
   from the original is intentionally OMITTED for this build — by explicit
   user decision, pending a broader identity-resolution solution for the
   Code App. All actions are visible to everyone for now.
════════════════════════════════════════ */

export type AdvPaymentStatusValue = 0 | 1 | 2 | 3 | 766340001 | 766340002;

export interface AdvStatusMeta {
  label: string;
  bg: string;
  color: string;
  /** Kept for future role-gating — unused while gating is disabled. */
  stage: "ap" | "treasury" | "ap-close" | "sc-edit" | null;
}

// ── Status metadata — mirrors ADV_STATUS exactly ──
export const ADV_STATUS: Record<number, AdvStatusMeta> = {
  0: { label: "Pending in AP", bg: "var(--warn-soft)", color: "var(--amber)", stage: "ap" },
  2: { label: "Pending in Treasury", bg: "var(--warn-soft)", color: "var(--amber)", stage: "treasury" },
  1: { label: "Approved", bg: "var(--green-soft)", color: "var(--green-dark)", stage: "ap-close" },
  3: { label: "Rejected By AP", bg: "var(--danger-soft)", color: "var(--danger)", stage: "sc-edit" },
  766340001: { label: "Rejected By Treasury", bg: "var(--danger-soft)", color: "var(--danger)", stage: "sc-edit" },
  766340002: { label: "Closed", bg: "var(--canvas)", color: "var(--muted)", stage: null },
};

/** Mirrors advStatusMeta() — falls back to "Pending in AP" styling for unknown values. */
export function advStatusMeta(statusVal: number | null | undefined): AdvStatusMeta {
  if (statusVal != null && ADV_STATUS[statusVal]) return ADV_STATUS[statusVal];
  return { label: "Pending in AP", bg: "var(--canvas)", color: "var(--muted)", stage: "ap" };
}

/** A row in the Advance Payments grid — mirrors the shape built by loadAdvancePayments(). */
export interface AdvancePayment {
  id: string;
  vendorCode: string;
  vendorName: string;
  bu: string;
  amount: number;
  date: string; // display, "dd Mon yyyy"
  dateRaw: string; // "YYYY-MM-DD", for filtering/editing
  notes: string;
  statusValue: AdvPaymentStatusValue;
  status: string; // label
  requestedBy: string; // always "-" for now — see identity note above
  category: string; // from the matched cfm_insurancecompany, or "-"
}

/** Matched company from the code lookup (mirrors _advMatchedCompany). */
export interface MatchedAdvCompany {
  id: string | null;
  name: string;
  code: string;
  bu: string;
  category: string;
}

export const ADV_PER_PAGE = 10;