export type Operator = {
  address: string;
  ens: string | null;
  totalLink: string; // amount in wei (18 decimals) as a decimal string
  earmarks: number; // number of EarmarkSet events
  firstBlock: number;
  lastBlock: number;
  lastTs: number; // unix seconds of the most recent earmark
};

export type Snapshot = {
  generatedAt: number; // unix seconds
  fromBlock: number;
  latestBlock: number;
  totalEvents: number;
  totalLink: string; // grand total in wei
  linkUsd: number | null;
  operators: Operator[]; // sorted desc by totalLink
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
