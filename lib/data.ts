import { unstable_cache } from "next/cache";
import snapshotJson from "./snapshot.json";
import type { Operator, Snapshot } from "./types";
import { blockNumber } from "./rpc";
import {
  fetchEarmarks,
  fetchSafeTransfers,
  earmarksToEvents,
  earmarkOperatorSet,
  aggregateEvents,
  sumField,
} from "./earmarks";
import { resolveEns } from "./ens";
import { linkUsd } from "./price";
import { fetchLinkBalances } from "./balances";
import { fetchStaking, STAKING_SOURCES } from "./staking";
import { forecastPayments, type PaymentForecast } from "./forecast";
import { EXCLUDE } from "./labels";
import {
  monthlyByOperator,
  sumMonthly,
  type MonthlyByOperator,
  type MonthPoint,
} from "./monthly";

const BASE = snapshotJson as unknown as Snapshot;

// Drop operators with no earmark in this many days.
const ACTIVE_DAYS = 30;

export type DashboardData = {
  generatedAt: number;
  fromBlock: number;
  latestBlock: number;
  linkUsd: number | null;
  operators: Operator[]; // active only, pool/protocol excluded, sorted by total
  monthly: MonthlyByOperator; // per-operator month-by-month revenue (active ops)
  monthlyTotals: MonthPoint[]; // combined revenue per month across active ops
  totalLink: string;
  totalEarmarked: string;
  totalDirect: string;
  total30: string;
  total90: string;
  totalEvents: number;
  totalHeld: string; // combined current LINK held across active operators
  totalStaked: string; // combined LINK staked across active operators
  forecasts: Record<string, PaymentForecast>; // next-30d earmark forecast per op
  totalExpected30: string; // combined expected earmark inflow, next 30 days
};

