import type { EventTuple } from "./types";

// Earmark rewards land on a weekly cadence (almost always Tuesday). We forecast
// upcoming payments by projecting the operator's recent average weekly earmark
// onto the next payment dates, anchored to their last observed payment so the
// rhythm stays in phase (and this week isn't double-counted if it already paid).

const WEEK = 7 * 86400;

export type ForecastPoint = { ts: number; amount: string }; // wei

export type PaymentForecast = {
  weekday: number; // 0=Sun … most common earmark weekday (usually 2=Tue)
  weeklyAvg: string; // wei — recency-weighted mean of recent complete weeks
  weeklyLow: string; // wei — recent min
  weeklyHigh: string; // wei — recent max
  sampleWeeks: number; // how many complete weeks fed the average
  upcoming: ForecastPoint[]; // scheduled payments within the 30-day horizon
  total: string; // wei — sum of `upcoming` (next 30 days)
  horizonDays: number;
  eomTotal: string; // wei — payments through the end of the current month
  eomCount: number; // number of payments through end of month
  confident: boolean; // weekly rhythm + enough history
};

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Forecast an operator's earmark payments over the next `horizonDays`.
// `events` should be that operator's events; only earmark ('e') rows are used.
export function forecastPayments(
  events: EventTuple[],
  now: number,
  horizonDays = 30,
): PaymentForecast | null {
  const earmarks = events
    .filter((e) => e[4] === "e" && e[2] > 0)
    .sort((a, b) => a[2] - b[2]);
  if (earmarks.length < 4) return null;

  // Most common payment weekday (for display / sanity).
  const dow = new Array(7).fill(0);
  for (const e of earmarks) dow[new Date(e[2] * 1000).getUTCDay()]++;
  const weekday = dow.indexOf(Math.max(...dow));

  // Sum earmarks into fixed 7-day buckets → one total per payment week.
  const weekTotals = new Map<number, bigint>();
  for (const e of earmarks) {
    const b = Math.floor(e[2] / WEEK);
    weekTotals.set(b, (weekTotals.get(b) ?? 0n) + BigInt(e[1]));
  }

  // Complete weeks only (drop the in-progress week containing `now`).
  const curBucket = Math.floor(now / WEEK);
  const complete = [...weekTotals.entries()]
    .filter(([b]) => b < curBucket)
    .sort(([a], [b]) => a - b);
  if (complete.length < 3) return null;

  // Recency-weighted average over the last 6 complete weeks: newer weeks weigh
  // more (linear weights 1..n), so the estimate tracks the recent trend and
  // old one-off spikes (catch-up double-posts) fade out.
  const recent = complete.slice(-6).map(([, v]) => v);
  const n = recent.length;
  const wtot = BigInt((n * (n + 1)) / 2); // Σ weights 1..n
  let wsum = 0n;
  recent.forEach((v, i) => {
    wsum += v * BigInt(i + 1);
  });
  const weeklyAvg = wsum / wtot;
  const weeklyLow = recent.reduce((m, v) => (v < m ? v : m), recent[0]);
  const weeklyHigh = recent.reduce((m, v) => (v > m ? v : m), recent[0]);

  // Regularity: median gap between consecutive payment weeks close to 1.
  const buckets = complete.map(([b]) => b);
  const gaps: number[] = [];
  for (let i = 1; i < buckets.length; i++) gaps.push(buckets[i] - buckets[i - 1]);
  const confident = median(gaps) === 1 && recent.length >= 4;

  // Schedule upcoming payments anchored to the last observed payment, so we
  // stay in phase and skip a week that already paid.
  const lastTs = earmarks[earmarks.length - 1][2];
  const horizonEnd = now + horizonDays * 86400;
  // Exclusive upper bound = 00:00 UTC on the 1st of next month.
  const d = new Date(now * 1000);
  const monthEnd = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000;
  const listEnd = Math.max(horizonEnd, monthEnd);

  // All scheduled payments up to the later of the two horizons; the two totals
  // are derived from this single list.
  const upcoming: ForecastPoint[] = [];
  let total = 0n;
  let eomTotal = 0n;
  let eomCount = 0;
  for (let k = 1; k <= Math.ceil((listEnd - now) / WEEK) + 1; k++) {
    const ts = lastTs + k * WEEK;
    if (ts <= now || ts > listEnd) continue;
    upcoming.push({ ts, amount: weeklyAvg.toString() });
    if (ts <= horizonEnd) total += weeklyAvg;
    if (ts < monthEnd) {
      eomTotal += weeklyAvg;
      eomCount++;
    }
  }

  return {
    weekday,
    weeklyAvg: weeklyAvg.toString(),
    weeklyLow: weeklyLow.toString(),
    weeklyHigh: weeklyHigh.toString(),
    sampleWeeks: recent.length,
    upcoming,
    total: total.toString(),
    horizonDays,
    eomTotal: eomTotal.toString(),
    eomCount,
    confident,
  };
}
