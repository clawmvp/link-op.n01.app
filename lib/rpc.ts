import { RPCS } from "./config";

// Minimal JSON-RPC helper with multi-endpoint fallback. Public RPCs rate-limit
// and occasionally 403, so we rotate through a list until one answers.
export async function rpc<T = unknown>(
  method: string,
  params: unknown[],
): Promise<T> {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  let lastErr: unknown;
  for (const url of RPCS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "link-op.n01.app" },
        body,
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(`${url} RPC ${json.error.message}`);
      return json.result as T;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export async function blockNumber(): Promise<number> {
  return parseInt(await rpc<string>("eth_blockNumber", []), 16);
}
