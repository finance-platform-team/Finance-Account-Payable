// أنواع بيانات الجدولين اللي جايين من Dataverse

export interface CfmCashFlowCategory {
  cfm_name: string;
  cfm_cashdirection: "Cash In" | "Cash Out" | string;
  cfm_amount: number;
  cfm_cash_flow_category: string;
  cfm_cashflowactivity:
    | "Operating Activities"
    | "Investing Activities"
    | "Financing Activities"
    | string;
  cfm_date: string;
  // حقول محسوبة محليًا (زي الأصلي)
  _parsedYear?: number;
  _parsedMonth?: number;
  _parsedMonthLabel?: string;
  _country?: string;
}

export interface CfmCashFlowNetMeasures {
  cfm_name: string;
  cfm_month: string;
  cfm_beginningbalance: number | null;
  cfm_endingbalancecf: number | null;
  cfm_netoperationin: number | null;
  cfm_netoperationout: number | null;
  cfm_netinvestingactivities: number | null;
  cfm_netfinancingactivities: number | null;
  cfm_financingactivitiesin: number | null;
  cfm_financingactivitiesout: number | null;
  cfm_investingactivitiesin: number | null;
  cfm_investingactivitiesout: number | null;
  _parsedYear?: number;
  _parsedMonth?: number;
  _parsedMonthLabel?: string;
  _country?: string;
}

export interface AggregatedMeasures {
  beginningBalance: number;
  endingBalance: number;
  netOperating: number;
  netInvesting: number;
  netFinancing: number;
}

export interface CFSLineItem {
  category: string;
  amount: number;
}