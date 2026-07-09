// Curated operator labels, keyed by lowercase address. These override / augment
// on-chain ENS reverse records for operators we can identify by hand.
// Add entries as operators are identified.
export const LABELS: Record<string, string> = {
  "0x7a30e4b6307c0db7aef247a656b44d888b23a2dc": "01node",
};

// Addresses excluded from the dashboard entirely — not ordinary node operators
// (protocol / pooled / aggregate recipients).
export const EXCLUDE = new Set<string>([
  // Large recipient (~4.2M LINK) whose earmarks carry no per-period metadata —
  // a protocol-level / pooled recipient, not a single node operator.
  "0x9a709b7b69ea42d5eeb1cebc48674c69e1569ec6",
  // Infrastructure addresses, in case they ever appear as recipients:
  "0x5680681ed3767b96914ce741a308155c7fb9171d", // the earmark payments contract
  "0x77dd1a9b170e2f8976c20c10c8d9c27886181077", // the treasury Safe itself
  "0x1c911eec9b3016716c5e708b02d3b4f679807954", // treasury counterparty / router
]);

// Known exchange / bridge / market-maker addresses. The cold-storage tracer
// never follows into these and never counts their balances — a deposit to an
// exchange is a sale, not self-custody. Best-effort list; the tracer's other
// guards (skip contracts, cap counted amount to what the cluster actually sent)
// bound any misattribution even for services not listed here.
export const KNOWN_SERVICES = new Set<string>([
  "0x0000000000000000000000000000000000000000", // null / burn
  "0x000000000000000000000000000000000000dead", // burn
  "0x28c6c06298d514db089934071355e5743bf21d60", // Binance 14
  "0x21a31ee1afc51d94c2efccaa2092ad1028285549", // Binance 15
  "0xdfd5293d8e347dfe59e90efd55b2956a1343963d", // Binance 16
  "0x56eddb7aa87536c09ccc2793473599fd21a8b17f", // Binance 17
  "0x9696f59e4d72e237be84ffd425dcad154bf96976", // Binance 18
  "0x4976a4a02f38326660d17bf34b431dc6e2eb2327", // Binance 20 (LINK-heavy)
  "0x71660c4005ba85c37ccec55d0c4493e66fe775d3", // Coinbase 1
  "0x503828976d22510aad0201ac7ec88293211d23da", // Coinbase 2
  "0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740", // Coinbase 3
  "0x3cd751e6b0078be393132286c442345e5dc49699", // Coinbase 4
  "0xa910f92acdaf488fa6ef02174fb86208ad7722ba", // Kraken
  "0x2910543af39aba0cd09dbb2d50200b3e800a63d2", // Kraken 4
  "0x6cc5f688a315f3dc28a7781717a9a798a59fda7b", // OKX
  "0xf89d7b9c864f589bbf53a82105107622b35eaa40", // Bybit
]);

export function displayName(
  address: string,
  ens: string | null,
): { primary: string; secondary: string | null; isEns: boolean } {
  const label = LABELS[address.toLowerCase()];
  if (label) return { primary: label, secondary: ens, isEns: false };
  if (ens) return { primary: ens, secondary: null, isEns: true };
  return { primary: shortForName(address), secondary: null, isEns: false };
}

function shortForName(addr: string): string {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}
