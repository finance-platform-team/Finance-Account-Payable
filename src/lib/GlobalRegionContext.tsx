// src/lib/GlobalRegionContext.tsx

/* ════════════════════════════════════════
   GLOBAL REGION — asked once on first load (persisted in localStorage),
   changeable anytime from the sidebar dropdown. Drives the DEFAULT region
   for Cash Flow Statement's Group filter, Budget Request, and Treasury
   Budget. Stored value convention matches cfm_requestbudget's Region
   choice text ("Egypt" | "KSA") — mirrors CFM_APNew.html's
   GLOBAL_REGION_STORAGE_KEY / promptGlobalRegionIfNeeded() /
   setGlobalRegion() / applyGlobalRegionToCurrentScreen().
════════════════════════════════════════ */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { BudgetRegion } from "../types/apBudgetRequest";

const STORAGE_KEY = "cfm-global-region";

/** Bridges the "Egypt"/"KSA" convention to the "EGY"/"KSA" convention used by Cash Flow Statement's Group filter. */
// eslint-disable-next-line react-refresh/only-export-components
export function regionToGroupCode(region: BudgetRegion): string {
  return region === "Egypt" ? "EGY" : "KSA";
}

interface GlobalRegionContextValue {
  globalRegion: BudgetRegion | null;
  setGlobalRegion: (region: BudgetRegion) => void;
}

const GlobalRegionContext = createContext<GlobalRegionContextValue | undefined>(undefined);

function readStored(): BudgetRegion | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "Egypt" || saved === "KSA" ? saved : null;
  } catch (e) {
    console.warn("localStorage unavailable for Global Region:", e);
    return null;
  }
}

export function GlobalRegionProvider({ children }: { children: ReactNode }) {
  const [globalRegion, setGlobalRegionState] = useState<BudgetRegion | null>(() => readStored());

  function setGlobalRegion(region: BudgetRegion) {
    setGlobalRegionState(region);
    try {
      localStorage.setItem(STORAGE_KEY, region);
    } catch (e) {
      console.warn("Could not persist Global Region to localStorage:", e);
    }
  }

  return (
    <GlobalRegionContext.Provider value={{ globalRegion, setGlobalRegion }}>
      {children}
      {globalRegion === null && <GlobalRegionModal onChoose={setGlobalRegion} />}
    </GlobalRegionContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useGlobalRegion(): GlobalRegionContextValue {
  const ctx = useContext(GlobalRegionContext);
  if (!ctx) throw new Error("useGlobalRegion must be used within GlobalRegionProvider");
  return ctx;
}

/**
 * Mandatory first-load choice modal — no close button, backdrop click
 * disabled — mirrors modal-global-region in CFM_APNew.html.
 */
function GlobalRegionModal({ onChoose }: { onChoose: (region: BudgetRegion) => void }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // NOTE: renders at the app root (outside any page's .cfs-root), but all
  // of .modal-overlay/.modal-box/.modal-hdr/etc.'s CSS in
  // CashFlowStatement.css is scoped ".cfs-root .modal-*" — so this needs
  // its own .cfs-root wrapper for that CSS to apply at all (without it,
  // the overlay has no position/z-index and just renders as plain inline
  // content at the bottom of the page).
  return (
    <div className="cfs-root">
      <div className="modal-overlay active">
        <div className="modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-hdr">
            <div>
              <div className="modal-title">Select Your Region</div>
              <div className="modal-sub">This sets your default region across the app — you can change it anytime.</div>
            </div>
          </div>
          <div className="modal-body" style={{ display: "flex", gap: 12 }}>
            <button
              className="btn btn-outline"
              style={{ flex: 1, padding: "18px 12px", fontSize: 14, fontWeight: 700 }}
              onClick={() => onChoose("Egypt")}
            >
              Egypt
            </button>
            <button
              className="btn btn-outline"
              style={{ flex: 1, padding: "18px 12px", fontSize: 14, fontWeight: 700 }}
              onClick={() => onChoose("KSA")}
            >
              Saudi Arabia
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
