// Regenerate lib/snapshot.json from on-chain data.
//   npm run refresh
// Full-scans EarmarkSet events from DEPLOY_BLOCK to head, aggregates per
// operator, reverse-resolves ENS names, fetches LINK/USD, and writes the
// committed snapshot the site renders from.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEPLOY_BLOCK } from "../lib/config";
import { blockNumber } from "../lib/rpc";
import { fetchEarmarks, aggregate, toSnapshot } from "../lib/earmarks";
import { resolveEns } from "../lib/ens";
import { linkUsd } from "../lib/price";

async function main() {
  const latest = await blockNumber();
  console.log(`Scanning EarmarkSet ${DEPLOY_BLOCK} → ${latest} …`);

  const earmarks = await fetchEarmarks(DEPLOY_BLOCK, latest);
  console.log(`Decoded ${earmarks.length} earmarks.`);

  let ops = aggregate(earmarks);
  console.log(`${ops.length} operators. Resolving ENS …`);

  const names = await resolveEns(ops.map((o) => o.address));
  ops = ops.map((o) => ({ ...o, ens: names[o.address] ?? null }));
  const withEns = ops.filter((o) => o.ens).length;
  console.log(`Resolved ${withEns} ENS names.`);

  const price = await linkUsd();
  console.log(`LINK/USD: ${price ?? "unavailable"}`);

  const snap = toSnapshot(ops, {
    fromBlock: DEPLOY_BLOCK,
    latestBlock: latest,
    linkUsd: price,
    generatedAt: Math.floor(Date.now() / 1000),
  });

  const out = join(process.cwd(), "lib", "snapshot.json");
  writeFileSync(out, JSON.stringify(snap, null, 2));
  console.log(
    `Wrote ${out}: ${snap.operators.length} operators, ${snap.totalEvents} events, ` +
      `${(Number(BigInt(snap.totalLink) / 10n ** 15n) / 1e3).toLocaleString()} LINK total.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
