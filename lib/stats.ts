import type { Operator } from "./types";
import type { MonthPoint } from "./monthly";
import { linkFromWei } from "./format";

// UTC "YYYY-MM" for a unix-seconds timestamp — used to identify the current,
// still-incomplete month so trends compare only finished months.
export function ymFromTs(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}`;
}

export type OperatorStats = {
  sharePct: number; // share of total active network revenue
  avgPerMonthLink: number; // mean revenue (LINK) across active months
  monthsActive: number; // months with at least one payment
  directPct: number; // direct treasury share of this operator's total
  momPct: number | null; // last complete month vs the one before (%)
  momentumPct: number | null; // last 3 complete months vs prior 3 (%)
  peak: MonthPoint | null; // highest-revenue month
  firstYm: string | null;
  lastYm: string | null;
};

function pctChange(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  return ((cur - prev) / prev) * 100;
}

// Derived per-operator metrics. `months` is the operator's ascending monthly
// series; `nowTs` marks "now" so the current partial month is excluded from
// trend math. `networkTotalWei` is the summed total across all active operators.
export function operatorStats(
  operator: Operator,
  months: MonthPoint[],
  networkTotalWei: string,
  nowTs: number,
): OperatorStats {
  const total = linkFromWei(operator.totalLink);
  const net = linkFromWei(networkTotalWei);
  const monthsActive = months.length;

  const peak = months.reduce<MonthPoint | null>(
    (b, m) => (!b || linkFromWei(m.total) > linkFromWei(b.total) ? m : b),
    null,
  );

  const currentYm = ymFromTs(nowTs);
  const complete = months.filter((m) => m.ym < currentYm);
  const tot = (m: MonthPoint) => linkFromWei(m.total);

  let momPct: number | null = null;
  if (complete.length >= 2) {
    momPct = pctChange(
      tot(complete[complete.length - 1]),
      tot(complete[complete.length - 2]),
    );
  }

  let momentumPct: number | null = null;
  if (complete.length >= 6) {
    const last3 = complete.slice(-3).reduce((s, m) => s + tot(m), 0);
    const prior3 = complete.slice(-6, -3).reduce((s, m) => s + tot(m), 0);
    momentumPct = pctChange(last3, prior3);
  }

  const avgPerMonth = monthsActive > 0 ? total / monthsActive : 0;

  return {
    sharePct: net > 0 ? (total / net) * 100 : 0,
    avgPerMonthLink: avgPerMonth,
    monthsActive,
    directPct:
      total > 0 ? (linkFromWei(operator.direct) / total) * 100 : 0,
    momPct,
    momentumPct,
    peak,
    firstYm: months[0]?.ym ?? null,
    lastYm: months[months.length - 1]?.ym ?? null,
  };
}

export type NetworkStats = {
  count: number;
  avgTotalWei: string; // mean all-time total per operator
  medianTotalWei: string; // median all-time total per operator
  avg30Wei: string; // mean last-30d revenue per operator
  top5Pct: number; // share of total held by the top 5 operators
  momPct: number | null; // network-wide last complete month vs the prior one
};

// Network-level metrics across all active operators.
export function networkStats(
  operators: Operator[],
  monthlyTotals: MonthPoint[],
  totalWei: string,
  nowTs: number,
): NetworkStats {
  const n = operators.length || 1;
  const totals = operators
    .map((o) => BigInt(o.totalLink))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const median =
    totals.length === 0
      ? 0n
      : totals.length % 2
        ? totals[(totals.length - 1) / 2]
        : (totals[totals.length / 2 - 1] + totals[totals.length / 2]) / 2n;

  const sum30 = operators.reduce((s, o) => s + BigInt(o.last30), 0n);
  const total = BigInt(totalWei);
  const top5 = operators.slice(0, 5).reduce((s, o) => s + BigInt(o.totalLink), 0n);

  const currentYm = ymFromTs(nowTs);
  const complete = monthlyTotals.filter((m) => m.ym < currentYm);
  let momPct: number | null = null;
  if (complete.length >= 2) {
    momPct = pctChange(
      linkFromWei(complete[complete.length - 1].total),
      linkFromWei(complete[complete.length - 2].total),
    );
  }

  return {
    count: operators.length,
    avgTotalWei: (total / BigInt(n)).toString(),
    medianTotalWei: median.toString(),
    avg30Wei: (sum30 / BigInt(n)).toString(),
    top5Pct: total > 0n ? Number((top5 * 10000n) / total) / 100 : 0,
    momPct,
  };
}
