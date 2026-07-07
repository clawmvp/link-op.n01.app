// Curated operator labels, keyed by lowercase address. These override / augment
// on-chain ENS reverse records for operators we can identify by hand.
// Add entries as operators are identified.
export const LABELS: Record<string, string> = {
  "0x7a30e4b6307c0db7aef247a656b44d888b23a2dc": "01node",
};

// Addresses that are not ordinary node operators (protocol/pool/aggregate
// recipients). Shown with a small tag so the ranking reads correctly.
export const NON_OPERATOR: Record<string, string> = {
  // Large recipient whose earmarks carry no per-period metadata — appears to be
  // a protocol-level / pooled recipient rather than a single node operator.
  "0x9a709b7b69ea42d5eeb1cebc48674c69e1569ec6": "pool / protocol?",
};

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
