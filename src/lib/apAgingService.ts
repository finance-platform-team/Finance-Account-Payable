import { Cfm_finance_apsService } from "../generated/services/Cfm_finance_apsService";
import type {
  ApAgingRow,
  ApAgingBracket,
  ApAgingGroup,
  ApAgingTier,
  StagedApVendor,
} from "../types/apAging";

// ─────────────────────────────────────────────────────────────────────────
// $select — exact match to the `fields` array built in fetchAPAgingData()
// in CFM_APNew.html. Do NOT add cfm_suppliertier / cfm_subledgercode /
// cfm_vendorcode / cfm_vendorcriticality — those are never selected in the
// legacy code either (confirmed dead references, see chat history).
// ─────────────────────────────────────────────────────────────────────────
const AP_AGING_SELECT: string[] = [
  "cfm_finance_apid",
  "cfm_vendorenglishname",
  "cfm_bushortname",
  "cfm_openingbalance",
  "cfm_originalpayablevoucheramount",
  "cfm_totaldeductions",
  "cfm_totalpayment",
  "cfm_notallocatedpayment",
  "cfm_dueamount",
  "cfm_notdue",
  "cfm_jan",
  "cfm_60",
  "cfm_90",
  "cfm_120",
  "cfm_150",
  "cfm_above150",
];

// Egypt business units — matches the groupVal === "EGY" branch exactly.
const EGY_BU_SHORT_NAMES = ["AMH", "ASH", "SMH"];

// Fallback KSA business units — matches getAPBusinessUnitsAsync()'s ksaFallback,
// used only if the dynamic distinct-BU query returns nothing.
const KSA_BU_FALLBACK = [
  "AEH",
  "AES",
  "AHS",
  "AKW",
  "ALW",
  "ATS",
  "FWZ",
  "Ghernada",
  "HJH",
  "Heliopolis",
  "KSA_GEO",
  "SNB",
];

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Fetches the distinct list of cfm_bushortname values present in
 * cfm_finance_ap — mirrors getAPBusinessUnitsAsync()'s dynamic Dataverse
 * query (used to build the KSA chip list, since KSA has no fixed BU set).
 */
export async function fetchDistinctApBUs(): Promise<string[]> {
  const result = await Cfm_finance_apsService.getAll({
    select: ["cfm_bushortname"],
    maxPageSize: 5000,
  });
  const set = new Set<string>();
  (result.data ?? []).forEach((r: any) => {
    if (r.cfm_bushortname) set.add(r.cfm_bushortname);
  });
  return Array.from(set).sort();
}

/**
 * Returns the chip list for a given Group — mirrors getAPBusinessUnitsAsync():
 *  - EGY -> fixed ["AMH", "ASH", "SMH"]
 *  - KSA -> every distinct BU NOT in the EGY set (dynamic), falling back to
 *    the hardcoded KSA list if the dynamic query returns nothing.
 */
export async function fetchApBUChipsForGroup(
  group: ApAgingGroup,
): Promise<string[]> {
  if (group === "EGY") return [...EGY_BU_SHORT_NAMES];

  const all = await fetchDistinctApBUs();
  const ksaBUs = all.filter((bu) => !EGY_BU_SHORT_NAMES.includes(bu));
  return ksaBUs.length > 0 ? ksaBUs : [...KSA_BU_FALLBACK];
}

/**
 * Builds the OData $filter string for a Group + vendor-name search,
 * matching fetchAPAgingData()'s filter construction 1:1:
 *  - EGY  -> cfm_bushortname in (AMH, ASH, SMH)
 *  - KSA  -> cfm_bushortname not in (AMH, ASH, SMH)
 *  - vendor search -> contains(cfm_vendorenglishname, '...')
 *
 * If `bu` is provided (not "All"), it overrides the Group-based list and
 * filters to that single business unit instead — this is the BU-chip
 * filtering the user asked to make functional (the legacy HTML kept
 * selectedAPBU around but never wired it to the query).
 */
