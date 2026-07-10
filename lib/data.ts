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

  // Current LINK still held ("warchest"): the operator's main wallet plus any
  // traced cold-storage wallets (≤3 hops). Each cold wallet's contribution is
  // capped to what the operator's cluster actually sent it, so we never count a
  // third party's balance. Best-effort: RPC failures just mean no held value.
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
        // count min(current balance, LINK the cluster sent here)
        const counted = BigInt(bal) < BigInt(inflowWei) ? BigInt(bal) : BigInt(inflowWei);
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
      // Safety cap: cold-storage savings can't exceed tracked revenue. Prevents
      // any residual over-attribution from inflating an operator's held.
      const revCap = BigInt(o.totalLink);
      if (coldSum > revCap) coldSum = revCap;
      if (coldSum > 0n) {
        o.coldHeld = coldSum.toString();
        o.cold = perWallet.sort((a, b) => (BigInt(a.held) < BigInt(b.held) ? 1 : -1));
      }

      totalHeld += BigInt(o.held ?? "0") + coldSum;
    }
  } catch {
    /* leave held unset */
  }

  // LINK staked in official venues (Chainlink Staking pools + stake.link),
  // queried across each operator's cluster wallets (main + cold). Separate,
  // best-effort pass so a staking RPC hiccup never affects held. No cap: a
  // position read directly from a cluster wallet is unambiguously the operator's.
  let totalStaked = 0n;
  try {
    const clusterOf = (o: Operator) => [
      o.address,
      ...(cold[o.address] ?? []).map(([w]) => w),
    ];
    const staking = await fetchStaking(operators.flatMap(clusterOf));
    for (const o of operators) {
      const bySource: Record<string, bigint> = {};
      for (const w of clusterOf(o)) {
        const rec = staking[w];
        if (!rec) continue;
        for (const [key, amt] of Object.entries(rec)) {
          bySource[key] = (bySource[key] ?? 0n) + BigInt(amt);
        }
      }
      const stakedBy = STAKING_SOURCES.filter((s) => bySource[s.key])
        .map((s) => ({ source: s.key, amount: bySource[s.key].toString() }));
      if (stakedBy.length) {
        const sum = stakedBy.reduce((n, s) => n + BigInt(s.amount), 0n);
        o.staked = sum.toString();
        o.stakedBy = stakedBy;
        totalStaked += sum;
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
  };
}

export const getData = unstable_cache(loadData, ["earmark-data-v7"], {
  revalidate: 1800,
});

export type { Operator, Snapshot };
