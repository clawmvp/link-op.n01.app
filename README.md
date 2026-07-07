# link-op.n01.app — Chainlink Operator Revenue

A dashboard that maps **revenue per Chainlink node operator**, aggregated from the
on-chain `EarmarkSet` events of the Chainlink payments contract
[`0x5680681ED3767B96914CE741a308155C7fB9171d`](https://etherscan.io/address/0x5680681ED3767B96914CE741a308155C7fB9171d).

Live: **[link-op.n01.app](https://link-op.n01.app)**

## How it works

Each payout round the contract emits, per operator:

```
EarmarkSet(address indexed operator, uint256 indexed id, int96 amount, bytes data)
```

- `operator` — the node operator's address
- `amount` — LINK credited (18 decimals)
- `data` — encodes `(year, week, timestamp)` of the period

We index every `EarmarkSet` since the contract's first event, sum `amount` per
operator, reverse-resolve ENS names, and rank operators by total LINK earned.
Operators with a known name (ENS or curated) are shown by name; addresses that
aren't ordinary node operators are tagged.

## Data freshness

- `npm run refresh` → full-scans the chain and writes `lib/snapshot.json` (the render baseline).
- At runtime the site incrementally scans only new blocks and refreshes LINK/USD (ISR, 30 min).
- A weekly GitHub Action re-commits the snapshot so the runtime scan stays small.

No API keys required — it uses public RPC endpoints and CoinGecko, both with graceful fallback.

## Develop

```bash
npm install
npm run dev       # http://localhost:3000
npm run refresh   # regenerate lib/snapshot.json from on-chain data
npm run build
```

## Stack

Next.js 15 (App Router) · React 19 · Tailwind v3 · TypeScript · viem. Deployed on Vercel.
