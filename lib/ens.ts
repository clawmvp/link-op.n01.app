import { createPublicClient, fallback, http } from "viem";
import { mainnet } from "viem/chains";
import { RPCS } from "./config";

const client = createPublicClient({
  chain: mainnet,
  transport: fallback(RPCS.map((u) => http(u))),
});

export async function ensName(address: string): Promise<string | null> {
  try {
    return await client.getEnsName({ address: address as `0x${string}` });
  } catch {
    return null;
  }
}

// Reverse-resolve a list of addresses, with limited concurrency to be gentle
// on public RPCs.
export async function resolveEns(
  addresses: string[],
  concurrency = 4,
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (let i = 0; i < addresses.length; i += concurrency) {
    const batch = addresses.slice(i, i + concurrency);
    const names = await Promise.all(batch.map((a) => ensName(a)));
    batch.forEach((a, j) => (out[a] = names[j]));
  }
  return out;
}
