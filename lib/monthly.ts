import type { EventTuple } from "./types";

// One month of revenue for a single operator.
export type MonthPoint = {
  ym: string; // "YYYY-MM" (UTC)
  earmarked: string; // wei
  direct: string; // wei
  total: string; // wei
  count: number; // number of revenue events in the month
};

// Per-operator monthly breakdown, keyed by lowercase address. Each value is a
// chronologically ascending list of months with at least one event.
export type MonthlyByOperator = Record<string, MonthPoint[]>;

// UTC year-month key ("2026-06") from a unix-seconds timestamp.
function ymKey(ts: number): string {
  const d = new Date(ts * 1000);
  const y = d.getUTCFullYear();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}`;
}

// Fold compact events into a per-operator, per-month revenue series. Only
// operators in `keep` are included (typically the active set shown in the
// table). Events with no timestamp (ts <= 0) can't be dated, so they're skipped
// here — they still count in the all-time aggregates computed elsewhere.
export function monthlyByOperator(
  events: EventTuple[],
  keep: Set<string>,
): MonthlyByOperator {
  // address -> ym -> { earmarked, direct, count }
  const byOp = new Map<string, Map<string, { e: bigint; d: bigint; n: number }>>();

  for (const [op, amtS, ts, , source] of events) {
    if (!keep.has(op) || !ts || ts <= 0) continue;
    const amt = BigInt(amtS);
    const ym = ymKey(ts);
    let months = byOp.get(op);
    if (!months) {
      months = new Map();
      byOp.set(op, months);
    }
    let cell = months.get(ym);
    if (!cell) {
      cell = { e: 0n, d: 0n, n: 0 };
      months.set(ym, cell);
    }
    if (source === "d") cell.d += amt;
    else cell.e += amt;
    cell.n += 1;
  }

  const out: MonthlyByOperator = {};
  for (const [op, months] of byOp) {
    out[op] = [...months.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([ym, c]) => ({
        ym,
        earmarked: c.e.toString(),
        direct: c.d.toString(),
        total: (c.e + c.d).toString(),
        count: c.n,
      }));
  }
  return out;
}
