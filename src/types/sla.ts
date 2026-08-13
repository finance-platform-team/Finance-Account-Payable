// src/types/sla.ts

/* ════════════════════════════════════════
   SLA & ESCALATION — Types
   Tables: cfm_sla (config rules) / cfm_slatracking (live tracking)
   Source of truth: CFM_APNew.html
     - getSlaTypeLabel() / loadSlaConfigList()   (line ~19180-19260)
     - saveSlaConfig() / deleteSlaConfig()        (line ~19568-19748)
     - loadSlaTrackingList() / computeSlaTrackingStatus() (line ~19761-19891)
════════════════════════════════════════ */

/** cfm_slatype choice values — mirrors the ASSUMPTION comment in CFM_APNew.html. */
export const SLA_TYPE_HOURS = 766340000;
export const SLA_TYPE_DATE = 766340001;
export type SlaTypeValue = typeof SLA_TYPE_HOURS | typeof SLA_TYPE_DATE;

export function getSlaTypeLabel(value: SlaTypeValue | number | undefined): string {
  return value === SLA_TYPE_DATE ? "Date" : "Hours";
}

/** A config rule row — mirrors the shape built by loadSlaConfigList(). */
export interface SlaRule {
  id: string;
  action: string;
  slaType: SlaTypeValue;
  slaTypeLabel: string;
  value: string; // hours, or a yyyy-mm-dd date, depending on slaType
  escalationRule: string;
  deduction: string;
  responsibleId: string;
  responsibleName: string;
  department1: string;
  department2: string;
  manager1Id: string;
  manager1Name: string;
  manager2Id: string;
  manager2Name: string;
  active: boolean;
}

/** Live status derived from a tracking record's own flags/dates — mirrors computeSlaTrackingStatus(). */
export type SlaTrackingStatus = "ontrack" | "warning" | "escalated" | "breached" | "completed";

/** A live tracking row — mirrors the shape built by loadSlaTrackingList(). */
export interface SlaTrackingRecord {
  id: string;
  name: string;
  action: string;
  startDate: string | null;
  deadline: string | null;
  statusRaw: number | null;
  warningSent: boolean;
  warningDate: string | null;
  escalated: boolean;
  escalatedDate: string | null;
  breachedDate: string | null;
  completedDate: string | null;
}
