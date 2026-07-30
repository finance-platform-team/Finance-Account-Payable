// src/lib/CurrentUserContext.tsx

/* ════════════════════════════════════════
   CURRENT USER — Identity + Role Resolution
   Uses the Code App SDK's official getContext() (@microsoft/power-apps/app)
   to resolve the signed-in user's Azure AD object id, joins it to the
   matching Dataverse systemuserid (via azureactivedirectoryobjectid — the
   two ids are otherwise unrelated GUIDs), then looks up their role(s) in
   cfm_rolesecurity — mirrors applyRoleSecurity() in CFM_APNew.html, adapted
   to this app's PageKey-based navigation instead of hiding/showing DOM
   elements by id.
════════════════════════════════════════ */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getContext } from "@microsoft/power-apps/app";
import { fetchRolesForUser, resolveSystemUserId } from "./roleAccessService";
import { ROLE_MENU_MAP, canonicalRole } from "../types/roleAccess";

interface CurrentUserState {
  loading: boolean;
  /** Dataverse systemuserid (NOT the Azure AD object id) — used everywhere else in the app (e.g. _cfm_user_value lookups). */
  objectId: string | null;
  fullName: string | null;
  userPrincipalName: string | null;
  /** Raw cfm_role text values assigned to this user (can be more than one). */
  rawRoles: string[];
  /** Canonical short codes (AP/TREASURY/SC/CFO/FD) — mirrors currentUserRoles[] in the original. */
  canonicalRoles: Set<string>;
  /** Union of PageKey strings this user is allowed to see, across all their roles. */
  allowedPages: Set<string>;
  /** True once resolved and the user has zero cfm_rolesecurity rows. */
  noAccess: boolean;
  error: string | null;
  /** Mirrors hasRole() — checks a canonical code like "AP", "SC", "TREASURY". */
  hasRole: (canonical: string) => boolean;
}

const NO_ACCESS_STATE_BASE = {
  loading: false,
  allowedPages: new Set<string>(),
  canonicalRoles: new Set<string>(),
  noAccess: true,
  hasRole: () => false,
} as const;

const INITIAL_STATE: CurrentUserState = {
  loading: true,
  objectId: null,
  fullName: null,
  userPrincipalName: null,
  rawRoles: [],
  canonicalRoles: new Set(),
  allowedPages: new Set(),
  noAccess: false,
  error: null,
  hasRole: () => false,
};

const CurrentUserContext = createContext<CurrentUserState>(INITIAL_STATE);

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CurrentUserState>(INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const ctx = await getContext();
        const azureObjectId = ctx.user?.objectId || null;
        const fullName = ctx.user?.fullName || null;
        const userPrincipalName = ctx.user?.userPrincipalName || null;

        console.log("CURRENT USER DEBUG:", { azureObjectId, fullName, userPrincipalName });

        if (!azureObjectId) {
          if (!cancelled) {
            setState({
              ...NO_ACCESS_STATE_BASE,
              objectId: null,
              fullName,
              userPrincipalName,
              rawRoles: [],
              error: "Could not resolve the current user's identity.",
            });
          }
          return;
        }

        // Join Azure AD identity -> Dataverse systemuserid, since
        // cfm_rolesecurity's user lookup points at the systemuser record,
        // not the Azure AD object id directly.
        const objectId = await resolveSystemUserId(azureObjectId);
        console.log("RESOLVED SYSTEMUSERID DEBUG:", objectId);

        if (!objectId) {
          if (!cancelled) {
            setState({
              ...NO_ACCESS_STATE_BASE,
              objectId: null,
              fullName,
              userPrincipalName,
              rawRoles: [],
              error: "Could not find a matching Dataverse user record.",
            });
          }
          return;
        }

        const rawRoles = await fetchRolesForUser(objectId);
        console.log("CURRENT USER ROLES DEBUG:", rawRoles);

        const allowedPages = new Set<string>();
        const canonicalRoles = new Set<string>();
        rawRoles.forEach((r) => {
          (ROLE_MENU_MAP[r] || []).forEach((p) => allowedPages.add(p));
          const canon = canonicalRole(r);
          if (canon) canonicalRoles.add(canon);
        });

        if (!cancelled) {
          setState({
            loading: false,
            objectId,
            fullName,
            userPrincipalName,
            rawRoles,
            canonicalRoles,
            allowedPages,
            noAccess: rawRoles.length === 0,
            error: null,
            hasRole: (canonical: string) => canonicalRoles.has(canonical),
          });
        }
      } catch (e) {
        console.error("Error resolving current user / role security:", e);
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            noAccess: true,
            error: "Failed to load role security.",
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <CurrentUserContext.Provider value={state}>
      {children}
    </CurrentUserContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCurrentUser(): CurrentUserState {
  return useContext(CurrentUserContext);
}