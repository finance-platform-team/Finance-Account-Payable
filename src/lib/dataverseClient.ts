import { Cfm_cashflowcategoriesService } from "../generated/services/Cfm_cashflowcategoriesService";
import { Cfm_cashflownetmeasuresesService } from "../generated/services/Cfm_cashflownetmeasuresesService";
import type { Cfm_cashflowcategories } from "../generated/models/Cfm_cashflowcategoriesModel";
import type { Cfm_cashflownetmeasureses } from "../generated/models/Cfm_cashflownetmeasuresesModel";
import type {
  CfmCashFlowCategory,
  CfmCashFlowNetMeasures,
} from "../types/cashflow";
import { enrichTransactions, enrichMeasures } from "./cashflowUtils";

const TRANSACTION_FIELDS = [
  "cfm_name",
  "cfm_cashdirection",
  "cfm_amount",
  "cfm_cash_flow_category",
  "cfm_cashflowactivity",
  "cfm_date",
];

const MEASURES_FIELDS = [
  "cfm_name",
  "cfm_month",
  "cfm_beginningbalance",
  "cfm_endingbalancecf",
  "cfm_netoperationin",
  "cfm_netoperationout",
  "cfm_netinvestingactivities",
  "cfm_netfinancingactivities",
  "cfm_financingactivitiesin",
  "cfm_financingactivitiesout",
  "cfm_investingactivitiesin",
  "cfm_investingactivitiesout",
];

export interface CFSFilters {
  year: string;
  month: string;
  group: string;
  bu: string;
}

// بيبني نص الفلتر $filter بنفس منطق الأصلي بالظبط
function buildFilters(f: CFSFilters, dateFieldName: "cfm_month" | "cfm_date") {
  const filters: string[] = [];

  if (f.year !== "All" && f.month !== "All") {
    const monthNum = Number(f.month) + 1;
    const formattedMonth = monthNum < 10 ? "0" + monthNum : String(monthNum);
    const isoDate = `${f.year}-${formattedMonth}-01T00:00:00Z`;
    filters.push(`${dateFieldName} eq ${isoDate}`);
  } else if (f.year !== "All") {
    const startYear = `${f.year}-01-01T00:00:00Z`;
    const endYear = `${f.year}-12-31T23:59:59Z`;
    filters.push(`${dateFieldName} ge ${startYear} and ${dateFieldName} le ${endYear}`);
  }

  if (f.bu !== "All") {
    filters.push(`cfm_name eq '${f.bu}'`);
  } else if (f.group !== "All") {
    if (f.group === "EGY") {
      filters.push("(cfm_name eq 'AMH' or cfm_name eq 'ASH' or cfm_name eq 'SMH')");
    } else {
      filters.push("(cfm_name ne 'AMH' and cfm_name ne 'ASH' and cfm_name ne 'SMH')");
    }
  }

  return filters.length > 0 ? filters.join(" and ") : undefined;
}

export async function fetchCashFlowData(filters: CFSFilters): Promise<{
  transactions: CfmCashFlowCategory[];
  measures: CfmCashFlowNetMeasures[];
}> {
  const filterT = buildFilters(filters, "cfm_date");
  const filterM = buildFilters(filters, "cfm_month");

  const [resT, resM] = await Promise.all([
    Cfm_cashflowcategoriesService.getAll({
      select: TRANSACTION_FIELDS,
      filter: filterT,
    }),
    Cfm_cashflownetmeasuresesService.getAll({
      select: MEASURES_FIELDS,
      filter: filterM,
    }),
  ]);

  const rawTransactions: Cfm_cashflowcategories[] = resT.data || [];
  const rawMeasures: Cfm_cashflownetmeasureses[] = resM.data || [];

  const transactions: CfmCashFlowCategory[] = rawTransactions.map((r) => ({
    cfm_name: (r.cfm_name as string) || "",
    cfm_cashdirection: (r.cfm_cashdirection as string) || "",
    cfm_amount:
      r.cfm_amount !== null && r.cfm_amount !== undefined
        ? Number(r.cfm_amount)
        : 0,
    cfm_cash_flow_category: (r.cfm_cash_flow_category as string) || "",
    cfm_cashflowactivity: (r.cfm_cashflowactivity as string) || "",
    cfm_date: (r.cfm_date as string) || "",
  }));

  const measures: CfmCashFlowNetMeasures[] = rawMeasures.map((r) => ({
    cfm_name: (r.cfm_name as string) || "",
    cfm_month: (r.cfm_month as string) || "",
    cfm_beginningbalance:
      r.cfm_beginningbalance !== null && r.cfm_beginningbalance !== undefined
        ? Number(r.cfm_beginningbalance)
        : null,
    cfm_endingbalancecf:
      r.cfm_endingbalancecf !== null && r.cfm_endingbalancecf !== undefined
        ? Number(r.cfm_endingbalancecf)
        : null,
    cfm_netoperationin:
      r.cfm_netoperationin !== null && r.cfm_netoperationin !== undefined
        ? Number(r.cfm_netoperationin)
        : null,
    cfm_netoperationout:
      r.cfm_netoperationout !== null && r.cfm_netoperationout !== undefined
        ? Number(r.cfm_netoperationout)
        : null,
    cfm_netinvestingactivities:
      r.cfm_netinvestingactivities !== null &&
      r.cfm_netinvestingactivities !== undefined
        ? Number(r.cfm_netinvestingactivities)
        : null,
    cfm_netfinancingactivities:
      r.cfm_netfinancingactivities !== null &&
      r.cfm_netfinancingactivities !== undefined
        ? Number(r.cfm_netfinancingactivities)
        : null,
    cfm_financingactivitiesin:
      r.cfm_financingactivitiesin !== null &&
      r.cfm_financingactivitiesin !== undefined
        ? Number(r.cfm_financingactivitiesin)
        : null,
    cfm_financingactivitiesout:
      r.cfm_financingactivitiesout !== null &&
      r.cfm_financingactivitiesout !== undefined
        ? Number(r.cfm_financingactivitiesout)
        : null,
    cfm_investingactivitiesin:
      r.cfm_investingactivitiesin !== null &&
      r.cfm_investingactivitiesin !== undefined
        ? Number(r.cfm_investingactivitiesin)
        : null,
    cfm_investingactivitiesout:
      r.cfm_investingactivitiesout !== null &&
      r.cfm_investingactivitiesout !== undefined
        ? Number(r.cfm_investingactivitiesout)
        : null,
  }));

  return {
    transactions: enrichTransactions(transactions),
    measures: enrichMeasures(measures),
  };
}