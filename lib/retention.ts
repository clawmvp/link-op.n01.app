import { linkFromWei } from "./format";

// "Warchest" retention = LINK still held in the wallet as a share of all-time
// tracked revenue. Can exceed 100% if the wallet holds LINK beyond what we
// track (other income, transfers in). Returns null when either side is unknown.
export function retentionPct(
  heldWei: string | undefined,
  earnedWei: string,
): number | null {
  if (heldWei == null) return null;
  const earned = linkFromWei(earnedWei);
  if (earned <= 0) return null;
  return (linkFromWei(heldWei) / earned) * 100;
}

// Tailwind text-colour for a retention figure: green = kept most, amber = kept
// some, rose = sold most.
export function retentionClass(pct: number | null): string {
  if (pct == null) return "text-ink-500";
  if (pct >= 80) return "text-emerald-400";
  if (pct >= 40) return "text-amber-400";
  return "text-rose-400";
}

export function retentionLabel(
  heldWei: string | undefined,
  earnedWei: string,
): string {
  const pct = retentionPct(heldWei, earnedWei);
  if (pct == null) return "—";
  return `${pct.toFixed(0)}% kept`;
}
