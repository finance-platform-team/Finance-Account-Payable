// src/lib/slaService.ts

/* ════════════════════════════════════════
   SLA & ESCALATION — Service
   Source of truth: CFM_APNew.html
     - loadSlaConfigList()        (line ~19189)
     - saveSlaConfig()            (line ~19568)
     - toggleSlaConfigStatus()    (line ~19692)
     - proceedDeleteSlaConfig()   (line ~19732)
     - loadSlaTrackingList()      (line ~19761)
     - computeSlaTrackingStatus() (line ~19817)

   NOTE: the legacy app uses raw $expand (cfm_Responsible/cfm_ManagerOf...
   /cfm_SLA) to pull the related record's display name in one round-trip.
   The generated Code App client here has no `expand` option (see
   IGetAllOptions in generated/models/CommonModels.ts), so — same pattern
   already used by apPaymentPlanService.ts's Aging/InsuranceCompany lookup
   maps — related names are resolved via a small prefetched id->name map
   and joined client-side instead.
════════════════════════════════════════ */

import { Cfm_slasService } from "../generated/services/Cfm_slasService";
import { Cfm_slatrackingsService } from "../generated/services/Cfm_slatrackingsService";
import { SystemusersService } from "../generated/services/SystemusersService";
import type { SlaRule, SlaTrackingStatus, SlaTrackingRecord, SlaTypeValue } from "../types/sla";
import { getSlaTypeLabel, SLA_TYPE_HOURS } from "../types/sla";

interface RawSlaRow {
  cfm_slaid: string;
  cfm_action?: string;
  cfm_slatype?: number;
  cfm_slanoofhoursordate?: string;
  cfm_escalationrule?: string;
  cfm_deduction?: string;
  cfm_department1?: string;
  cfm_department2?: string;
  statuscode?: number;
  _cfm_responsible_value?: string;
  _cfm_managerfordepartment1_value?: string;
  _cfm_managerofdepartment2_value?: string;
}

/** Fetches fullname for a set of systemuser ids — small helper for the client-side join. */
async function fetchUserNamesByIds(ids: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return {};
  const filter = unique.map((id) => `systemuserid eq ${id}`).join(" or ");
  const result = await SystemusersService.getAll({
    select: ["systemuserid", "fullname"],
    filter,
    top: unique.length,
  } as never);
  const map: Record<string, string> = {};
  (result.data ?? []).forEach((u: { systemuserid?: string; fullname?: string }) => {
    if (u.systemuserid) map[u.systemuserid] = u.fullname || "-";
  });
  return map;
}

// Confirmed against a live cfm_slas OData response: the Manager of
// Department 1 field is genuinely named "cfm_managerfordepartment1"
// ("...FOR..."), inconsistent with Department 2's "cfm_managerofdepartment2"
// ("...OF..."). _cfm_responsible_value and _cfm_managerofdepartment2_value
// were already correct.
const SLA_LOOKUPS_ENABLED = true;

/** Loads all SLA config rules, newest first. */
export async function fetchSlaRules(): Promise<SlaRule[]> {
  const result = await Cfm_slasService.getAll({
    select: [
      "cfm_slaid",
      "cfm_action",
      "cfm_slatype",
      "cfm_slanoofhoursordate",
      "cfm_escalationrule",
      "cfm_deduction",
      "cfm_department1",
      "cfm_department2",
      "statuscode",
      "createdon",
      ...(SLA_LOOKUPS_ENABLED
        ? ["_cfm_responsible_value", "_cfm_managerfordepartment1_value", "_cfm_managerofdepartment2_value"]
        : []),
    ],
    orderBy: ["createdon desc"],
    maxPageSize: 500,
    top: 1000,
  } as never);

  // The generated client's IOperationResult doesn't throw on failure — it
  // returns { success: false, error }. Without this check a broken data
  // source silently looks identical to "the table is genuinely empty".
  if (!result.success) {
    throw result.error || new Error("Failed to fetch cfm_sla records.");
  }

  const rows = (result.data ?? []) as RawSlaRow[];
  const userNames = await fetchUserNamesByIds(
    rows.flatMap((r) => [
      r._cfm_responsible_value,
      r._cfm_managerfordepartment1_value,
      r._cfm_managerofdepartment2_value,
    ]).filter((v): v is string => !!v),
  );

  return rows.map((r) => {
    const slaType = (r.cfm_slatype ?? SLA_TYPE_HOURS) as SlaTypeValue;
    return {
      id: r.cfm_slaid,
      action: r.cfm_action || "-",
      slaType,
      slaTypeLabel: getSlaTypeLabel(slaType),
      value: r.cfm_slanoofhoursordate || "-",
      escalationRule: r.cfm_escalationrule || "-",
      deduction: r.cfm_deduction || "",
      responsibleId: r._cfm_responsible_value || "",
      responsibleName: r._cfm_responsible_value ? userNames[r._cfm_responsible_value] || "-" : "-",
      department1: r.cfm_department1 || "-",
      department2: r.cfm_department2 || "-",
      manager1Id: r._cfm_managerfordepartment1_value || "",
      manager1Name: r._cfm_managerfordepartment1_value ? userNames[r._cfm_managerfordepartment1_value] || "-" : "-",
      manager2Id: r._cfm_managerofdepartment2_value || "",
      manager2Name: r._cfm_managerofdepartment2_value ? userNames[r._cfm_managerofdepartment2_value] || "-" : "-",
      active: r.statuscode === 1,
    };
  });
}

