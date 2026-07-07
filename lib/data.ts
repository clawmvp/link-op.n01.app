import { unstable_cache } from "next/cache";
import snapshot from "./snapshot.json";
import type { Operator, Snapshot } from "./types";
import { blockNumber } from "./rpc";
import { fetchEarmarks, aggregate, toSnapshot } from "./earmarks";
import { resolveEns } from "./ens";
import { linkUsd } from "./price";

const BASE = snapshot as Snapshot;

// Load the dashboard data. The committed snapshot is always the baseline; at
// runtime we (a) refresh the LINK price and (b) incrementally scan only the
// blocks mined since the snapshot, so the page stays fresh without ever
// scanning the full history on a request. Any failure falls back to the
// snapshot as-is. Cached for 30 min.
async function loadData(): Promise<Snapshot> {
  const price = (await linkUsd()) ?? BASE.linkUsd;

  try {
    const latest = await blockNumber();
    if (latest <= BASE.latestBlock) {
      return { ...BASE, linkUsd: price };
    }

    const fresh = await fetchEarmarks(BASE.latestBlock + 1, latest);
    if (fresh.length === 0) {
      return { ...BASE, latestBlock: latest, linkUsd: price };
    }

    let ops = aggregate(fresh, BASE.operators);

    // Resolve ENS for any operators that appeared for the first time.
    const missing = ops.filter((o) => o.ens === undefined || o.ens === null);
    const known = new Set(BASE.operators.map((o) => o.address));
    const brandNew = missing.filter((o) => !known.has(o.address)).map((o) => o.address);
    if (brandNew.length) {
      const names = await resolveEns(brandNew);
      ops = ops.map((o) => (o.address in names ? { ...o, ens: names[o.address] } : o));
    }

    return toSnapshot(ops, {
      fromBlock: BASE.fromBlock,
      latestBlock: latest,
      linkUsd: price,
      generatedAt: Math.floor(Date.now() / 1000),
    });
  } catch {
    return { ...BASE, linkUsd: price };
  }
}

export const getData = unstable_cache(loadData, ["earmark-data-v1"], {
  revalidate: 1800,
});

export type { Operator, Snapshot };