// The committed snapshot is the baseline; at runtime we (a) refresh the LINK
// price and (b) incrementally scan only the blocks mined since the snapshot,
// then aggregate with 30d/90d windows relative to now. Any failure falls back
// to the snapshot data. Cached for 30 min.
async function loadData(): Promise<DashboardData> {
  const price = (await linkUsd()) ?? BASE.linkUsd;

  let events = BASE.events;
  const ens: Record<string, string | null> = { ...BASE.ens };
  let latest = BASE.latestBlock;

  try {
    const head = await blockNumber();
    if (head > BASE.latestBlock) {
      const fresh = await fetchEarmarks(BASE.latestBlock + 1, head);
      if (fresh.length) {
        events = events.concat(earmarksToEvents(fresh));
        const known = new Set(Object.keys(ens));
        const brandNew = [...new Set(fresh.map((e) => e.operator))].filter(
          (a) => !known.has(a),
        );
        if (brandNew.length) Object.assign(ens, await resolveEns(brandNew));
      }
      // Direct treasury payouts to tracked operators since the snapshot.
      const operatorSet = earmarkOperatorSet(events);
      const safe = await fetchSafeTransfers(BASE.latestBlock + 1, head, operatorSet);
      if (safe.length) events = events.concat(safe);
      latest = head;
    }
  } catch {
    /* keep snapshot events */
  }

  const now = Math.floor(Date.now() / 1000);
  const operators = aggregateEvents(events, {
    now,
    ens,
    exclude: EXCLUDE,
    activeWithinDays: ACTIVE_DAYS,
  });

  // Month-by-month series, scoped to the active operators the table renders.
  const activeSet = new Set(operators.map((o) => o.address));
  const monthly = monthlyByOperator(events, activeSet);
  const monthlyTotals = sumMonthly(monthly);

  // Forecast the next 30 days of (weekly) earmark payments per active operator,
  // from their own recent cadence + average. Direct payouts are irregular and
  // deliberately not scheduled here.
  const eventsByOp = new Map<string, typeof events>();
  for (const e of events) {
    const arr = eventsByOp.get(e[0]);
    if (arr) arr.push(e);
    else eventsByOp.set(e[0], [e]);
  }
  const forecasts: Record<string, PaymentForecast> = {};
  let expected30 = 0n;
  for (const o of operators) {
    const fc = forecastPayments(eventsByOp.get(o.address) ?? [], now, 30);
    if (fc) {
      forecasts[o.address] = fc;
      expected30 += BigInt(fc.total);
    }
  }

  // Current LINK still held ("warchest"): the operator's main wallet plus any
  // traced cold-storage wallets (≤3 hops). A traced wallet is treated as the
  // operator's own, so its FULL LINK balance counts — including LINK from their
  // own sources (bought, other income), not just what flowed from revenue.
  // (Ownership is decided at trace time by the discovery guardrails.)
  // Best-effort: RPC failures just mean no held value.
  const cold = (BASE.cold ?? {}) as Record<
    string,
    [string, string, string, number][]
  >;
  let totalHeld = 0n;
  try {
    const coldWallets = Object.values(cold).flatMap((list) => list.map(([w]) => w));
    const balances = await fetchLinkBalances([
      ...operators.map((o) => o.address),
      ...coldWallets,
    ]);
    for (const o of operators) {
      const h = balances[o.address];
      if (h != null) o.held = h;

      const list = cold[o.address] ?? [];
      let coldSum = 0n;
      const perWallet: NonNullable<Operator["cold"]> = [];
      for (const [w, inflowWei, parent, hop] of list) {
        const bal = balances[w];
        if (bal == null) continue;
        // Full balance — the traced wallet is the operator's, so all of its LINK
        // is their warchest (incl. own-source top-ups beyond traced inflow).
        const counted = BigInt(bal);
        coldSum += counted;
        // Keep even zero-balance wallets: they're pass-through hops that the
        // flow diagram needs to connect the chain (main → … → held wallet).
        perWallet.push({
          wallet: w,
          held: counted.toString(),
          inflow: inflowWei,
          parent,
          hop,
        });
      }
      if (coldSum > 0n) {
        o.coldHeld = coldSum.toString();
        o.cold = perWallet.sort((a, b) => (BigInt(a.held) < BigInt(b.held) ? 1 : -1));
      }

      totalHeld += BigInt(o.held ?? "0") + coldSum;
    }
  } catch {
    /* leave held unset */
  }

  // LINK staked in official venues (Chainlink Staking pools + stake.link). The
  // snapshot already lists which cluster wallets stake and where (built offline
  // in refresh), so at runtime we only re-query that small wallet set for fresh
  // amounts. Best-effort, its own pass; no cap — a position read from a cluster
  // wallet is unambiguously the operator's.
  const stakingMap = (BASE.staking ?? {}) as Record<string, [string, string][]>;
  let totalStaked = 0n;
  try {
    const walletOp = new Map<string, string>();
    for (const [op, list] of Object.entries(stakingMap))
      for (const [w] of list) walletOp.set(w, op);

    if (walletOp.size) {
      const staking = await fetchStaking([...walletOp.keys()]);
      const byOp = new Map<string, Record<string, bigint>>();
      for (const [w, rec] of Object.entries(staking)) {
        const op = walletOp.get(w);
        if (!op) continue;
        const agg = byOp.get(op) ?? {};
        for (const [key, amt] of Object.entries(rec))
          agg[key] = (agg[key] ?? 0n) + BigInt(amt);
        byOp.set(op, agg);
      }
      for (const o of operators) {
        const bySource = byOp.get(o.address);
        if (!bySource) continue;
        const stakedBy = STAKING_SOURCES.filter((s) => bySource[s.key]).map(
          (s) => ({ source: s.key, amount: bySource[s.key].toString() }),
        );
        if (stakedBy.length) {
          const sum = stakedBy.reduce((n, s) => n + BigInt(s.amount), 0n);
          o.staked = sum.toString();
          o.stakedBy = stakedBy;
          totalStaked += sum;
        }
      }
    }
  } catch {
    /* leave staked unset */
  }

  return {
    generatedAt: now,
    fromBlock: BASE.fromBlock,
    latestBlock: latest,
    linkUsd: price,
    operators,
    monthly,
    monthlyTotals,
    totalLink: sumField(operators, "totalLink"),
    totalEarmarked: sumField(operators, "earmarked"),
    totalDirect: sumField(operators, "direct"),
    total30: sumField(operators, "last30"),
    total90: sumField(operators, "last90"),
    totalEvents: operators.reduce((n, o) => n + o.earmarks, 0),
    totalHeld: totalHeld.toString(),
    totalStaked: totalStaked.toString(),
    forecasts,
    totalExpected30: expected30.toString(),
  };
}

export const getData = unstable_cache(loadData, ["earmark-data-v9"], {
  revalidate: 1800,
});

export type { Operator, Snapshot };
