// Regenerate lib/snapshot.json from on-chain data.
//   npm run refresh
// Full-scans EarmarkSet events from DEPLOY_BLOCK to head, reverse-resolves ENS,
// fetches LINK/USD, and writes the committed snapshot (raw events + ENS map).
// Rolling 30d/90d windows and the active/excluded filtering are computed at
// request time, so they stay accurate between refreshes.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEPLOY_BLOCK, SAFE_DEPLOY_BLOCK } from "../lib/config";
import { blockNumber } from "../lib/rpc";
import {
  fetchEarmarks,
  fetchSafeTransfers,
  earmarksToEvents,
  earmarkOperatorSet,
  aggregateEvents,
} from "../lib/earmarks";
import { resolveEns } from "../lib/ens";
import { linkUsd } from "../lib/price";
import { traceCold } from "../lib/trace";
import { buildWarchestSeries } from "../lib/warchestBuild";
import { rpc } from "../lib/rpc";
import { EXCLUDE } from "../lib/labels";
import type { EventTuple, Snapshot } from "../lib/types";

async function getBlockTs(block: number): Promise<number | null> {
  const b = await rpc<{ timestamp: string } | null>("eth_getBlockByNumber", [
    "0x" + block.toString(16),
    false,
  ]).catch(() => null);
  return b?.timestamp ? parseInt(b.timestamp, 16) : null;
}

async function main() {
  const latest = await blockNumber();
  console.log(`Scanning EarmarkSet ${DEPLOY_BLOCK} → ${latest} …`);

  const earmarks = await fetchEarmarks(DEPLOY_BLOCK, latest);
  const earmarkEvents = earmarksToEvents(earmarks);
  console.log(`Decoded ${earmarks.length} earmarks.`);

  // Direct treasury LINK payouts, scoped to the tracked operators.
  const operatorSet = earmarkOperatorSet(earmarkEvents);
  console.log(`Scanning direct treasury LINK transfers ${SAFE_DEPLOY_BLOCK} → ${latest} …`);
  const safeEvents = await fetchSafeTransfers(SAFE_DEPLOY_BLOCK, latest, operatorSet);
  console.log(`Kept ${safeEvents.length} direct transfers to tracked operators.`);

  const events: EventTuple[] = [...earmarkEvents, ...safeEvents].sort(
    (a, b) => a[3] - b[3],
  );

  const addresses = [...new Set(events.map((e) => e[0]))];
  console.log(`${addresses.length} operators. Resolving ENS …`);
  const ens = await resolveEns(addresses);
  console.log(`Resolved ${Object.values(ens).filter(Boolean).length} ENS names.`);

  const price = await linkUsd();
  console.log(`LINK/USD: ${price ?? "unavailable"}`);

  // Trace cold-storage wallets (main → …→ up to 3 hops) for each operator.
  // Cap traced flows at 1.5× each operator's tracked revenue so we never follow
  // LINK that isn't revenue-derived (a high-throughput wallet's unrelated funds).
  const revenue: Record<string, bigint> = {};
  for (const [op, amt] of events.map((e) => [e[0], BigInt(e[1])] as const)) {
    revenue[op] = (revenue[op] ?? 0n) + amt;
  }
  const caps: Record<string, bigint> = {};
  for (const [op, r] of Object.entries(revenue)) caps[op] = (r * 3n) / 2n;

  console.log(`Tracing cold-storage flows for ${addresses.length} operators …`);
  const cold = await traceCold(
    addresses,
    Math.min(DEPLOY_BLOCK, SAFE_DEPLOY_BLOCK),
    latest,
    EXCLUDE,
    { minFlowWei: 100n * 10n ** 18n, maxFanout: 5, depth: 5, maxClusterPerOp: 20, caps },
  );
  const coldWalletCount = Object.values(cold).reduce((n, l) => n + l.length, 0);
  console.log(
    `Found ${coldWalletCount} cold-storage wallets across ${Object.keys(cold).length} operators.`,
  );

  // Warchest over time: monthly LINK balance of each operator's cluster
  // (main wallet + its cold-storage wallets).
  const clusters: Record<string, string[]> = {};
  for (const op of addresses) {
    clusters[op] = [op, ...(cold[op] ?? []).map(([w]) => w)];
  }
  const anchorTs = Number((await getBlockTs(latest)) ?? Math.floor(Date.now() / 1000));
  console.log(`Building warchest series …`);
  const warchest = await buildWarchestSeries(
    clusters,
    Math.min(DEPLOY_BLOCK, SAFE_DEPLOY_BLOCK),
    latest,
    latest,
    anchorTs,
  );
  console.log(`Warchest series for ${Object.keys(warchest).length} operators.`);

  const snap: Snapshot = {
    generatedAt: Math.floor(Date.now() / 1000),
    fromBlock: Math.min(DEPLOY_BLOCK, SAFE_DEPLOY_BLOCK),
    latestBlock: latest,
    linkUsd: price,
    ens,
    events,
    cold,
    warchest,
  };

  const out = join(process.cwd(), "lib", "snapshot.json");
  writeFileSync(out, JSON.stringify(snap));

  // Quick sanity print (active operators, excluding pool/protocol).
  const active = aggregateEvents(snap.events, {
    now: snap.generatedAt,
    ens,
    activeWithinDays: 30,
  });
  console.log(
    `Wrote ${out}: ${snap.events.length} events, ${addresses.length} operators ` +
      `(${active.length} active in last 30d).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
