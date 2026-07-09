"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Operator } from "@/lib/types";
import type { MonthlyByOperator } from "@/lib/monthly";
import { fmtLink, fmtUsd, timeAgo } from "@/lib/format";
import { displayName } from "@/lib/labels";
import { SELF_OPERATOR } from "@/lib/config";
import Sparkline from "./Sparkline";

type SortKey = "totalLink" | "last30" | "last90";

const SORTS: [SortKey, string][] = [
  ["totalLink", "Total"],
  ["last30", "Last 30d"],
  ["last90", "Last 90d"],
];

export default function OperatorsTable({
  operators,
  monthly,
  linkUsd,
}: {
  operators: Operator[];
  monthly: MonthlyByOperator;
  linkUsd: number | null;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("totalLink");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let r = operators;
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
    return [...r]
      .sort((a, b) => (BigInt(a[sort]) < BigInt(b[sort]) ? 1 : -1))
      .map((o, i) => ({ ...o, rank: i + 1 }));
  }, [operators, q, sort]);

  const colClass = (k: SortKey) =>
    `px-4 py-3 text-right font-medium ${sort === k ? "text-ink-100" : ""}`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search operator, ENS or address…"
          className="w-full sm:w-80 rounded-lg border border-ink-700 bg-ink-850/70 px-4 py-2.5 text-sm text-ink-100 placeholder-ink-500 outline-none focus:border-link-light"
        />
        <div className="flex items-center gap-1 text-xs text-ink-500">
          <span className="mr-1">Sort by:</span>
          {SORTS.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              className={`rounded-md px-2.5 py-1 transition ${
                sort === k
                  ? "bg-link/25 text-ink-100"
                  : "text-ink-500 hover:text-ink-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-ink-500">
          {rows.length} active operator{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="scroll-x overflow-x-auto rounded-xl border border-ink-800 bg-ink-900/60">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-800 text-xs uppercase tracking-wider text-ink-500">
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Operator</th>
              <th className={colClass("totalLink")}>Total (LINK)</th>
              <th className={colClass("last30")}>Last 30d</th>
              <th className={colClass("last90")}>Last 90d</th>
              <th className="px-4 py-3 text-center font-medium">14-mo trend</th>
              <th className="px-4 py-3 text-right font-medium">Last active</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const isSelf = o.address.toLowerCase() === SELF_OPERATOR;
              const { primary, secondary, isEns } = displayName(o.address, o.ens);
              const usd = fmtUsd(o.totalLink, linkUsd);
              return (
                <tr
                  key={o.address}
                  onClick={() => router.push(`/op/${o.address}`)}
                  title="Open month-by-month detail page"
                  className={`group cursor-pointer border-b border-ink-800/60 transition hover:bg-ink-800/40 ${
                    isSelf ? "bg-link/10" : ""
                  }`}
                >
                  <td className="px-4 py-3 tabular-nums text-ink-500">{o.rank}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/op/${o.address}`}
                        onClick={(e) => e.stopPropagation()}
                        className={`font-medium hover:underline ${
                          isEns ? "text-link-light" : "text-ink-100"
                        }`}
                      >
                        {primary}
                      </Link>
                      {isSelf && (
                        <span className="rounded bg-link px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                          you
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-ink-500">
                      {secondary ? (
                        <span className="text-link-light/80">{secondary} · </span>
                      ) : null}
                      {o.address.slice(0, 10)}…{o.address.slice(-8)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-ink-100">
                    {fmtLink(o.totalLink)}
                    <span className="block text-[11px] font-normal text-ink-500">
                      {usd ? usd + " · " : ""}
                      {fmtLink(o.earmarked, 0)} earmark
                      {BigInt(o.direct) > 0n ? ` + ${fmtLink(o.direct, 0)} direct` : ""}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-300">
                    {fmtLink(o.last30)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-300">
                    {fmtLink(o.last90)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Sparkline months={monthly[o.address] ?? []} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-500">
                    <span className="inline-flex items-center gap-2">
                      {timeAgo(o.lastTs)}
                      <span className="text-ink-600 transition group-hover:text-ink-300">
                        ›
                      </span>
                    </span>
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
