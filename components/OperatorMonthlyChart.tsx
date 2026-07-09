import type { MonthPoint } from "@/lib/monthly";
import { fmtLink, fmtUsd, linkFromWei } from "@/lib/format";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Short month label, e.g. "Jun '26", from a "YYYY-MM" key.
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTHS[Number(m) - 1]} '${y.slice(2)}`;
}

// Stacked monthly bar chart (earmark vs direct) for one operator. Pure SVG with
// <title> tooltips — no client state, so it renders fine server-side.
export default function OperatorMonthlyChart({
  months,
  linkUsd,
}: {
  months: MonthPoint[];
  linkUsd: number | null;
}) {
  const max = Math.max(1, ...months.map((m) => linkFromWei(m.total)));
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
              <rect
                x={x}
                y={topPad + chartH - eH}
                width={barW}
                height={eH}
                rx="2"
                fill="#375bd2"
              />
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
              <text
                x={x + barW / 2}
                y={topPad + chartH + 14}
                textAnchor="middle"
                fontSize="10"
                fill="#5f6f8f"
              >
                {MONTHS[Number(m.ym.split("-")[1]) - 1]}
              </text>
              <text
                x={x + barW / 2}
                y={topPad + chartH + 26}
                textAnchor="middle"
                fontSize="9"
                fill="#4a5a7a"
              >
                '{m.ym.split("-")[0].slice(2)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
