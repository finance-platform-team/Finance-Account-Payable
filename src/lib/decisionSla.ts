// src/lib/decisionSla.ts

/**
 * Computes the cfm_sla text value for a TMS decision task from its Start
 * and Due dates — mirrors the SLA calculation inside handleSendDecision()
 * in CFM_APNew.html (html:12884-12903): diffs in days are shown as hours
 * when <= 3 days, otherwise as days.
 */
export function computeDecisionSla(startIso: string, dueIso: string): string | undefined {
  try {
    const startParts = startIso.split("-").map(Number);
    const startDateObj = new Date(startParts[0], startParts[1] - 1, startParts[2]);
    const dueParts = dueIso.split("-").map(Number);
    const dueDateObj = new Date(dueParts[0], dueParts[1] - 1, dueParts[2]);
    startDateObj.setHours(0, 0, 0, 0);
    dueDateObj.setHours(0, 0, 0, 0);
    const diffDays = Math.round(
      (dueDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24),
    );
    return diffDays <= 3 ? diffDays * 24 + " h" : diffDays + " days";
  } catch {
    return undefined;
  }
}
