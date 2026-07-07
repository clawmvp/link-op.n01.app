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
import type { EventTuple, Snapshot } from "../lib/types";

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

  const snap: Snapshot = {
    generatedAt: Math.floor(Date.now() / 1000),
    fromBlock: Math.min(DEPLOY_BLOCK, SAFE_DEPLOY_BLOCK),
    latestBlock: latest,
    linkUsd: price,
    ens,
    events,
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
