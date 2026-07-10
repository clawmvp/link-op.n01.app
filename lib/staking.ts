import { rpc } from "./rpc";

// LINK staked by operators in official staking venues. Two families:
//  1. Chainlink Staking v0.2 pools — the amount a wallet has staked is read
//     directly via getStakerPrincipal(address) (LINK, 18 dec).
//  2. stake.link liquid staking — depositing LINK mints stLINK 1:1 with the
//     underlying (rebasing), so a wallet's stLINK balanceOf ≈ its staked LINK.
//
// We only ever query wallets in an operator's own cluster (main + traced
// cold-storage), so a position is always attributable to that operator.

const SEL_PRINCIPAL = "0xe0d307e0"; // getStakerPrincipal(address)
const SEL_BALANCE = "0x70a08231"; // balanceOf(address)

export type StakingSource = {
  key: string;
  label: string;
  short: string; // compact label for tight UI
  contract: string; // lowercase
  method: "principal" | "balance";
};

export const STAKING_SOURCES: StakingSource[] = [
  {
    key: "cl-op",
    label: "Chainlink Operator Staking Pool",
    short: "Chainlink operator pool",
    contract: "0xa1d76a7ca72128541e9fcacafbda3a92ef94fdc5",
    method: "principal",
  },
  {
    key: "cl-comm",
    label: "Chainlink Community Staking Pool",
    short: "Chainlink community pool",
    contract: "0xbc10f2e862ed4502144c7d632a3459f49dfcdb5e",
    method: "principal",
  },
  {
    key: "sdl",
    label: "stake.link (stLINK)",
    short: "stake.link",
    contract: "0xb8b295df2cd735b15be5eb419517aa626fc43cd5",
    method: "balance",
  },
];

export const STAKING_BY_KEY: Record<string, StakingSource> = Object.fromEntries(
  STAKING_SOURCES.map((s) => [s.key, s]),
);

const pad32 = (addr: string) =>
  addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");

async function callAmount(
  contract: string,
  selector: string,
  wallet: string,
): Promise<bigint> {
  const r = await rpc<string>("eth_call", [
    { to: contract, data: selector + pad32(wallet) },
    "latest",
  ]).catch(() => null);
  if (!r || r === "0x") return 0n;
  try {
    return BigInt(r);
  } catch {
    return 0n;
  }
}

// For each wallet, the LINK staked per source (only non-zero entries kept).
// Batched with limited concurrency; failures for a wallet/source are skipped.
export async function fetchStaking(
  wallets: string[],
  concurrency = 10,
): Promise<Record<string, Record<string, string>>> {
  const uniq = [...new Set(wallets.map((w) => w.toLowerCase()))];
  const out: Record<string, Record<string, string>> = {};

  let i = 0;
  async function worker() {
    while (i < uniq.length) {
      const w = uniq[i++];
      const perSource: Record<string, string> = {};
      for (const src of STAKING_SOURCES) {
        const sel = src.method === "balance" ? SEL_BALANCE : SEL_PRINCIPAL;
        const amt = await callAmount(src.contract, sel, w);
        if (amt > 0n) perSource[src.key] = amt.toString();
      }
      if (Object.keys(perSource).length) out[w] = perSource;
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, uniq.length || 1) }, worker),
  );
  return out;
}

// Offline (refresh-time) discovery of which cluster wallets stake, and where.
// Returns operator -> [wallet, sourceKey][] for every non-zero position. Stored
// in the snapshot so the runtime only has to re-query this small wallet set for
// fresh amounts instead of scanning every cluster wallet.
export async function buildStakingMap(
  clusters: Record<string, string[]>,
): Promise<Record<string, [string, string][]>> {
  const wallets = [...new Set(Object.values(clusters).flat().map((w) => w.toLowerCase()))];
  const staking = await fetchStaking(wallets);
  const out: Record<string, [string, string][]> = {};
  for (const [op, ws] of Object.entries(clusters)) {
    const entries: [string, string][] = [];
    for (const w of ws) {
      const rec = staking[w.toLowerCase()];
      if (!rec) continue;
      for (const key of Object.keys(rec)) entries.push([w.toLowerCase(), key]);
    }
    if (entries.length) out[op.toLowerCase()] = entries;
  }
  return out;
}