/** Searches systemuser by fullname — mirrors searchSlaResponsibleUsers(). */
export async function searchSlaUsers(term: string): Promise<{ id: string; fullname: string }[]> {
  const result = await SystemusersService.getAll({
    select: ["fullname", "systemuserid"],
    filter: `contains(fullname,'${term.replace(/'/g, "''")}')`,
    top: 10,
  } as never);
  return (result.data ?? []).map((u: { systemuserid?: string; fullname?: string }) => ({
    id: u.systemuserid || "",
    fullname: u.fullname || "",
  }));
}

export interface SlaRuleSaveInput {
  action: string;
  slaType: SlaTypeValue;
  value: string;
  escalationRule: string;
  deduction: string;
  department1: string;
  department2: string;
  responsibleId: string;
  manager1Id: string;
  manager2Id: string;
}

/** Creates or updates an SLA rule — mirrors saveSlaConfig(). */
export async function saveSlaRule(id: string | null, input: SlaRuleSaveInput): Promise<void> {
  const recordData: Record<string, unknown> = {
    cfm_action: input.action,
    cfm_slatype: input.slaType,
    cfm_slanoofhoursordate: input.value,
    cfm_escalationrule: input.escalationRule,
    cfm_deduction: input.deduction,
    cfm_department1: input.department1,
    cfm_department2: input.department2,
  };
  // Nav property (@odata.bind) names — confirmed authoritative via
  // Cfm_slasService.getMetadata({ schema: { manyToOne: true } })'s
  // ReferencingEntityNavigationPropertyName (NOT the relationship's Schema
  // Name shown in the maker portal's Relationships list, which turned out
  // not to match what the Web API accepts). Note the case-sensitive
  // "...for..." (lowercase) in ManagerforDepartment1, inconsistent with
  // ManagerofDepartment2's casing.
  if (input.responsibleId) {
    recordData["cfm_Responsible@odata.bind"] = `/systemusers(${input.responsibleId})`;
  }
  if (input.manager1Id) {
    recordData["cfm_ManagerforDepartment1@odata.bind"] = `/systemusers(${input.manager1Id})`;
  }
  if (input.manager2Id) {
    recordData["cfm_ManagerofDepartment2@odata.bind"] = `/systemusers(${input.manager2Id})`;
  }

  if (id) {
    const result = await Cfm_slasService.update(id, recordData as never);
    if (!result.success) throw result.error || new Error("Failed to update cfm_sla record.");
  } else {
    recordData.statuscode = 1;
    const result = await Cfm_slasService.create(recordData as never);
    if (!result.success) throw result.error || new Error("Failed to create cfm_sla record.");
  }
}

/** Activates/deactivates an SLA rule — mirrors toggleSlaConfigStatus(). */
export async function toggleSlaRuleStatus(id: string, makeActive: boolean): Promise<void> {
  const result = await Cfm_slasService.update(id, {
    statecode: makeActive ? 0 : 1,
    statuscode: makeActive ? 1 : 2,
  } as never);
  if (!result.success) throw result.error || new Error("Failed to update cfm_sla status.");
}

/** Deletes an SLA rule — mirrors proceedDeleteSlaConfig(). */
export async function deleteSlaRule(id: string): Promise<void> {
  await Cfm_slasService.delete(id);
}

