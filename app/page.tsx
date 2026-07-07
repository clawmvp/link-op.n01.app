import { getData } from "@/lib/data";
import { fmtLink, fmtUsd } from "@/lib/format";
import { displayName } from "@/lib/labels";
import { PAYMENTS_CONTRACT, SELF_OPERATOR } from "@/lib/config";
import OperatorsTable from "@/components/OperatorsTable";

export const revalidate = 1800;

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string | null;
}) {
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900/60 px-5 py-4">
      <div className="text-xs uppercase tracking-wider text-ink-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-ink-100">
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-ink-500">{sub}</div> : null}
    </div>
  );
}

export default async function Home() {
  const data = await getData();
  const { operators, linkUsd, totalLink, totalEvents } = data;

  const selfIdx = operators.findIndex(
    (o) => o.address.toLowerCase() === SELF_OPERATOR,
  );
  const self = selfIdx >= 0 ? operators[selfIdx] : null;

  const updated = new Date(data.generatedAt * 1000).toISOString().slice(0, 16).replace("T", " ");

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <header className="mb-8">
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-link" />
          <span className="text-xs font-medium uppercase tracking-widest text-link-light">
            Chainlink · Operator Revenue
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-ink-100 sm:text-4xl">
          Revenue per Chainlink operator
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-400">
          Mapped from on-chain{" "}
          <code className="rounded bg-ink-850 px-1.5 py-0.5 text-xs text-ink-200">
            EarmarkSet
          </code>{" "}
          events emitted by the payments contract{" "}
          <a
            href={`https://etherscan.io/address/${PAYMENTS_CONTRACT}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-link-light hover:underline"
          >
            {PAYMENTS_CONTRACT.slice(0, 8)}…{PAYMENTS_CONTRACT.slice(-6)}
          </a>
          . Each earmark records the LINK credited to an operator for a period.
        </p>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Total distributed"
          value={`${fmtLink(totalLink, 0)}`}
          sub={`LINK · ${fmtUsd(totalLink, linkUsd) ?? "—"}`}
        />
        <Stat label="Operators" value={String(operators.length)} sub="unique addresses" />
        <Stat label="Earmarks" value={totalEvents.toLocaleString()} sub="events indexed" />
        {self ? (
          <Stat
            label="01node"
            value={`${fmtLink(self.totalLink, 0)}`}
            sub={`LINK · rank #${selfIdx + 1}`}
          />
        ) : (
          <Stat label="LINK / USD" value={linkUsd ? `$${linkUsd}` : "—"} />
        )}
      </section>

      <OperatorsTable operators={operators} linkUsd={linkUsd} />

      <footer className="mt-10 flex flex-col gap-2 border-t border-ink-800 pt-6 text-xs text-ink-600 sm:flex-row sm:items-center sm:justify-between">
        <div>
          Data range: block {data.fromBlock.toLocaleString()} →{" "}
          {data.latestBlock.toLocaleString()} · updated {updated} UTC
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://etherscan.io/token/0x514910771af9ca656af840dff83e8264ecf986ca"
            target="_blank"
            rel="noreferrer"
            className="hover:text-ink-300"
          >
            LINK token
          </a>
          <a
            href="https://github.com/clawmvp/link-op.n01.app"
            target="_blank"
            rel="noreferrer"
            className="hover:text-ink-300"
          >
            Source ↗
          </a>
        </div>
      </footer>
    </main>
  );
}
