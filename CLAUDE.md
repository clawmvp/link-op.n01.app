# Project: link-op.n01.app

A dashboard mapping **revenue per Chainlink node operator**, deployed at
**link-op.n01.app**. Public source on GitHub.

## What it shows
Revenue = LINK credited to each operator, aggregated from on-chain
`EarmarkSet` events emitted by the Chainlink payments contract
`0x5680681ED3767B96914CE741a308155C7fB9171d`.

- Event: `EarmarkSet(address indexed operator, uint256 indexed id, int96 amount, bytes data)`
  - `topic[1]` = operator address, `topic[2]` = id
  - data = `(int96 amount, bytes payload)`; `payload` = `(uint year, uint week, uint timestamp)`
  - `amount` is LINK (18 decimals). See [`lib/earmarks.ts`](lib/earmarks.ts) `decodeEarmark`.
- 01node = `0x7a30e4b6307c0db7aef247a656b44d888b23a2dc` (highlighted, "you" badge).
- `0x9a709b…9ec6` is a large recipient with no per-period metadata — flagged as
  `pool / protocol?` in [`lib/labels.ts`](lib/labels.ts), not a normal node operator.

## Stack & deploy
- Next.js 15 (App Router) + React 19 + Tailwind v3 + TypeScript + viem.
- Node 18 on this machine → pinned to Next 15.x.
- Vercel, team `clawmvps-projects`. Domain `link-op.n01.app`. Auto-deploy on push to `main`.
- No DB, no auth. Data lives in a committed snapshot + a light runtime top-up.

## Data model — how freshness works
1. [`scripts/refresh.ts`](scripts/refresh.ts) (`npm run refresh`) full-scans EarmarkSet
   from `DEPLOY_BLOCK` to head, resolves ENS, fetches LINK/USD, and writes the
   committed **[`lib/snapshot.json`](lib/snapshot.json)** — the render baseline.
2. At request time, [`lib/data.ts`](lib/data.ts) (`getData`, ISR `revalidate=1800`)
   incrementally scans only blocks *after* the snapshot and refreshes the price.
   Any failure falls back to the snapshot as-is, so the page never breaks.
3. A weekly GitHub Action re-runs `refresh` and commits the snapshot, so the
   incremental scan window never grows unbounded. Re-run it manually anytime.

## Config
Everything on-chain lives in [`lib/config.ts`](lib/config.ts): contract address,
event topic, deploy block, LINK token, self operator, RPC fallback list.
No API keys required — public RPCs + CoinGecko (both optional/graceful).

## Adding an operator label
Reverse-ENS covers only operators who set it. Add known names by hand in
[`lib/labels.ts`](lib/labels.ts) `LABELS` (keyed by lowercase address).
