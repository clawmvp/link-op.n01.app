# Project: link-op.n01.app

A dashboard mapping **revenue per Chainlink node operator**, deployed at
**link-op.n01.app**. Public source on GitHub.

## What it shows
Per-operator revenue = **earmarked + direct**, combined from two on-chain sources
(each event tagged with a `source` of `'e'` or `'d'` in the snapshot):

1. **EarmarkSet ledger** — contract `0x5680681ED3767B96914CE741a308155C7fB9171d`:
   `EarmarkSet(address indexed operator, uint256 indexed id, int96 amount, bytes data)`
   - `topic[1]` = operator, `topic[2]` = id; data = `(int96 amount, bytes payload)`;
     `payload` = `(uint year, uint week, uint timestamp)`; `amount` is LINK (18 dec).
   - See [`lib/earmarks.ts`](lib/earmarks.ts) `decodeEarmark`.
2. **Treasury Safe** `0x77dD1A9b170E2F8976c20c10c8d9c27886181077` (a Gnosis Safe —
   `SafeReceived` is incoming ETH, ignore). Payouts OUT = LINK `Transfer(from=Safe)`.
   Indexed via `fetchSafeTransfers`, **scoped to addresses that appear in EarmarkSet**
   (the tracked operators); ~500 other grant/tail recipients are intentionally excluded.
   Its biggest outflow funds the earmark contract itself — excluded.

- Only operators paid in the **last 30 days** are shown (active filter).
- 01node = `0x7a30e4b6307c0db7aef247a656b44d888b23a2dc` (highlighted, "you" badge).
- Excluded infra ([`lib/labels.ts`](lib/labels.ts) `EXCLUDE`): pool `0x9a70…9ec6`
  (4.2M LINK, no period metadata), the earmark contract, the Safe, counterparty `0x1c911…`.
- Caveat: earmark is an accrual ledger; the Safe's direct LINK *could* partly overlap
  it. Kept split (earmark vs direct) for transparency; summing was the explicit ask.

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
