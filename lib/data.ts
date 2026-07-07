import { unstable_cache } from "next/cache";
import snapshotJson from "./snapshot.json";
import type { Operator, Snapshot } from "./types";
import { blockNumber } from "./rpc";
import {
  fetchEarmarks,
  earmarksToEvents,
  aggregateEvents,
  sumField,
} from "./earmarks";
import { resolveEns } from "./ens";
import { linkUsd } from "./price";
import { EXCLUDE } from "./labels";

const BASE = snapshotJson as unknown as Snapshot;

// Drop operators with no earmark in this many days.
const ACTIVE_DAYS = 30;

export type DashboardData = {
  generatedAt: number;
  fromBlock: number;
  latestBlock: number;
  linkUsd: number | null;
  operators: Operator[]; // active only, pool/protocol excluded, sorted by total
  totalLink: string;
  total30: string;
  total90: string;
  totalEvents: number;
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

  return {
    generatedAt: now,
    fromBlock: BASE.fromBlock,
    latestBlock: latest,
    linkUsd: price,
    operators,
    totalLink: sumField(operators, "totalLink"),
    total30: sumField(operators, "last30"),
    total90: sumField(operators, "last90"),
    totalEvents: operators.reduce((n, o) => n + o.earmarks, 0),
  };
}

export const getData = unstable_cache(loadData, ["earmark-data-v2"], {
  revalidate: 1800,
});

export type { Operator, Snapshot };
