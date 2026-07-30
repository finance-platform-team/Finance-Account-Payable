// src/types/roleAccess.ts

/* ════════════════════════════════════════
   ROLE ACCESS CONFIGURATION — Types
   Table: cfm_rolesecurity (LogicalName) / cfm_rolesecurities (EntitySetName)
   Source of truth: CFM_APNew.html — loadRoleAccessList(), saveRoleAccess()
════════════════════════════════════════ */

/** The 5 fixed role values — MUST match the <select> options in the original exactly. */
export const ROLE_OPTIONS = [
  "Treasury",
  "AP",
  "SC / HR Head",
  "CFO",
  "Finance Director",
] as const;
export type RoleOption = (typeof ROLE_OPTIONS)[number];

/** A row in the Role Access list — mirrors loadRoleAccessList()'s mapping. */
export interface RoleAccessRecord {
  id: string;
  userId: string;
  userName: string;
  role: string;
}

/** A matched user from the search-as-you-type lookup — mirrors searchRoleAccessUsers(). */
export interface UserSearchResult {
  id: string;
  fullname: string;
}/* ════════════════════════════════════════
   ROLE → MENU MAPPING
   Mirrors roleMenuMap / canonicalRole() / applyRoleSecurity() in
   CFM_APNew.html. Keys are the raw cfm_role text values as stored in
   cfm_rolesecurity; values are our app's PageKey strings (kept as plain
   strings here to avoid a circular import with Sidebar.tsx).
════════════════════════════════════════ */

/** Raw role text -> list of PageKey strings that role can see. */
export const ROLE_MENU_MAP: Record<string, string[]> = {
  Treasury: ["treasury", "adv"],
  AP: ["ap", "pp", "adv"],
  "SC / HR Head": ["pp-sc", "adv"],
  "SC/HR Head": ["pp-sc", "adv"],
  SC: ["pp-sc", "adv"],
  HR: ["pp-sc", "adv"],
  CFO: ["cfs", "tms"],
  "Finance Director": ["cfs", "tms"],
};

/** Raw role text -> canonical short code — mirrors canonicalRole(). */
export function canonicalRole(rawRole: string | null | undefined): string | null {
  const r = (rawRole || "").trim().toLowerCase();
  if (r === "ap") return "AP";
  if (r === "treasury") return "TREASURY";
  if (r === "sc / hr head" || r === "sc/hr head" || r === "sc" || r === "hr") return "SC";
  if (r === "cfo") return "CFO";
  if (r === "finance director") return "FD";
  return null;
}