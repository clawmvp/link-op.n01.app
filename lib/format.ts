// wei (18 decimals) string -> human LINK number
export function linkFromWei(wei: string): number {
  return Number(BigInt(wei) / 10n ** 12n) / 1e6; // keep 6 decimals of precision
}

export function fmtLink(wei: string, digits = 2): string {
  return linkFromWei(wei).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtUsd(wei: string, linkUsd: number | null): string | null {
  if (linkUsd == null) return null;
  const usd = linkFromWei(wei) * linkUsd;
  if (usd >= 1_000_000)
    return "$" + (usd / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 }) + "M";
  if (usd >= 1_000)
    return "$" + (usd / 1_000).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "K";
  return "$" + usd.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function shortAddr(addr: string): string {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export function timeAgo(ts: number): string {
  if (!ts) return "—";
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  const d = Math.floor(s / 86400);
  if (d < 30) return d + "d ago";
  return Math.floor(d / 30) + "mo ago";
}
