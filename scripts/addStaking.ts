// One-off: inject the `staking` map into the existing lib/snapshot.json without
// re-scanning earmarks/cold/warchest. Builds each operator's cluster (main +
// already-traced cold wallets) from the committed snapshot, discovers staking
// positions, and writes them back. Safe to re-run; future full refreshes
// produce the same field via scripts/refresh.ts.
//   npx tsx scripts/addStaking.ts

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildStakingMap } from "../lib/staking";
import type { Snapshot } from "../lib/types";

async function main() {
  const path = join(process.cwd(), "lib", "snapshot.json");
  const snap = JSON.parse(readFileSync(path, "utf8")) as Snapshot;

  // Cluster = operator main wallet + its traced cold wallets.
  const operators = [...new Set(snap.events.map((e) => e[0].toLowerCase()))];
  const cold = (snap.cold ?? {}) as Record<string, [string, string, string, number][]>;
  const clusters: Record<string, string[]> = {};
  for (const op of operators) {
    clusters[op] = [op, ...(cold[op] ?? []).map(([w]) => w)];
  }

  const walletCount = new Set(Object.values(clusters).flat()).size;
  console.log(
    `Scanning ${walletCount} cluster wallets across ${operators.length} operators for staking …`,
  );
  const staking = await buildStakingMap(clusters);
  const positions = Object.values(staking).reduce((n, l) => n + l.length, 0);
  console.log(
    `Found ${positions} staking positions across ${Object.keys(staking).length} operators.`,
  );

  snap.staking = staking;
  writeFileSync(path, JSON.stringify(snap));
  console.log(`Updated ${path} with staking map.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
