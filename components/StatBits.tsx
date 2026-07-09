import type { ReactNode } from "react";

// A labelled statistic line used in the derived-stats grids.
export function StatLine({
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
export function Delta({ pct }: { pct: number | null }) {
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
