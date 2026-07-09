import { rpc } from "./rpc";
import { LINK_TOKEN, LINK_TRANSFER_TOPIC, LOG_WINDOW } from "./config";
import { KNOWN_SERVICES } from "./labels";

// Cold-storage tracing: follow LINK OUT of each operator's wallet, up to a few
// hops, to find self-custody wallets (main → wallet B → wallet C). Their current
// balances are later added as "maybe cold storage" held.
//
// Guardrails against attributing someone else's LINK to an operator:
//  - never follow into / count known exchanges (KNOWN_SERVICES) or contracts
//    (cold storage is an EOA; contracts are staking/LP/exchange/etc.);
//  - skip a wallet that fans out to many destinations (a distributor/seller, not
//    a move to cold storage);
//  - ignore dust transfers below a minimum;
//  - at count time, cap each wallet's contribution to the LINK the cluster
//    actually sent it (done in the balance step via the stored inflow).

const hex = (n: number) => "0x" + n.toString(16);
const pad32 = (a: string) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0");

type RawLog = { topics: string[]; data: string };
type Edge = { from: string; to: string; amount: bigint };

// op -> list of [coldWallet, inflowWei] the operator's cluster sent there.
export type ColdMap = Record<string, [string, string][]>;

export type TraceOptions = {
  minFlowWei: bigint;
  maxFanout: number;
  depth: number; // max hops
  maxClusterPerOp: number;
  // Per-operator cap on how much LINK a single traced wallet may have received
  // from the cluster. Flows far above an operator's revenue aren't
  // revenue-derived savings (the wallet handles unrelated LINK) — don't follow
  // them. Keyed by lowercase operator address, in wei.
  caps: Record<string, bigint>;
};

// LINK transfers where `from` ∈ wallets, over [fromBlock, toBlock]. Batched: a
// whole BFS level is scanned with one topic1 array per block-window.
async function transfersFrom(
  wallets: string[],
  fromBlock: number,
  toBlock: number,
): Promise<Edge[]> {
  const edges: Edge[] = [];
  const CHUNK = 80; // addresses per topic1 array
  for (let b = fromBlock; b <= toBlock; b += LOG_WINDOW) {
    const to = Math.min(b + LOG_WINDOW - 1, toBlock);
    for (let i = 0; i < wallets.length; i += CHUNK) {
      const chunk = wallets.slice(i, i + CHUNK).map(pad32);
      const logs = await rpc<RawLog[]>("eth_getLogs", [
        {
          fromBlock: hex(b),
          toBlock: hex(to),
          address: LINK_TOKEN,
          topics: [LINK_TRANSFER_TOPIC, chunk],
        },
      ]).catch(() => [] as RawLog[]);
      for (const l of logs) {
        edges.push({
          from: ("0x" + l.topics[1].slice(-40)).toLowerCase(),
          to: ("0x" + l.topics[2].slice(-40)).toLowerCase(),
          amount: BigInt(l.data),
        });
      }
    }
  }
  return edges;
}

// Which of `addrs` are contracts (have bytecode).
async function contractSet(addrs: string[], concurrency = 10): Promise<Set<string>> {
  const set = new Set<string>();
  const uniq = [...new Set(addrs)];
  for (let i = 0; i < uniq.length; i += concurrency) {
    const batch = uniq.slice(i, i + concurrency);
    const res = await Promise.all(
      batch.map((a) => rpc<string>("eth_getCode", [a, "latest"]).catch(() => "0x")),
    );
    batch.forEach((a, j) => {
      if (res[j] && res[j] !== "0x") set.add(a);
    });
  }
  return set;
}

export async function traceCold(
  operators: string[],
  fromBlock: number,
  toBlock: number,
  exclude: Set<string>,
  opts: TraceOptions,
): Promise<ColdMap> {
  const ops = operators.map((a) => a.toLowerCase());
  const opSet = new Set(ops);
  const blocked = new Set<string>([
    ...exclude,
    ...opSet,
    ...KNOWN_SERVICES,
    LINK_TOKEN,
  ]);

  const owner = new Map<string, string>(); // wallet -> operator root that claimed it
  const inflow = new Map<string, bigint>(); // wallet -> LINK received from its cluster
  const cluster = new Map<string, Set<string>>();
  ops.forEach((o) => cluster.set(o, new Set()));

  let frontier = new Map<string, string>(); // wallet -> root
  ops.forEach((o) => frontier.set(o, o));

  for (let d = 0; d < opts.depth && frontier.size > 0; d++) {
    const edges = await transfersFrom([...frontier.keys()], fromBlock, toBlock);

    // sum amounts per (from -> to)
    const byFrom = new Map<string, Map<string, bigint>>();
    for (const e of edges) {
      const root = frontier.get(e.from);
      if (!root || e.to === e.from || blocked.has(e.to)) continue;
      if (owner.has(e.to)) {
        if (owner.get(e.to) === root)
          inflow.set(e.to, (inflow.get(e.to) ?? 0n) + e.amount);
        continue;
      }
      let m = byFrom.get(e.from);
      if (!m) byFrom.set(e.from, (m = new Map()));
      m.set(e.to, (m.get(e.to) ?? 0n) + e.amount);
    }

    // pick candidate destinations, enforcing dust / fan-out / cluster-size caps
    const candidates = new Map<string, { root: string; amount: bigint }>();
    for (const [from, dests] of byFrom) {
      const root = frontier.get(from)!;
      const cap = opts.caps[root] ?? 0n;
      const qualifying = [...dests.entries()].filter(
        ([, amt]) => amt >= opts.minFlowWei && amt <= cap,
      );
      if (qualifying.length === 0 || qualifying.length > opts.maxFanout) continue;
      const cl = cluster.get(root)!;
      for (const [to, amt] of qualifying) {
        if (cl.size >= opts.maxClusterPerOp) break;
        if (owner.has(to)) {
          if (owner.get(to) === root) inflow.set(to, (inflow.get(to) ?? 0n) + amt);
          continue;
        }
        const prev = candidates.get(to);
        if (!prev || amt > prev.amount) candidates.set(to, { root, amount: amt });
      }
    }

    // drop contracts, commit the rest as this level's discoveries
    const contracts = await contractSet([...candidates.keys()]);
    const next = new Map<string, string>();
    for (const [to, { root, amount }] of candidates) {
      if (contracts.has(to)) continue;
      owner.set(to, root);
      inflow.set(to, amount);
      cluster.get(root)!.add(to);
      next.set(to, root);
    }
    frontier = next;
  }

  const out: ColdMap = {};
  for (const o of ops) {
    const cap = opts.caps[o] ?? 0n;
    const cl = cluster.get(o)!;
    // Post-hoc guard: accumulation can push a wallet's inflow above the cap;
    // such wallets aren't revenue-derived cold storage — drop them entirely.
    const list = [...cl]
      .map((w) => [w, inflow.get(w) ?? 0n] as const)
      .filter(([, inf]) => inf <= cap)
      .map(([w, inf]) => [w, inf.toString()] as [string, string]);
    if (list.length) out[o] = list;
  }
  return out;
}