export function buildApAgingFilter(
  group: ApAgingGroup,
  vendorSearch: string,
  bu?: string,
): string | undefined {
  const filters: string[] = [];

  if (bu && bu !== "All") {
    filters.push(`cfm_bushortname eq '${escapeODataString(bu)}'`);
  } else if (group === "EGY") {
    filters.push(
      "(" +
        EGY_BU_SHORT_NAMES.map((b) => `cfm_bushortname eq '${b}'`).join(
          " or ",
        ) +
        ")",
    );
  } else if (group === "KSA") {
    filters.push(
      "(" +
        EGY_BU_SHORT_NAMES.map((b) => `cfm_bushortname ne '${b}'`).join(
          " and ",
        ) +
        ")",
    );
  }

  const trimmedSearch = vendorSearch.trim();
  if (trimmedSearch) {
    filters.push(
      `contains(cfm_vendorenglishname,'${escapeODataString(trimmedSearch)}')`,
    );
  }

  return filters.length > 0 ? filters.join(" and ") : undefined;
}

/**
 * Fetches AP Aging rows from cfm_finance_ap with server-side Group/BU +
 * search filtering — mirrors fetchAPAgingData(), extended with the BU-chip
 * override described above.
 */
export async function fetchApAgingRows(
  group: ApAgingGroup,
  vendorSearch: string,
  bu?: string,
): Promise<ApAgingRow[]> {
  const filter = buildApAgingFilter(group, vendorSearch, bu);

  const result = await Cfm_finance_apsService.getAll({
    select: AP_AGING_SELECT,
    filter,
    maxPageSize: 5000,
  });

  return (result.data ?? []) as unknown as ApAgingRow[];
}

/**
 * Client-side Tier + Aging Bracket filter — mirrors apFilterLocal().
 * Tier is always a no-op match against "Normal Vendor" because
 * cfm_finance_ap never actually carries a tier field (see ApAgingTier note).
 */
export function applyApAgingLocalFilters(
  rows: ApAgingRow[],
  tier: ApAgingTier,
  bracket: ApAgingBracket,
): ApAgingRow[] {
  return rows.filter((r) => {
    // Tier filter — legacy fallback is always "Normal Vendor" for every row.
    if (tier !== "All") {
      const vendorTier = "Normal Vendor";
      if (vendorTier !== tier) return false;
    }

    // Aging bracket filter — matches apFilterLocal's switch exactly.
    if (bracket !== "All") {
      switch (bracket) {
        case "Current":
          if (!r.cfm_notdue || Number(r.cfm_notdue) === 0) return false;
          break;
        case "1-30":
          if (!r.cfm_jan || Number(r.cfm_jan) === 0) return false;
          break;
        case "31-60":
          if (!r.cfm_60 || Number(r.cfm_60) === 0) return false;
          break;
        case "61-90":
          if (!r.cfm_90 || Number(r.cfm_90) === 0) return false;
          break;
        case "90+": {
          const v90 =
            Number(r.cfm_90 || 0) +
            Number(r.cfm_120 || 0) +
            Number(r.cfm_150 || 0) +
            Number(r.cfm_above150 || 0);
          if (v90 === 0) return false;
          break;
        }
      }
    }

    return true;
  });
}

/** Vendor identity key — mirrors getVendorKey(). */
export function getApAgingVendorKey(row: ApAgingRow): string {
  return `${row.cfm_vendorenglishname || ""}||${row.cfm_bushortname || ""}`;
}

/**
 * Builds the staged-vendor record for "Send to Plan" — mirrors the object
 * literal built in toggleAPAgingRow() / toggleAllAPAgingRows().
 */
export function buildStagedApVendor(row: ApAgingRow): StagedApVendor {
  return {
    vendorName: row.cfm_vendorenglishname || "-",
    subLedgerCode: "-", // legacy dead field; resolved via cfm_insurancecompany at Payment Plan send time
    bu: row.cfm_bushortname || "-",
    supplierTier: "Normal Vendor", // legacy dead field fallback
    dueAmount: Number(row.cfm_dueamount || 0),
    initialAmount: Number(row.cfm_dueamount || row.cfm_openingbalance || 0),
    raw: row,
  };
}