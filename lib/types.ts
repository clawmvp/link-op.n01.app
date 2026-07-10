// Revenue source of an event: 'e' = EarmarkSet accrual, 'd' = direct LINK
// transfer from the treasury Safe.
export type Source = "e" | "d";

export type Operator = {
  address: string;
  ens: string | null;
  totalLink: string; // all-time combined, wei (18 decimals) as decimal string
  earmarked: string; // portion from EarmarkSet, wei
  direct: string; // portion from direct treasury LINK transfers, wei
  last30: string; // combined revenue in the last 30 days, wei
  last90: string; // combined revenue in the last 90 days, wei
  earmarks: number; // number of revenue events (both sources)
  firstBlock: number;
  lastBlock: number;
  lastTs: number; // unix seconds of the most recent event
  held?: string; // current LINK balance in the operator's main wallet, wei
  coldHeld?: string; // LINK held in traced cold-storage wallets (≤3 hops), wei
  // per cold wallet: counted held (wei), the LINK that flowed in, and where from.
  cold?: {
    wallet: string;
    held: string;
    inflow: string;
    parent: string;
    hop: number;
  }[];
  staked?: string; // total LINK staked across official venues, wei
  // per staking venue: source key (see STAKING_SOURCES) and staked LINK, wei.
  stakedBy?: { source: string; amount: string }[];
};

// Compact event row stored in the snapshot:
// [operator, amountWei, ts, block, source].
export type EventTuple = [string, string, number, number, Source];

export type Snapshot = {
  generatedAt: number; // unix seconds
  fromBlock: number;
  latestBlock: number;
  linkUsd: number | null;
  ens: Record<string, string | null>; // resolved reverse-ENS, keyed by address
  events: EventTuple[]; // every decoded EarmarkSet, chronological
  // Traced cold-storage wallets per operator: [wallet, inflowWei, parent, hop].
  cold?: Record<string, [string, string, string, number][]>;
  // Warchest over time per operator: ascending [ym, combinedHeldWei] — the LINK
  // balance of the operator's cluster (main + cold wallets) at each month end.
  warchest?: Record<string, [string, string][]>;
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