// ── SLA Tracking (Live) ──

interface RawSlaTrackingRow {
  cfm_slatrackingid: string;
  cfm_slatrackingname?: string;
  cfm_startdate?: string;
  cfm_deadline?: string;
  cfm_statussla?: number;
  cfm_warningsent?: boolean;
  cfm_warningdate?: string;
  cfm_escalated?: boolean;
  cfm_escalateddate?: string;
  cfm_breacheddate?: string;
  cfm_completeddate?: string;
  _cfm_sla_value?: string;
}

/** Loads live SLA tracking records — mirrors loadSlaTrackingList(). */
export async function fetchSlaTrackingList(): Promise<SlaTrackingRecord[]> {
  const result = await Cfm_slatrackingsService.getAll({
    select: [
      "cfm_slatrackingid",
      "cfm_slatrackingname",
      "cfm_startdate",
      "cfm_deadline",
      "cfm_statussla",
      "cfm_warningsent",
      "cfm_warningdate",
      "cfm_escalated",
      "cfm_escalateddate",
      "cfm_breacheddate",
      "cfm_completeddate",
      "cfm_actualresponsehours",
      ...(SLA_LOOKUPS_ENABLED ? ["_cfm_sla_value"] : []),
    ],
    orderBy: ["cfm_deadline asc"],
    top: 200,
  } as never);

  if (!result.success) {
    throw result.error || new Error("Failed to fetch cfm_slatracking records.");
  }

  const rows = (result.data ?? []) as RawSlaTrackingRow[];

  const slaIds = Array.from(new Set(rows.map((r) => r._cfm_sla_value).filter((v): v is string => !!v)));
  let actionBySlaId: Record<string, string> = {};
  if (slaIds.length > 0) {
    const slaResult = await Cfm_slasService.getAll({
      select: ["cfm_slaid", "cfm_action"],
      filter: slaIds.map((id) => `cfm_slaid eq ${id}`).join(" or "),
      top: slaIds.length,
    } as never);
    actionBySlaId = Object.fromEntries(
      ((slaResult.data ?? []) as { cfm_slaid?: string; cfm_action?: string }[]).map((s) => [
        s.cfm_slaid || "",
        s.cfm_action || "-",
      ]),
    );
  }

  return rows.map((r) => ({
    id: r.cfm_slatrackingid,
    name: r.cfm_slatrackingname || "-",
    action: (r._cfm_sla_value && actionBySlaId[r._cfm_sla_value]) || "-",
    startDate: r.cfm_startdate || null,
    deadline: r.cfm_deadline || null,
    statusRaw: r.cfm_statussla ?? null,
    warningSent: !!r.cfm_warningsent,
    warningDate: r.cfm_warningdate || null,
    escalated: !!r.cfm_escalated,
    escalatedDate: r.cfm_escalateddate || null,
    breachedDate: r.cfm_breacheddate || null,
    completedDate: r.cfm_completeddate || null,
  }));
}

/**
 * Derives a display status from the record's own flags/dates rather than
 * only trusting cfm_statussla — mirrors computeSlaTrackingStatus().
 */
export function computeSlaTrackingStatus(r: SlaTrackingRecord): SlaTrackingStatus {
  if (r.completedDate) return "completed";
  if (r.breachedDate) return "breached";
  if (r.escalated) return "escalated";
  const now = new Date();
  const deadline = r.deadline ? new Date(r.deadline) : null;
  if (deadline && now > deadline) return "breached";
  if (r.warningSent) return "warning";
  return "ontrack";
}

/** Formats a tracking date — mirrors formatSlaTrackingDate(). */
export function formatSlaTrackingDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Formats time left/overdue until a deadline — mirrors formatTimeLeft(). */
export function formatTimeLeft(deadlineStr: string | null): string {
  if (!deadlineStr) return "-";
  const deadline = new Date(deadlineStr);
  if (isNaN(deadline.getTime())) return "-";
  const diffMs = deadline.getTime() - Date.now();
  const absHours = Math.abs(diffMs) / (1000 * 60 * 60);
  const hours = Math.floor(absHours);
  const mins = Math.round((absHours - hours) * 60);
  const label = `${hours}h ${mins}m`;
  return diffMs >= 0 ? `${label} left` : `${label} overdue`;
}
