// src/lib/roleAccessService.ts

/* ════════════════════════════════════════
   ROLE ACCESS CONFIGURATION — Service
   Source of truth: CFM_APNew.html
     - loadRoleAccessList()   (line ~16834)
     - searchRoleAccessUsers() (line ~16965)
     - saveRoleAccess()       (line ~17041)
     - proceedDeleteRoleAccess() (line ~17122)
════════════════════════════════════════ */

import { Cfm_rolesecuritiesService } from "../generated/services/Cfm_rolesecuritiesService";
import { SystemusersService } from "../generated/services/SystemusersService";
import type { RoleAccessRecord, UserSearchResult } from "../types/roleAccess";

interface RawRoleSecurityRow {
  cfm_rolesecurityid: string;
  cfm_role?: string;
  _cfm_user_value?: string;
  "_cfm_user_value@OData.Community.Display.V1.FormattedValue"?: string;
}

interface RawSystemUserRow {
  systemuserid?: string;
  fullname?: string;
}

/**
 * Loads all Role Access assignments, ordered by role — mirrors
 * loadRoleAccessList()'s $orderby=cfm_role asc.
 */
export async function fetchRoleAccessList(): Promise<RoleAccessRecord[]> {
  const result = await Cfm_rolesecuritiesService.getAll({
    select: ["cfm_rolesecurityid", "cfm_role", "_cfm_user_value"],
    orderBy: ["cfm_role asc"],
    maxPageSize: 500,
    top: 1000,
  } as never);

  return (result.data ?? []).map((r: RawRoleSecurityRow) => ({
    id: r.cfm_rolesecurityid,
    userId: r._cfm_user_value || "",
    userName: r["_cfm_user_value@OData.Community.Display.V1.FormattedValue"] || "-",
    role: r.cfm_role || "-",
  }));
}

/**
 * Searches systemuser by fullname (contains) — mirrors searchRoleAccessUsers().
 * The caller is responsible for debouncing (300ms in the original).
 */
export async function searchUsersByName(term: string): Promise<UserSearchResult[]> {
  const result = await SystemusersService.getAll({
    select: ["fullname", "systemuserid"],
    filter: `contains(fullname,'${term.replace(/'/g, "''")}')`,
    top: 10,
  } as never);

  return (result.data ?? []).map((u: RawSystemUserRow) => ({
    id: u.systemuserid || "",
    fullname: u.fullname || "",
  }));
}

/**
 * Creates or updates a Role Access assignment — mirrors saveRoleAccess().
 * On update, the user lookup is only rebound if it actually changed
 * (matches the original's `existing.userId !== userId` check).
 */
export async function saveRoleAccess(
  id: string | null,
  userId: string,
  role: string,
  previousUserId?: string,
): Promise<void> {
  if (id) {
    const recordData: Record<string, unknown> = { cfm_role: role };
    if (previousUserId !== userId) {
      recordData["cfm_user@odata.bind"] = `/systemusers(${userId})`;
    }
    await Cfm_rolesecuritiesService.update(id, recordData as never);
  } else {
    await Cfm_rolesecuritiesService.create({
      cfm_role: role,
      "cfm_user@odata.bind": `/systemusers(${userId})`,
    } as never);
  }
}

/** Deletes a Role Access assignment — mirrors proceedDeleteRoleAccess(). */
export async function deleteRoleAccess(id: string): Promise<void> {
  await Cfm_rolesecuritiesService.delete(id);
}/**
 * Fetches every role assigned to a given systemuser id — a user can have
 * more than one cfm_rolesecurity row (mirrors applyRoleSecurity()'s
 * result.entities loop, which unions menus/roles across all matching rows).
 */
export async function fetchRolesForUser(userId: string): Promise<string[]> {
  if (!userId) return [];
  const result = await Cfm_rolesecuritiesService.getAll({
    select: ["cfm_role"],
    filter: `_cfm_user_value eq ${userId}`,
  } as never);
  return (result.data ?? [])
    .map((r: RawRoleSecurityRow) => r.cfm_role)
    .filter((r): r is string => !!r);
}
interface RawSystemUserIdRow {
  systemuserid?: string;
}

/**
 * Resolves the Dataverse systemuserid for the signed-in user, by matching
 * the Azure AD object id (from the Code App SDK's getContext()) against
 * systemuser.azureactivedirectoryobjectid — this is the correct join key;
 * the two ids are otherwise unrelated GUIDs.
 */
export async function resolveSystemUserId(azureObjectId: string): Promise<string | null> {
  if (!azureObjectId) return null;
  const result = await SystemusersService.getAll({
    select: ["systemuserid"],
    filter: `azureactivedirectoryobjectid eq '${azureObjectId}'`,
    top: 1,
  } as never);
  const rows = (result.data ?? []) as RawSystemUserIdRow[];
  return rows[0]?.systemuserid || null;
}