import { rpc } from "./rpc";
import {
  PAYMENTS_CONTRACT,
  EARMARK_SET_TOPIC,
  LOG_WINDOW,
} from "./config";
import type { Earmark, Operator, Snapshot } from "./types";

type RawLog = {
  topics: string[];
  data: string;
  blockNumber: string;
};

// Decode one EarmarkSet log.
// Non-indexed data = (int96 amount, bytes data); the bytes payload encodes
// (uint year, uint week, uint timestamp).
export function decodeEarmark(log: RawLog): Earmark {
  const operator = ("0x" + log.topics[1].slice(-40)).toLowerCase();
  const id = BigInt(log.topics[2]).toString();
  const d = log.data.slice(2);
  const word = (i: number) => d.slice(i * 64, (i + 1) * 64);

  // int96 amount (signed, but earmarks are positive in practice)
  let amount = BigInt("0x" + word(0));
  if (amount >= 1n << 95n) amount -= 1n << 96n;

  // dynamic bytes: word(1) = byte offset -> [length][content...]
  let year = 0,
    week = 0,
    ts = 0;
  try {
    const off = Number(BigInt("0x" + word(1))) * 2; // char offset
    const lenChars = Number(BigInt("0x" + d.slice(off, off + 64))) * 2;
    const content = d.slice(off + 64, off + 64 + lenChars);
    const cw = (i: number) => content.slice(i * 64, (i + 1) * 64);
    if (content.length >= 192) {
      year = Number(BigInt("0x" + cw(0)));
      week = Number(BigInt("0x" + cw(1)));
      ts = Number(BigInt("0x" + cw(2)));
    }
  } catch {
    /* leave period fields at 0 */
  }

  return {
    operator,
    id,
    amount,
    year,
    week,
    ts,
    block: parseInt(log.blockNumber, 16),
  };
}

// Fetch all EarmarkSet events in [fromBlock, toBlock], paginating public RPCs
// in LOG_WINDOW-sized slices.
export async function fetchEarmarks(
  fromBlock: number,
  toBlock: number,
): Promise<Earmark[]> {
  const out: Earmark[] = [];
  for (let b = fromBlock; b <= toBlock; b += LOG_WINDOW) {
    const to = Math.min(b + LOG_WINDOW - 1, toBlock);
    const logs = await rpc<RawLog[]>("eth_getLogs", [
      {
        fromBlock: "0x" + b.toString(16),
        toBlock: "0x" + to.toString(16),
        address: PAYMENTS_CONTRACT,
        topics: [EARMARK_SET_TOPIC],
      },
    ]);
    for (const l of logs) out.push(decodeEarmark(l));
  }
  return out;
}

// Fold a list of earmarks into per-operator aggregates, seeded by an optional
// existing operator list (used for incremental top-ups over a snapshot).
export function aggregate(
  earmarks: Earmark[],
  seed: Operator[] = [],
): Operator[] {
  const map = new Map<string, Operator>();
  for (const o of seed) map.set(o.address, { ...o, totalLink: o.totalLink });

  for (const e of earmarks) {
    const cur = map.get(e.operator);
    if (!cur) {
      map.set(e.operator, {
        address: e.operator,
        ens: null,
        totalLink: e.amount.toString(),
        earmarks: 1,
        firstBlock: e.block,
        lastBlock: e.block,
        lastTs: e.ts,
      });
    } else {
      cur.totalLink = (BigInt(cur.totalLink) + e.amount).toString();
      cur.earmarks += 1;
      cur.firstBlock = Math.min(cur.firstBlock, e.block);
      cur.lastBlock = Math.max(cur.lastBlock, e.block);
      cur.lastTs = Math.max(cur.lastTs, e.ts);
    }
  }

  return [...map.values()].sort((a, b) =>
    BigInt(a.totalLink) < BigInt(b.totalLink) ? 1 : -1,
  );
}

export function grandTotal(operators: Operator[]): string {
  return operators
    .reduce((acc, o) => acc + BigInt(o.totalLink), 0n)
    .toString();
}

export function toSnapshot(
  operators: Operator[],
  meta: {
    fromBlock: number;
    latestBlock: number;
    linkUsd: number | null;
    generatedAt: number;
  },
): Snapshot {
  return {
    generatedAt: meta.generatedAt,
    fromBlock: meta.fromBlock,
    latestBlock: meta.latestBlock,
    totalEvents: operators.reduce((n, o) => n + o.earmarks, 0),
    totalLink: grandTotal(operators),
    linkUsd: meta.linkUsd,
    operators,
  };
}
