"use client";

import { useMemo, useState } from "react";
import type { Operator } from "@/lib/types";
import { fmtLink, fmtUsd, timeAgo } from "@/lib/format";
import { displayName, NON_OPERATOR } from "@/lib/labels";
import { SELF_OPERATOR } from "@/lib/config";

type SortKey = "revenue" | "earmarks" | "last";

export default function OperatorsTable({
  operators,
  linkUsd,
}: {
  operators: Operator[];
  linkUsd: number | null;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("revenue");

  // rank is fixed by revenue (matches the canonical ordering)
  const ranked = useMemo(
    () => operators.map((o, i) => ({ ...o, rank: i + 1 })),
    [operators],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let r = ranked;
    if (needle) {
      r = r.filter((o) => {
        const { primary } = displayName(o.address, o.ens);
        return (
          o.address.toLowerCase().includes(needle) ||
          (o.ens ?? "").toLowerCase().includes(needle) ||
          primary.toLowerCase().includes(needle)
        );
      });
    }
    const s = [...r];
    if (sort === "revenue")
      s.sort((a, b) => (BigInt(a.totalLink) < BigInt(b.totalLink) ? 1 : -1));
    if (sort === "earmarks") s.sort((a, b) => b.earmarks - a.earmarks);
    if (sort === "last") s.sort((a, b) => b.lastTs - a.lastTs);
    return s;
  }, [ranked, q, sort]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search operator, ENS or address…"
          className="w-full sm:w-80 rounded-lg border border-ink-700 bg-ink-850/70 px-4 py-2.5 text-sm text-ink-100 placeholder-ink-600 outline-none focus:border-link-light"
        />
        <div className="flex items-center gap-1 text-xs text-ink-600">
          <span className="mr-1">Sort:</span>
          {(
            [
              ["revenue", "Revenue"],
              ["earmarks", "Earmarks"],
              ["last", "Last active"],
            ] as [SortKey, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              className={`rounded-md px-2.5 py-1 transition ${
                sort === k
                  ? "bg-link/25 text-ink-100"
                  : "text-ink-600 hover:text-ink-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-ink-600">
          {rows.length} operator{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="scroll-x overflow-x-auto rounded-xl border border-ink-800 bg-ink-900/60">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-800 text-xs uppercase tracking-wider text-ink-600">
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Operator</th>
              <th className="px-4 py-3 text-right font-medium">Revenue (LINK)</th>
              <th className="px-4 py-3 text-right font-medium">≈ USD</th>
              <th className="px-4 py-3 text-right font-medium">Earmarks</th>
              <th className="px-4 py-3 text-right font-medium">Last active</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const isSelf = o.address.toLowerCase() === SELF_OPERATOR;
              const { primary, secondary, isEns } = displayName(o.address, o.ens);
              const tag = NON_OPERATOR[o.address.toLowerCase()];
              const usd = fmtUsd(o.totalLink, linkUsd);
              return (
                <tr
                  key={o.address}
                  className={`border-b border-ink-800/60 transition hover:bg-ink-800/40 ${
                    isSelf ? "bg-link/10" : ""
                  }`}
                >
                  <td className="px-4 py-3 tabular-nums text-ink-600">{o.rank}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://etherscan.io/address/${o.address}`}
                        target="_blank"
                        rel="noreferrer"
                        className={`font-medium hover:underline ${
                          isEns ? "text-link-light" : "text-ink-100"
                        }`}
                      >
                        {primary}
                      </a>
                      {isSelf && (
                        <span className="rounded bg-link px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                          you
                        </span>
                      )}
                      {tag && (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                          {tag}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-ink-600">
                      {secondary ? (
                        <span className="text-link-light/80">{secondary} · </span>
                      ) : null}
                      {o.address.slice(0, 10)}…{o.address.slice(-8)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-ink-100">
                    {fmtLink(o.totalLink)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-400">
                    {usd ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-400">
                    {o.earmarks}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-600">
                    {timeAgo(o.lastTs)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
