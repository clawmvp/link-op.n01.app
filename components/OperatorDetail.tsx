"use client";

import { useEffect, type ReactNode } from "react";
import type { Operator } from "@/lib/types";
import type { MonthPoint } from "@/lib/monthly";
import { fmtLink, fmtUsd, linkFromWei, timeAgo } from "@/lib/format";
import { displayName } from "@/lib/labels";
import { SELF_OPERATOR } from "@/lib/config";
import { operatorStats } from "@/lib/stats";

// Short month label, e.g. "Jun '26", from a "YYYY-MM" key.
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const names = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${names[Number(m) - 1]} '${y.slice(2)}`;
}

function MonthlyChart({
  months,
  linkUsd,
}: {
  months: MonthPoint[];
  linkUsd: number | null;
}) {
  const max = Math.max(1, ...months.map((m) => linkFromWei(m.total)));
  // Layout in SVG user units; the viewBox scales responsively to the container.
  const barW = 34;
  const gap = 10;
  const chartH = 150;
  const labelH = 34;
  const topPad = 12;
  const width = months.length * (barW + gap) + gap;
  const height = chartH + labelH + topPad;

  return (
    <div className="scroll-x overflow-x-auto">
      <svg
        viewBox={`0 0 ${Math.max(width, 200)} ${height}`}
        width={Math.max(width, 200)}
        height={height}
        className="max-w-none"
        role="img"
        aria-label="Monthly revenue"
      >
        {/* baseline */}
        <line
          x1="0"
          y1={topPad + chartH}
          x2={Math.max(width, 200)}
          y2={topPad + chartH}
          stroke="#1f2b47"
          strokeWidth="1"
        />
        {months.map((m, i) => {
          const total = linkFromWei(m.total);
          const eLink = linkFromWei(m.earmarked);
          const dLink = linkFromWei(m.direct);
          const h = (total / max) * chartH;
          const eH = (eLink / max) * chartH;
          const dH = (dLink / max) * chartH;
          const x = gap + i * (barW + gap);
          const yTop = topPad + chartH - h;
          const usd = fmtUsd(m.total, linkUsd);
          return (
            <g key={m.ym}>
              <title>
                {monthLabel(m.ym)} · {fmtLink(m.total)} LINK
                {usd ? ` (${usd})` : ""} · {fmtLink(m.earmarked, 0)} earmark
                {dLink > 0 ? ` + ${fmtLink(m.direct, 0)} direct` : ""}
              </title>
              {/* earmark portion (bottom) */}
              <rect
                x={x}
                y={topPad + chartH - eH}
                width={barW}
                height={eH}
                rx="2"
                fill="#375bd2"
              />
              {/* direct portion (stacked on top) */}
              {dH > 0 && (
                <rect
                  x={x}
                  y={topPad + chartH - eH - dH}
                  width={barW}
                  height={dH}
                  rx="2"
                  fill="#5c7cfa"
                />
              )}
              {/* value on top */}
              <text
                x={x + barW / 2}
                y={yTop - 4}
                textAnchor="middle"
                fontSize="9"
                fill="#8494b0"
              >
                {total >= 1000
                  ? (total / 1000).toFixed(1) + "k"
                  : Math.round(total).toString()}
              </text>
              {/* month label */}
              <text
                x={x + barW / 2}
                y={topPad + chartH + 14}
                textAnchor="middle"
                fontSize="10"
                fill="#5f6f8f"
              >
                {monthLabel(m.ym).split(" ")[0]}
              </text>
              <text
                x={x + barW / 2}
                y={topPad + chartH + 26}
                textAnchor="middle"
                fontSize="9"
                fill="#4a5a7a"
              >
                {monthLabel(m.ym).split(" ")[1]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// A labelled statistic line used in the derived-stats grid.
function StatLine({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-500">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums text-ink-100">
        {value}
      </div>
    </div>
  );
}

// A signed percentage with a colour cue (green up / red down / grey flat).
function Delta({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-ink-500">—</span>;
  const up = pct > 0.5;
  const down = pct < -0.5;
  const cls = up ? "text-emerald-400" : down ? "text-rose-400" : "text-ink-400";
  const arrow = up ? "▲" : down ? "▼" : "→";
  return (
    <span className={cls}>
      {arrow} {Math.abs(pct).toFixed(pct >= 100 ? 0 : 1)}%
    </span>
  );
}

export default function OperatorDetail({
  operator,
  months,
  linkUsd,
  networkTotal,
  nowTs,
  onClose,
}: {
  operator: Operator;
  months: MonthPoint[];
  linkUsd: number | null;
  networkTotal: string;
  nowTs: number;
  onClose: () => void;
}) {
  // Close on Escape, and lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const isSelf = operator.address.toLowerCase() === SELF_OPERATOR;
  const { primary, secondary, isEns } = displayName(operator.address, operator.ens);
  const hasDirect = BigInt(operator.direct) > 0n;

  const stats = operatorStats(operator, months, networkTotal, nowTs);
  const best = stats.peak;

  const fmtAvg = (n: number) =>
    n.toLocaleString("en-US", { maximumFractionDigits: 0 });

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl rounded-2xl border border-ink-700 bg-ink-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-ink-800 px-6 py-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2
                className={`text-xl font-bold tracking-tight ${
                  isEns ? "text-link-light" : "text-ink-100"
                }`}
              >
                {primary}
              </h2>
              {isSelf && (
                <span className="rounded bg-link px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                  you
                </span>
              )}
            </div>
            {secondary && (
              <div className="mt-0.5 text-sm text-link-light/80">{secondary}</div>
            )}
            <a
              href={`https://etherscan.io/address/${operator.address}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block font-mono text-[11px] text-ink-500 hover:text-ink-300 hover:underline"
            >
              {operator.address} ↗
            </a>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg border border-ink-700 px-2.5 py-1 text-sm text-ink-400 transition hover:bg-ink-800 hover:text-ink-100"
          >
            Esc ✕
          </button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-px border-b border-ink-800 bg-ink-800 sm:grid-cols-4">
          {[
            {
              label: "Total",
              value: fmtLink(operator.totalLink, 0),
              sub: fmtUsd(operator.totalLink, linkUsd) ?? "LINK",
            },
            { label: "Last 30d", value: fmtLink(operator.last30, 0), sub: "LINK" },
            { label: "Last 90d", value: fmtLink(operator.last90, 0), sub: "LINK" },
            {
              label: "Payments",
              value: String(operator.earmarks),
              sub: `active ${timeAgo(operator.lastTs)}`,
            },
          ].map((s) => (
            <div key={s.label} className="bg-ink-950 px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-ink-500">
                {s.label}
              </div>
              <div className="mt-0.5 text-lg font-semibold tabular-nums text-ink-100">
                {s.value}
              </div>
              <div className="text-[11px] text-ink-500">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Derived statistics */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-6 pt-4 sm:grid-cols-3">
          <StatLine
            label="Share of network"
            value={`${stats.sharePct.toFixed(stats.sharePct >= 10 ? 1 : 2)}%`}
          />
          <StatLine
            label="Avg / active month"
            value={`${fmtAvg(stats.avgPerMonthLink)} LINK`}
          />
          <StatLine label="Months active" value={String(stats.monthsActive)} />
          <StatLine label="MoM (last month)" value={<Delta pct={stats.momPct} />} />
          <StatLine
            label="Momentum (3mo)"
            value={<Delta pct={stats.momentumPct} />}
          />
          <StatLine
            label="Direct share"
            value={`${stats.directPct.toFixed(0)}%`}
          />
        </div>

        {/* Source split + best month */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-6 pt-4 text-xs text-ink-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-link" />
            {fmtLink(operator.earmarked, 0)} earmark
          </span>
          {hasDirect && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-link-light" />
              {fmtLink(operator.direct, 0)} direct
            </span>
          )}
          {best && (
            <span className="ml-auto text-ink-500">
              Best month: {monthLabel(best.ym)} · {fmtLink(best.total, 0)} LINK
            </span>
          )}
        </div>

        {/* Monthly chart */}
        <div className="px-4 pt-3 sm:px-6">
          {months.length ? (
            <MonthlyChart months={months} linkUsd={linkUsd} />
          ) : (
            <p className="py-6 text-center text-sm text-ink-500">
              No dated monthly events for this operator.
            </p>
          )}
        </div>

        {/* Monthly table */}
        {months.length > 0 && (
          <div className="px-4 pb-6 sm:px-6">
            <div className="scroll-x overflow-x-auto rounded-xl border border-ink-800">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-800 text-[11px] uppercase tracking-wider text-ink-500">
                    <th className="px-4 py-2.5 font-medium">Month</th>
                    <th className="px-4 py-2.5 text-right font-medium">Earmark</th>
                    <th className="px-4 py-2.5 text-right font-medium">Direct</th>
                    <th className="px-4 py-2.5 text-right font-medium">Total</th>
                    <th className="px-4 py-2.5 text-right font-medium">USD</th>
                    <th className="px-4 py-2.5 text-right font-medium">#</th>
                  </tr>
                </thead>
                <tbody>
                  {[...months].reverse().map((m) => (
                    <tr
                      key={m.ym}
                      className="border-b border-ink-800/60 last:border-0"
                    >
                      <td className="px-4 py-2.5 text-ink-200">{monthLabel(m.ym)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-400">
                        {fmtLink(m.earmarked, 0)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-400">
                        {BigInt(m.direct) > 0n ? fmtLink(m.direct, 0) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-ink-100">
                        {fmtLink(m.total, 0)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-500">
                        {fmtUsd(m.total, linkUsd) ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-500">
                        {m.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
