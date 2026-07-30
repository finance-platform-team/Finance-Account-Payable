// ─────────────────────────────────────────────────────────────────────────
// AP Aging — types
// Mirrors the shape of cfm_finance_ap records as actually selected by
// fetchAPAgingData() in CFM_APNew.html (NOT the full table schema — only
// the fields the legacy $select actually pulls).
// ─────────────────────────────────────────────────────────────────────────

/** Raw cfm_finance_ap fields used by the AP Aging screen. */
export interface ApAgingRow {
  cfm_finance_apid: string;
  cfm_vendorenglishname?: string;
  cfm_bushortname?: string;
  cfm_openingbalance?: number;
  cfm_originalpayablevoucheramount?: number;
  cfm_totaldeductions?: number;
  cfm_totalpayment?: number;
  cfm_notallocatedpayment?: number;
  cfm_dueamount?: number;
  cfm_notdue?: number;
  cfm_jan?: number; // 1–30 days bucket (legacy field name)
  cfm_60?: number; // 31–60 days
  cfm_90?: number; // 61–90 days
  cfm_120?: number; // 91–120 days
  cfm_150?: number; // 121–150 days
  cfm_above150?: number; // 150+ days
}

/** "Group" filter — matches #ap-group-filter (EGY | KSA). */
export type ApAgingGroup = "EGY" | "KSA";

/** "Aging Bracket" local filter — matches #ap-aging-bracket-filter. */
export type ApAgingBracket =
  | "All"
  | "Current"
  | "1-30"
  | "31-60"
  | "61-90"
  | "90+";

/** "Supplier Tier" local filter — matches #ap-tier-filter.
 *  NOTE: cfm_finance_ap never actually carries a tier field (see
 *  apFilterLocal in the legacy HTML — it falls back to "Normal Vendor"
 *  for every row). Kept here only so the filter UI can exist; it will
 *  never exclude a row differently than "All" in practice. */
export type ApAgingTier = "All" | string;

export interface ApAgingFilters {
  group: ApAgingGroup;
  vendorSearch: string;
  tier: ApAgingTier;
  bracket: ApAgingBracket;
}

/** A vendor staged for "Send to Plan" — matches apStagedVendors[vKey] shape. */
export interface StagedApVendor {
  vendorName: string;
  subLedgerCode: string; // always "-" from Aging (legacy dead field); resolved later via cfm_insurancecompany
  bu: string;
  supplierTier: string; // always "Normal Vendor" (legacy dead field fallback)
  dueAmount: number;
  initialAmount: number;
  raw: ApAgingRow;
}

/** Keyed staging map, keyed by `${vendorName}||${bu}` — matches getVendorKey(). */
export type StagedApVendorMap = Record<string, StagedApVendor>;

export const AP_PER_PAGE = 15;