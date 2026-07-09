import snapshotJson from "./snapshot.json";
import type { Snapshot } from "./types";

const BASE = snapshotJson as unknown as Snapshot;

export type WarchestPoint = { ym: string; held: string };

// The stored monthly warchest series for an operator (empty if none traced).
export function getWarchestSeries(address: string): WarchestPoint[] {
  const w = (BASE.warchest ?? {})[address.toLowerCase()];
  return w ? w.map(([ym, held]) => ({ ym, held })) : [];
}
