// Regenerate lib/snapshot.json from on-chain data.
//   npm run refresh
// Full-scans EarmarkSet events from DEPLOY_BLOCK to head, reverse-resolves ENS,
// fetches LINK/USD, and writes the committed snapshot (raw events + ENS map).
// Rolling 30d/90d windows and the active/excluded filtering are computed at
// request time, so they stay accurate between refreshes.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEPLOY_BLOCK } from "../lib/config";
import { blockNumber } from "../lib/rpc";
import {
  fetchEarmarks,
  earmarksToEvents,
  aggregateEvents,
} from "../lib/earmarks";
import { resolveEns } from "../lib/ens";
import { linkUsd } from "../lib/price";
import type { Snapshot } from "../lib/types";

async function main() {
  const latest = await blockNumber();
  console.log(`Scanning EarmarkSet ${DEPLOY_BLOCK} → ${latest} …`);

  const earmarks = await fetchEarmarks(DEPLOY_BLOCK, latest);
  console.log(`Decoded ${earmarks.length} earmarks.`);

  const addresses = [...new Set(earmarks.map((e) => e.operator))];
  console.log(`${addresses.length} operators. Resolving ENS …`);
  const ens = await resolveEns(addresses);
  console.log(`Resolved ${Object.values(ens).filter(Boolean).length} ENS names.`);

  const price = await linkUsd();
  console.log(`LINK/USD: ${price ?? "unavailable"}`);

  const snap: Snapshot = {
    generatedAt: Math.floor(Date.now() / 1000),
    fromBlock: DEPLOY_BLOCK,
    latestBlock: latest,
    linkUsd: price,
    ens,
    events: earmarksToEvents(earmarks),
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
