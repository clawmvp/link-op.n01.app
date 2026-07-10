import type { EventTuple } from "./types";

// Earmark rewards land on a weekly cadence (almost always Tuesday). We forecast
// upcoming payments by projecting the operator's recent average weekly earmark
// onto the next payment dates, anchored to their last observed payment so the
// rhythm stays in phase (and this week isn't double-counted if it already paid).

const WEEK = 7 * 86400;

export type ForecastPoint = { ts: number; amount: string }; // wei

export type PaymentForecast = {
  weekday: number; // 0=Sun … most common earmark weekday (usually 2=Tue)
  weeklyAvg: string; // wei — mean of recent complete weeks
  weeklyLow: string; // wei — recent min
  weeklyHigh: string; // wei — recent max
  sampleWeeks: number; // how many complete weeks fed the average
  upcoming: ForecastPoint[]; // scheduled payments within the horizon
  total: string; // wei — sum of `upcoming`
  horizonDays: number;
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

  const recent = complete.slice(-8).map(([, v]) => v);
  const sum = recent.reduce((a, v) => a + v, 0n);
  const weeklyAvg = sum / BigInt(recent.length);
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
  const upcoming: ForecastPoint[] = [];
  for (let k = 1; k <= Math.ceil(horizonDays / 7) + 1; k++) {
    const ts = lastTs + k * WEEK;
    if (ts > now && ts <= horizonEnd) {
      upcoming.push({ ts, amount: weeklyAvg.toString() });
    }
  }
  const total = (weeklyAvg * BigInt(upcoming.length)).toString();

  return {
    weekday,
    weeklyAvg: weeklyAvg.toString(),
    weeklyLow: weeklyLow.toString(),
    weeklyHigh: weeklyHigh.toString(),
    sampleWeeks: recent.length,
    upcoming,
    total,
    horizonDays,
    confident,
  };
}
