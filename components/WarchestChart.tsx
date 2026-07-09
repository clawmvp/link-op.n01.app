import { fmtLink, fmtUsd, linkFromWei } from "@/lib/format";
import type { WarchestPoint } from "@/lib/warchest";
import { monthLabel } from "./OperatorMonthlyChart";

// Warchest (LINK held across main + cold wallets) over time. Pure SVG area
// chart with <title> hover tooltips — renders server-side, scales to width.
export default function WarchestChart({
  series,
  linkUsd,
}: {
  series: WarchestPoint[];
  linkUsd: number | null;
}) {
  if (series.length < 2) return null;

  const vals = series.map((p) => linkFromWei(p.held));
  const max = Math.max(1, ...vals);
  const W = 680;
  const H = 170;
  const padT = 14;
  const padB = 26;
  const chartH = H - padT - padB;
  const n = series.length;

  const x = (i: number) => (n === 1 ? 0 : (i / (n - 1)) * W);
  const y = (v: number) => padT + chartH - (v / max) * chartH;

  const line = series.map((p, i) => `${x(i)},${y(vals[i])}`).join(" ");
  const area = `0,${padT + chartH} ${line} ${W},${padT + chartH}`;

  const peakIdx = vals.indexOf(Math.max(...vals));
  const labelStep = Math.ceil(n / 6);

  return (
    <div className="scroll-x overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        preserveAspectRatio="none"
        role="img"
        aria-label="Warchest over time"
        className="block"
      >
        <defs>
          <linearGradient id="wc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5c7cfa" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#5c7cfa" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* baseline */}
        <line
          x1="0"
          y1={padT + chartH}
          x2={W}
          y2={padT + chartH}
          stroke="#1f2b47"
          strokeWidth="1"
        />

        <polygon points={area} fill="url(#wc)" />
        <polyline
          points={line}
          fill="none"
          stroke="#5c7cfa"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* peak marker */}
        <circle cx={x(peakIdx)} cy={y(vals[peakIdx])} r="3" fill="#8fa4ff" />

        {series.map((p, i) => (
          <g key={p.ym}>
            <rect
              x={x(i) - (W / n) / 2}
              y={padT}
              width={W / n}
              height={chartH}
              fill="transparent"
            >
              <title>
                {monthLabel(p.ym)} · {fmtLink(p.held, 0)} LINK
                {fmtUsd(p.held, linkUsd) ? ` (${fmtUsd(p.held, linkUsd)})` : ""}
              </title>
            </rect>
            {i % labelStep === 0 || i === n - 1 ? (
              <text
                x={x(i)}
                y={H - 8}
                textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
                fontSize="10"
                fill="#5f6f8f"
              >
                {monthLabel(p.ym)}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}
