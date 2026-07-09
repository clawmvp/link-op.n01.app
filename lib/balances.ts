import { rpc } from "./rpc";
import { LINK_TOKEN } from "./config";

// ERC-20 balanceOf(address) selector.
const BALANCE_OF = "0x70a08231";

function encodeBalanceOf(addr: string): string {
  return BALANCE_OF + addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

// Current LINK wallet balance for each address, via eth_call to the LINK token.
// Batched with limited concurrency; individual failures are skipped (that
// address just gets no balance) so a flaky RPC never breaks the whole page.
export async function fetchLinkBalances(
  addresses: string[],
  concurrency = 8,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const uniq = [...new Set(addresses.map((a) => a.toLowerCase()))];

  for (let i = 0; i < uniq.length; i += concurrency) {
    const batch = uniq.slice(i, i + concurrency);
    const res = await Promise.all(
      batch.map((a) =>
        rpc<string>("eth_call", [
          { to: LINK_TOKEN, data: encodeBalanceOf(a) },
          "latest",
        ]).catch(() => null),
      ),
    );
    batch.forEach((a, j) => {
      const hex = res[j];
      if (hex && hex !== "0x") {
        try {
          out[a] = BigInt(hex).toString();
        } catch {
          /* malformed result — skip this address */
        }
      }
    });
  }
  return out;
}
