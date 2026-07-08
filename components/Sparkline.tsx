import type { MonthPoint } from "@/lib/monthly";
import { linkFromWei } from "@/lib/format";

// Compact monthly-revenue sparkline (bars) for a single operator, meant to sit
// inline in a table cell. Shows up to the last `max` months.
export default function Sparkline({
  months,
  max = 14,
  width = 108,
  height = 30,
}: {
  months: MonthPoint[];
  max?: number;
  width?: number;
  height?: number;
}) {
  if (!months.length) {
    return <span className="text-ink-600">—</span>;
  }
  const data = months.slice(-max);
  const vals = data.map((m) => linkFromWei(m.total));
  const peak = Math.max(1, ...vals);
  const n = data.length;
  const gap = 1.5;
  const barW = (width - gap * (n - 1)) / n;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="inline-block align-middle"
      aria-hidden="true"
    >
      {data.map((m, i) => {
        const v = vals[i];
        const h = Math.max(1, (v / peak) * (height - 2));
        const x = i * (barW + gap);
        // Emphasise the most recent month.
        const isLast = i === n - 1;
        return (
          <rect
            key={m.ym}
            x={x}
            y={height - h}
            width={barW}
            height={h}
            rx="0.8"
            fill={isLast ? "#5c7cfa" : "#375bd2"}
            opacity={isLast ? 1 : 0.55}
          />
        );
      })}
    </svg>
  );
}
