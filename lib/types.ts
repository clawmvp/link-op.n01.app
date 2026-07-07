export type Operator = {
  address: string;
  ens: string | null;
  totalLink: string; // all-time, wei (18 decimals) as decimal string
  last30: string; // revenue in the last 30 days, wei
  last90: string; // revenue in the last 90 days, wei
  earmarks: number; // number of EarmarkSet events
  firstBlock: number;
  lastBlock: number;
  lastTs: number; // unix seconds of the most recent earmark
};

// Compact event row stored in the snapshot: [operator, amountWei, ts, block].
export type EventTuple = [string, string, number, number];

export type Snapshot = {
  generatedAt: number; // unix seconds
  fromBlock: number;
  latestBlock: number;
  linkUsd: number | null;
  ens: Record<string, string | null>; // resolved reverse-ENS, keyed by address
  events: EventTuple[]; // every decoded EarmarkSet, chronological
};

// One decoded EarmarkSet event.
export type Earmark = {
  operator: string;
  id: string;
  amount: bigint;
  year: number;
  week: number;
  ts: number;
  block: number;
};
