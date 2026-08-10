import { useEffect, useState } from "react";
import { Cfm_revenuetargetsService } from "../generated/services/Cfm_revenuetargetsService";
import { MONTH_NAMES } from "../lib/cashflowUtils";

interface RevenueSummaryBarProps {
  year: string;
  month: string;
  bu: string;
  availableBUs: string[];
}

interface RevenueRow {
  cfm_bushortname?: string;
  cfm_monthname?: string;
  cfm_paymenttype?: string;
  cfm_totalrevenue?: number;
  cfm_revenuetarget?: number;
}

const fmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function RevenueSummaryBar({
  year,
  month,
  bu,
  availableBUs,
}: RevenueSummaryBarProps) {
  const [allTargets, setAllTargets] = useState<RevenueRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await Cfm_revenuetargetsService.getAll({
          select: [
            "cfm_bushortname",
            "cfm_monthname",
            "cfm_paymenttype",
            "cfm_totalrevenue",
            "cfm_revenuetarget",
          ],
        });
        if (!cancelled) {
          setAllTargets((res.data || []) as unknown as RevenueRow[]);
        }
      } catch (err) {
        console.error("فشل تحميل بيانات الإيرادات:", err);
        if (!cancelled) setAllTargets([]);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (allTargets === null) return null;
  if (allTargets.length === 0) return null;

  const monthFullName = month !== "All" ? MONTH_NAMES[Number(month)] : "All Months";

  const filtered = allTargets.filter((r) => {
    if (bu !== "All") {
      if (r.cfm_bushortname !== bu) return false;
    } else if (availableBUs.length > 0) {
      if (!r.cfm_bushortname || !availableBUs.includes(r.cfm_bushortname)) return false;
    }

    if (!r.cfm_monthname) {
      if (year !== "All" || month !== "All") return false;
    } else {
      const parts = r.cfm_monthname.split(" ");
      const rMonth = parts[0];
      const rYear = parts[1];

      if (monthFullName !== "All Months" && month !== "All") {
        if (rMonth !== monthFullName) return false;
      }
      if (year !== "All") {
        if (rYear !== year) return false;
      }
    }
    return true;
  });

  let cashRev = 0;
  let creditRev = 0;
  let targetRevTotal = 0;

  filtered.forEach((r) => {
    if (r.cfm_paymenttype === "Cash") {
      cashRev += Number(r.cfm_totalrevenue || 0);
    } else if (r.cfm_paymenttype === "Credit") {
      creditRev += Number(r.cfm_totalrevenue || 0);
    }
    targetRevTotal += Number(r.cfm_revenuetarget || 0);
  });

  const totalRev = cashRev + creditRev;
  const defSurp = totalRev - targetRevTotal;
  const pct = targetRevTotal > 0 ? Math.round((totalRev / targetRevTotal) * 100) : 0;

  return (
    <div className="revenue-summary-bar">
      <div className="rev-left">
        <div className="rev-row">
          <div className="rev-label">Cash Rev</div>
          <div className="rev-value pos">
            {fmt.format(cashRev)}
          </div>
        </div>
        <div className="rev-row">
          <div className="rev-label">Credit Rev</div>
          <div className="rev-value pos">
            {fmt.format(creditRev)}
          </div>
        </div>
        <div className="rev-row rev-row-total">
          <div>Total Rev</div>
          <div>
            {fmt.format(totalRev)}
          </div>
        </div>
        <div className="rev-row rev-row-total">
          <div>DEF / SURP</div>
          <div className={defSurp >= 0 ? "pos" : "neg"}>
            {fmt.format(Math.abs(defSurp))}
          </div>
        </div>
      </div>
      <div className="rev-right">
        <div className="rev-right-label">Target Rev</div>
        <div className="rev-right-value">
          {fmt.format(targetRevTotal)}
        </div>
        <div className="rev-right-sub">actual vs target {pct}%</div>
      </div>
    </div>
  );
} 