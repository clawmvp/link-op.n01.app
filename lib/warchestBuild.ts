import { rpc } from "./rpc";
import { LINK_TOKEN, LINK_TRANSFER_TOPIC, LOG_WINDOW } from "./config";

// Reconstruct each operator's warchest (LINK held across its main + cold-storage
// wallets) month by month, from the LINK transfers touching those wallets.
// Because LINK only moves via Transfer, the running sum of (inflows − outflows)
// across a cluster equals its aggregate balance over time. Transfers internal to
// a cluster cancel out. Computed offline in refresh and stored in the snapshot.

const hex = (n: number) => "0x" + n.toString(16);
const pad32 = (a: string) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0");

type RawLog = {
  topics: string[];
  data: string;
  blockNumber: string;
  blockTimestamp?: string;
};

function ymKey(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, "0")}`;
}

// Every "YYYY-MM" from first..last inclusive, so the balance line has no gaps.
function monthRange(first: string, last: string): string[] {
  const [fy, fm] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  const out: string[] = [];
  let y = fy,
    m = fm;
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${m.toString().padStart(2, "0")}`);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export async function buildWarchestSeries(
  clusters: Record<string, string[]>,
  fromBlock: number,
  toBlock: number,
  anchorBlock: number,
  anchorTs: number,
): Promise<Record<string, [string, string][]>> {
  const walletOp = new Map<string, string>();
  for (const [op, ws] of Object.entries(clusters))
    for (const w of ws) walletOp.set(w.toLowerCase(), op);
  const wallets = [...walletOp.keys()];
  if (wallets.length === 0) return {};

  const tsOf = (block: number, ts?: number) =>
    ts ?? anchorTs - (anchorBlock - block) * 12; // ~12s/block fallback

  // op -> ym -> signed delta
  const deltas = new Map<string, Map<string, bigint>>();
  const add = (op: string, ym: string, d: bigint) => {
    let m = deltas.get(op);
    if (!m) deltas.set(op, (m = new Map()));
    m.set(ym, (m.get(ym) ?? 0n) + d);
  };

  const CHUNK = 80;
  // topicIndex 2 = recipient (inflow, +), 1 = sender (outflow, −)
  async function scan(topicIndex: 1 | 2, sign: bigint) {
    for (let b = fromBlock; b <= toBlock; b += LOG_WINDOW) {
      const to = Math.min(b + LOG_WINDOW - 1, toBlock);
      for (let i = 0; i < wallets.length; i += CHUNK) {
        const chunk = wallets.slice(i, i + CHUNK).map(pad32);
        const topics =
          topicIndex === 1
            ? [LINK_TRANSFER_TOPIC, chunk]
            : [LINK_TRANSFER_TOPIC, null, chunk];
        const logs = await rpc<RawLog[]>("eth_getLogs", [
          { fromBlock: hex(b), toBlock: hex(to), address: LINK_TOKEN, topics },
        ]).catch(() => [] as RawLog[]);
        for (const l of logs) {
          const w = ("0x" + l.topics[topicIndex].slice(-40)).toLowerCase();
          const op = walletOp.get(w);
          if (!op) continue;
          const ts = l.blockTimestamp
            ? parseInt(l.blockTimestamp, 16)
            : tsOf(parseInt(l.blockNumber, 16));
          add(op, ymKey(ts), sign * BigInt(l.data));
        }
      }
    }
  }

  await scan(2, 1n); // inflows
  await scan(1, -1n); // outflows

  const out: Record<string, [string, string][]> = {};
  for (const [op, m] of deltas) {
    const yms = [...m.keys()].sort();
    if (yms.length === 0) continue;
    let cum = 0n;
    const series: [string, string][] = [];
    for (const ym of monthRange(yms[0], yms[yms.length - 1])) {
      cum += m.get(ym) ?? 0n;
      if (cum < 0n) cum = 0n; // guard against pre-window balances / approximations
      series.push([ym, cum.toString()]);
    }
    out[op] = series;
  }
  return out;
}
