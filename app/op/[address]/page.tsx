import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getData } from "@/lib/data";
import { fmtLink, fmtUsd, timeAgo } from "@/lib/format";
import { displayName } from "@/lib/labels";
import { SELF_OPERATOR } from "@/lib/config";
import { operatorStats } from "@/lib/stats";
import { retentionPct, retentionClass } from "@/lib/retention";
import { StatLine, Delta } from "@/components/StatBits";
import OperatorMonthlyChart, {
  monthLabel,
} from "@/components/OperatorMonthlyChart";

export const revalidate = 1800;

type Params = { address: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { address } = await params;
  const data = await getData();
  const op = data.operators.find(
    (o) => o.address.toLowerCase() === address.toLowerCase(),
  );
  const name = op ? displayName(op.address, op.ens).primary : address;
  return { title: `${name} — Chainlink Operator Revenue` };
}

export default async function OperatorPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { address } = await params;
  const data = await getData();
  const addr = address.toLowerCase();

  const idx = data.operators.findIndex((o) => o.address.toLowerCase() === addr);
  if (idx < 0) notFound();

  const operator = data.operators[idx];
  const months = data.monthly[operator.address] ?? [];
  const { linkUsd } = data;

  const isSelf = operator.address.toLowerCase() === SELF_OPERATOR;
  const { primary, secondary, isEns } = displayName(operator.address, operator.ens);
  const hasDirect = BigInt(operator.direct) > 0n;

  const stats = operatorStats(operator, months, data.totalLink, data.generatedAt);
  const best = stats.peak;
  const fmtAvg = (n: number) =>
    n.toLocaleString("en-US", { maximumFractionDigits: 0 });

  const mainHeld = operator.held;
  const coldHeld = operator.coldHeld;
  const held =
    mainHeld != null || coldHeld != null
      ? (BigInt(mainHeld ?? "0") + BigInt(coldHeld ?? "0")).toString()
      : undefined;
  const retPct = retentionPct(held, operator.totalLink);

  const summary = [
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
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-400 transition hover:text-ink-100"
      >
        ← All operators
      </Link>

      {/* Header */}
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1
            className={`text-2xl font-bold tracking-tight sm:text-3xl ${
              isEns ? "text-link-light" : "text-ink-100"
            }`}
          >
            {primary}
          </h1>
          <span className="rounded bg-ink-800 px-2 py-0.5 text-xs font-medium text-ink-300">
            rank #{idx + 1}
          </span>
          {isSelf && (
            <span className="rounded bg-link px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
              you
            </span>
          )}
        </div>
        {secondary && (
          <div className="mt-1 text-sm text-link-light/80">{secondary}</div>
        )}
        <a
          href={`https://etherscan.io/address/${operator.address}`}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block font-mono text-[11px] text-ink-500 hover:text-ink-300 hover:underline"
        >
          {operator.address} ↗
        </a>
      </header>

      {/* Summary tiles */}
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summary.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-ink-800 bg-ink-900/60 px-4 py-3"
          >
            <div className="text-[10px] uppercase tracking-wider text-ink-500">
              {s.label}
            </div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums text-ink-100">
              {s.value}
            </div>
            <div className="text-[11px] text-ink-500">{s.sub}</div>
          </div>
        ))}
      </section>

      {/* Derived stats */}
      <section className="mb-6 grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-ink-800 bg-ink-900/60 px-5 py-4 sm:grid-cols-3">
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
        <StatLine label="Momentum (3mo)" value={<Delta pct={stats.momentumPct} />} />
        <StatLine label="Direct share" value={`${stats.directPct.toFixed(0)}%`} />
      </section>

      {/* Warchest — how much of what they earned is still in the wallet */}
      <section className="mb-6 rounded-xl border border-ink-800 bg-ink-900/60 px-5 py-4">
        <div className="text-xs uppercase tracking-wider text-ink-500">
          Warchest — LINK still held
        </div>
        {held != null ? (
          <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums text-ink-100">
                {fmtLink(held, 0)}
              </span>
              <span className="text-sm text-ink-400">LINK</span>
              {fmtUsd(held, linkUsd) && (
                <span className="text-sm text-ink-500">
                  · {fmtUsd(held, linkUsd)}
                </span>
              )}
            </div>
            <div className="text-sm">
              <span className={`font-semibold ${retentionClass(retPct)}`}>
                {retPct != null ? `${retPct.toFixed(0)}% kept` : "—"}
              </span>
              <span className="text-ink-500">
                {" "}
                of {fmtLink(operator.totalLink, 0)} LINK earned
              </span>
            </div>
            {coldHeld != null && BigInt(coldHeld) > 0n && (
              <div className="text-sm text-ink-400">
                {fmtLink(mainHeld ?? "0", 0)} main wallet{" "}
                <span className="text-sky-400/80">
                  + {fmtLink(coldHeld, 0)} cold storage?
                </span>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-500">
            Wallet balance unavailable right now.
          </p>
        )}

        {operator.cold && operator.cold.length > 0 && (
          <div className="mt-3 border-t border-ink-800 pt-3">
            <div className="text-[11px] uppercase tracking-wider text-ink-600">
              Maybe cold storage · traced ≤3 hops
            </div>
            <ul className="mt-1.5 space-y-1">
              {operator.cold.map((c) => (
                <li
                  key={c.wallet}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <a
                    href={`https://etherscan.io/address/${c.wallet}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-link-light hover:underline"
                  >
                    {c.wallet.slice(0, 10)}…{c.wallet.slice(-8)}
                  </a>
                  <span className="tabular-nums text-ink-300">
                    {fmtLink(c.held, 0)} LINK
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-ink-600">
          Current LINK balance of the main wallet plus any self-custody wallets we
          could trace within 3 hops (each capped to what this operator actually
          sent there). Can exceed 100% if wallets hold LINK from other sources;
          cold-storage attribution is heuristic — treat as a directional
          &ldquo;kept vs. moved&rdquo; signal, not exact savings.
        </p>
      </section>

      {/* Source split + best month */}
      <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-ink-400">
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
      <section className="mb-6 rounded-xl border border-ink-800 bg-ink-900/60 p-4 sm:p-5">
        {months.length ? (
          <OperatorMonthlyChart months={months} linkUsd={linkUsd} />
        ) : (
          <p className="py-6 text-center text-sm text-ink-500">
            No dated monthly events for this operator.
          </p>
        )}
      </section>

      {/* Monthly table */}
      {months.length > 0 && (
        <section className="scroll-x overflow-x-auto rounded-xl border border-ink-800">
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
        </section>
      )}
    </main>
  );
}
