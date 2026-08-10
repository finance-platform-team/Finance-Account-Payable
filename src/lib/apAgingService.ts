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
  const set = new Set<string>();
  let skipToken: string | undefined;

  do {
    const result = await Cfm_finance_apsService.getAll({
      select: ["cfm_bushortname"],
      maxPageSize: 5000,
      skipToken,
    });
    (result.data ?? []).forEach((r: any) => {
      if (r.cfm_bushortname) set.add(r.cfm_bushortname);
    });
    skipToken = result.skipToken;
  } while (skipToken);

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
 *
 * `Cfm_finance_apsService.getAll()` only returns a single Dataverse page
 * (capped at maxPageSize) despite its name — it hands back a `skipToken`
 * for the next page but never follows it. For a broad filter like "All
 * Egypt" (AMH+ASH+SMH combined) the match set can exceed one page, so we
 * loop on skipToken here until Dataverse stops returning one, otherwise
 * later pages of vendors are silently dropped before the client-side
 * Aging Bracket filter even runs.
 */
export async function fetchApAgingRows(
  group: ApAgingGroup,
  vendorSearch: string,
  bu?: string,
): Promise<ApAgingRow[]> {
  const filter = buildApAgingFilter(group, vendorSearch, bu);

  const rows: ApAgingRow[] = [];
  let skipToken: string | undefined;

  do {
    const result = await Cfm_finance_apsService.getAll({
      select: AP_AGING_SELECT,
      filter,
      maxPageSize: 5000,
      skipToken,
    });

    rows.push(...((result.data ?? []) as unknown as ApAgingRow[]));
    skipToken = result.skipToken;
  } while (skipToken);

  return rows;
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
}import { Cfm_paymentplansService } from "../generated/services/Cfm_paymentplansService";
import { Cfm_insurancecompaniesService } from "../generated/services/Cfm_insurancecompaniesService";

// ─────────────────────────────────────────────────────────────────────────
// Raw row shapes for the lookups below
// ─────────────────────────────────────────────────────────────────────────
interface RawInsuranceCompanyMatch {
  cfm_insurancecompanyid?: string;
  cfm_name?: string;
  cfm_code?: string;
}

interface RawExistingPlan {
  cfm_paymentplanid?: string;
}

export interface SendToPlanResult {
  created: number;
  updated: number;
  errors: string[]; // vendor names that failed
}

/**
 * Sends staged AP Aging vendors to the Payment Plan — mirrors
 * proceedSendToPlan() exactly:
 *  1. For each vendor, look up cfm_insurancecompany by code OR name to get
 *     the real company id/name/code.
 *  2. Check whether a cfm_paymentplan already exists for that company
 *     (matched by plancode OR companyname).
 *  3. Create it (or update it) with cfm_paymentplanstatus reset to 1
 *     (AP Draft).
 * Continues past a single vendor's failure (matching the original's
 * per-item try/catch), collecting error vendor names instead of aborting.
 */
export async function sendStagedVendorsToPlan(
  planData: StagedApVendor[],
): Promise<SendToPlanResult> {
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const v of planData) {
    try {
      // 1. Match cfm_insurancecompany by code or name.
      let companyId: string | null = null;
      let companyName = v.vendorName;
      let companyCode = v.subLedgerCode;

      const compFilterParts: string[] = [];
      if (v.subLedgerCode && v.subLedgerCode !== "-") {
        compFilterParts.push(`cfm_code eq '${v.subLedgerCode.replace(/'/g, "''")}'`);
      }
      if (v.vendorName && v.vendorName !== "-") {
        compFilterParts.push(`cfm_name eq '${v.vendorName.replace(/'/g, "''")}'`);
      }

      if (compFilterParts.length > 0) {
        try {
          const compResult = await Cfm_insurancecompaniesService.getAll({
            select: ["cfm_insurancecompanyid", "cfm_name", "cfm_code"],
            filter: compFilterParts.join(" or "),
            top: 1,
          } as never);
          const compRows = (compResult.data ?? []) as RawInsuranceCompanyMatch[];
          if (compRows.length > 0) {
            const matched = compRows[0];
            companyId = matched.cfm_insurancecompanyid || null;
            if (matched.cfm_name) companyName = matched.cfm_name;
            if (matched.cfm_code) companyCode = matched.cfm_code;
          }
        } catch (compErr) {
          console.warn(`Failed to lookup insurance company for ${v.vendorName}`, compErr);
        }
      }

      // 2. Check for an existing Payment Plan for this company.
      let existingId: string | null = null;
      const planFilterParts: string[] = [];
      if (companyCode && companyCode !== "-") {
        planFilterParts.push(`cfm_plancode eq '${companyCode.replace(/'/g, "''")}'`);
      }
      if (companyName && companyName !== "-") {
        planFilterParts.push(`cfm_companyname eq '${companyName.replace(/'/g, "''")}'`);
      }

      if (planFilterParts.length > 0) {
        try {
          const planResult = await Cfm_paymentplansService.getAll({
            select: ["cfm_paymentplanid"],
            filter: planFilterParts.join(" or "),
            top: 1,
          } as never);
          const planRows = (planResult.data ?? []) as RawExistingPlan[];
          if (planRows.length > 0) {
            existingId = planRows[0].cfm_paymentplanid || null;
          }
        } catch (planLookupErr) {
          console.warn("Failed to check existing payment plan record:", planLookupErr);
        }
      }

      // 3. Build the record and create/update.
      const recordData: Record<string, unknown> = {
        cfm_plancode: companyCode || "-",
        cfm_initialamount: v.initialAmount,
        cfm_amount: v.initialAmount,
        cfm_companyname: companyName,
        cfm_bu: v.bu || "-",
        cfm_paymentplanstatus: 1, // Reset status to AP Draft
      };

      if (companyId) {
        recordData["cfm_CompanyCode@odata.bind"] = `/cfm_insurancecompanies(${companyId})`;
      }

      if (existingId) {
        await Cfm_paymentplansService.update(existingId, recordData as never);
        updated++;
      } else {
        await Cfm_paymentplansService.create(recordData as never);
        created++;
      }
    } catch (e) {
      console.error(`Failed to process plan line for ${v.vendorName}`, e);
      errors.push(v.vendorName);
    }
  }

  return { created, updated, errors };
}