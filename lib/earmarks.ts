import { rpc } from "./rpc";
import {
  PAYMENTS_CONTRACT,
  EARMARK_SET_TOPIC,
  LOG_WINDOW,
  LINK_TOKEN,
  LINK_TRANSFER_TOPIC,
  SAFE_CONTRACT,
} from "./config";
import type { Earmark, EventTuple, Operator } from "./types";

type RawLog = {
  topics: string[];
  data: string;
  blockNumber: string;
  blockTimestamp?: string;
};

const pad32 = (addr: string) => "0x" + addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");

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

export function earmarksToEvents(earmarks: Earmark[]): EventTuple[] {
  return earmarks.map((e) => [e.operator, e.amount.toString(), e.ts, e.block, "e"]);
}

// Fetch block timestamps for a set of block numbers (deduped), with limited
// concurrency. Used to date direct LINK transfers when the RPC doesn't return
// blockTimestamp on the logs.
async function blockTimestamps(
  blocks: number[],
  concurrency = 8,
): Promise<Map<number, number>> {
  const uniq = [...new Set(blocks)];
  const out = new Map<number, number>();
  for (let i = 0; i < uniq.length; i += concurrency) {
    const batch = uniq.slice(i, i + concurrency);
    const res = await Promise.all(
      batch.map((b) =>
        rpc<{ timestamp: string } | null>("eth_getBlockByNumber", [
          "0x" + b.toString(16),
          false,
        ]).catch(() => null),
      ),
    );
    batch.forEach((b, j) => {
      const ts = res[j]?.timestamp;
      if (ts) out.set(b, parseInt(ts, 16));
    });
  }
  return out;
}

// Fetch direct LINK transfers OUT of the treasury Safe in [fromBlock, toBlock],
// keeping only those whose recipient is in `allowed` (the tracked operators).
// Returns compact events tagged as source 'd'.
export async function fetchSafeTransfers(
  fromBlock: number,
  toBlock: number,
  allowed: Set<string>,
): Promise<EventTuple[]> {
  const raw: { to: string; amount: string; block: number; ts: number }[] = [];
  const needTs: number[] = [];

  for (let b = fromBlock; b <= toBlock; b += LOG_WINDOW) {
    const to = Math.min(b + LOG_WINDOW - 1, toBlock);
    const logs = await rpc<RawLog[]>("eth_getLogs", [
      {
        fromBlock: "0x" + b.toString(16),
        toBlock: "0x" + to.toString(16),
        address: LINK_TOKEN,
        topics: [LINK_TRANSFER_TOPIC, pad32(SAFE_CONTRACT)],
      },
    ]);
    for (const l of logs) {
      const recipient = ("0x" + l.topics[2].slice(-40)).toLowerCase();
      if (!allowed.has(recipient)) continue;
      const block = parseInt(l.blockNumber, 16);
      const ts = l.blockTimestamp ? parseInt(l.blockTimestamp, 16) : 0;
      if (!ts) needTs.push(block);
      raw.push({ to: recipient, amount: BigInt(l.data).toString(), block, ts });
    }
  }

  if (needTs.length) {
    const tsMap = await blockTimestamps(needTs);
    for (const r of raw) if (!r.ts) r.ts = tsMap.get(r.block) ?? 0;
  }

  return raw.map((r) => [r.to, r.amount, r.ts, r.block, "d"]);
}

type AggregateOptions = {
  now: number; // unix seconds — windows are relative to this
  ens?: Record<string, string | null>;
  exclude?: Set<string>; // addresses to drop (e.g. pool/protocol recipients)
  activeWithinDays?: number; // drop operators with no earmark in this window
};

// Fold compact events into per-operator aggregates, computing rolling 30d/90d
// windows relative to `now`, then applying exclusions / activity filter.
export function aggregateEvents(
  events: EventTuple[],
  opts: AggregateOptions,
): Operator[] {
  const ens = opts.ens ?? {};
  const c30 = opts.now - 30 * 86400;
  const c90 = opts.now - 90 * 86400;
  const map = new Map<string, Operator>();

  for (const [op, amtS, ts, block, source] of events) {
    const amt = BigInt(amtS);
    let cur = map.get(op);
    if (!cur) {
      cur = {
        address: op,
        ens: ens[op] ?? null,
        totalLink: "0",
        earmarked: "0",
        direct: "0",
        last30: "0",
        last90: "0",
        earmarks: 0,
        firstBlock: block,
        lastBlock: block,
        lastTs: ts,
      };
      map.set(op, cur);
    }
    cur.totalLink = (BigInt(cur.totalLink) + amt).toString();
    if (source === "d") cur.direct = (BigInt(cur.direct) + amt).toString();
    else cur.earmarked = (BigInt(cur.earmarked) + amt).toString();
    if (ts >= c30) cur.last30 = (BigInt(cur.last30) + amt).toString();
    if (ts >= c90) cur.last90 = (BigInt(cur.last90) + amt).toString();
    cur.earmarks += 1;
    cur.firstBlock = Math.min(cur.firstBlock, block);
    cur.lastBlock = Math.max(cur.lastBlock, block);
    cur.lastTs = Math.max(cur.lastTs, ts);
  }

  let ops = [...map.values()];
  if (opts.exclude) ops = ops.filter((o) => !opts.exclude!.has(o.address));
  if (opts.activeWithinDays != null) {
    const cut = opts.now - opts.activeWithinDays * 86400;
    ops = ops.filter((o) => o.lastTs >= cut);
  }
  ops.sort((a, b) => (BigInt(a.totalLink) < BigInt(b.totalLink) ? 1 : -1));
  return ops;
}

export function sumField(
  operators: Operator[],
  field: "totalLink" | "earmarked" | "direct" | "last30" | "last90",
): string {
  return operators.reduce((acc, o) => acc + BigInt(o[field]), 0n).toString();
}

// The set of addresses that received at least one EarmarkSet accrual — i.e. the
// tracked node operators. Used to scope direct treasury transfers.
export function earmarkOperatorSet(events: EventTuple[]): Set<string> {
  const s = new Set<string>();
  for (const [op, , , , source] of events) if (source === "e") s.add(op);
  return s;
}
