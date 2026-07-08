"use client";

import { useState } from "react";
import type { MonthPoint } from "@/lib/monthly";
import { fmtLink, fmtUsd, linkFromWei } from "@/lib/format";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTHS[Number(m) - 1]} '${y.slice(2)}`;
}

// Round a number up to a "nice" axis maximum (1/2/5 × 10^n).
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function kfmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return Math.round(n / 1_000) + "k";
  return Math.round(n).toString();
}

export default function RevenueChart({
  months,
  linkUsd,
}: {
  months: MonthPoint[];
  linkUsd: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (!months.length) return null;

  // SVG user-space geometry (scales responsively via viewBox).
  const W = 820;
  const H = 300;
  const padL = 48;
  const padR = 12;
  const padT = 16;
  const padB = 40;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const totals = months.map((m) => linkFromWei(m.total));
  const max = niceMax(Math.max(...totals));
  const n = months.length;
  const slot = plotW / n;
  const barW = Math.min(46, slot * 0.62);

  const x = (i: number) => padL + slot * i + (slot - barW) / 2;
  const y = (v: number) => padT + plotH - (v / max) * plotH;

  const active = hover ?? n - 1; // default readout = latest month
  const cur = months[active];

  const gridLines = 4;

  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900/60 p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-ink-500">
            Revenue over time
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-ink-100">
              {fmtLink(cur.total, 0)}
            </span>
            <span className="text-sm text-ink-400">LINK</span>
            <span className="text-sm text-ink-500">
              · {monthLabel(cur.ym)}
              {fmtUsd(cur.total, linkUsd) ? ` · ${fmtUsd(cur.total, linkUsd)}` : ""}
              {cur.operators ? ` · ${cur.operators} ops` : ""}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-ink-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-link" /> Earmark
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-link-light" /> Direct
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="block"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Monthly combined revenue across active operators"
        onMouseLeave={() => setHover(null)}
      >
        {/* horizontal gridlines + y labels */}
        {Array.from({ length: gridLines + 1 }, (_, i) => {
          const v = (max / gridLines) * i;
          const gy = y(v);
          return (
            <g key={i}>
              <line
                x1={padL}
                y1={gy}
                x2={W - padR}
                y2={gy}
                stroke="#161f36"
                strokeWidth="1"
              />
              <text
                x={padL - 8}
                y={gy + 3}
                textAnchor="end"
                fontSize="10"
                fill="#5f6f8f"
              >
                {kfmt(v)}
              </text>
            </g>
          );
        })}

        {months.map((m, i) => {
          const eLink = linkFromWei(m.earmarked);
          const dLink = linkFromWei(m.direct);
          const tLink = eLink + dLink;
          const eH = (eLink / max) * plotH;
          const dH = (dLink / max) * plotH;
          const bx = x(i);
          const isOn = i === active;
          const showLbl = n <= 14 || i % 2 === 0;
          return (
            <g
              key={m.ym}
              onMouseEnter={() => setHover(i)}
              style={{ cursor: "pointer" }}
            >
              {/* hover hit area */}
              <rect
                x={padL + slot * i}
                y={padT}
                width={slot}
                height={plotH}
                fill="transparent"
              />
              {/* earmark (bottom) */}
              <rect
                x={bx}
                y={padT + plotH - eH}
                width={barW}
                height={eH}
                rx="2"
                fill="#375bd2"
                opacity={isOn ? 1 : 0.82}
              />
              {/* direct (top) */}
              {dH > 0.5 && (
                <rect
                  x={bx}
                  y={padT + plotH - eH - dH}
                  width={barW}
                  height={dH}
                  rx="2"
                  fill="#5c7cfa"
                  opacity={isOn ? 1 : 0.82}
                />
              )}
              {/* value on hover */}
              {isOn && (
                <text
                  x={bx + barW / 2}
                  y={padT + plotH - eH - dH - 5}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill="#e6ecf5"
                >
                  {kfmt(tLink)}
                </text>
              )}
              {/* x label */}
              {showLbl && (
                <text
                  x={bx + barW / 2}
                  y={H - padB + 16}
                  textAnchor="middle"
                  fontSize="10"
                  fill={isOn ? "#a3b1c9" : "#5f6f8f"}
                >
                  {MONTHS[Number(m.ym.split("-")[1]) - 1]}
                </text>
              )}
              {showLbl && (
                <text
                  x={bx + barW / 2}
                  y={H - padB + 28}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#4a5a7a"
                >
                  '{m.ym.split("-")[0].slice(2)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
