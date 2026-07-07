// Fetch the current LINK/USD price (best effort). Returns null on failure so
// the UI can gracefully hide USD values.
export async function linkUsd(): Promise<number | null> {
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=chainlink&vs_currencies=usd",
      { cache: "no-store" },
    );
    const j = await r.json();
    const p = j?.chainlink?.usd;
    return typeof p === "number" ? p : null;
  } catch {
    return null;
  }
}
