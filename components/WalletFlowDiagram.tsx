import { fmtLink } from "@/lib/format";
import type { Operator } from "@/lib/types";

type Cold = NonNullable<Operator["cold"]>[number];

// A small left-to-right flow diagram: main wallet → cold-storage wallets (up to
// 3 hops), edges labelled with the LINK that flowed along them. Pure SVG.
export default function WalletFlowDiagram({
  main,
  mainName,
  mainHeld,
  cold,
}: {
  main: string;
  mainName: string;
  mainHeld?: string;
  cold: Cold[];
}) {
  if (!cold.length) return null;

  const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);
  const maxHop = Math.max(1, ...cold.map((c) => c.hop));

  // group nodes by hop column (hop 0 = main)
  type Node = { addr: string; label: string; amount?: string; hop: number };
  const columns: Node[][] = Array.from({ length: maxHop + 1 }, () => []);
  columns[0].push({ addr: main, label: mainName, amount: mainHeld, hop: 0 });
  for (const c of cold)
    columns[c.hop].push({ addr: c.wallet, label: short(c.wallet), amount: c.held, hop: c.hop });

  const colW = 210;
  const nodeW = 168;
  const nodeH = 46;
  const vGap = 16;
  const rows = Math.max(...columns.map((c) => c.length));
  const width = maxHop * colW + nodeW + 8;
  const height = rows * (nodeH + vGap) + vGap;

  // position each node; center each column vertically
  const pos = new Map<string, { x: number; y: number }>();
  columns.forEach((col, h) => {
    const colH = col.length * (nodeH + vGap) - vGap;
    const y0 = (height - colH) / 2;
    col.forEach((node, i) => {
      pos.set(node.addr, { x: 4 + h * colW, y: y0 + i * (nodeH + vGap) });
    });
  });

  return (
    <div className="scroll-x overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="max-w-none"
        role="img"
        aria-label="Wallet flow"
      >
        {/* edges: parent → child, labelled with the LINK that flowed */}
        {cold.map((c) => {
          const p = pos.get(c.parent) ?? pos.get(main);
          const q = pos.get(c.wallet);
          if (!p || !q) return null;
          const x1 = p.x + nodeW;
          const y1 = p.y + nodeH / 2;
          const x2 = q.x;
          const y2 = q.y + nodeH / 2;
          const mx = (x1 + x2) / 2;
          return (
            <g key={"e-" + c.wallet}>
              <path
                d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke="#2b3a5e"
                strokeWidth="1.5"
              />
              <text
                x={mx}
                y={(y1 + y2) / 2 - 4}
                textAnchor="middle"
                fontSize="9"
                fill="#8494b0"
              >
                {fmtLink(c.inflow, 0)}
              </text>
            </g>
          );
        })}

        {/* nodes */}
        {columns.flat().map((node) => {
          const p = pos.get(node.addr)!;
          const isMain = node.hop === 0;
          const isPass =
            !isMain && (!node.amount || BigInt(node.amount) === 0n);
          return (
            <a
              key={node.addr}
              href={`https://etherscan.io/address/${node.addr}`}
              target="_blank"
              rel="noreferrer"
            >
              <g>
                <rect
                  x={p.x}
                  y={p.y}
                  width={nodeW}
                  height={nodeH}
                  rx="8"
                  fill={isMain ? "#172136" : "#111827"}
                  stroke={isMain ? "#375bd2" : "#1f2b47"}
                  strokeWidth={isMain ? "1.6" : "1"}
                />
                <text
                  x={p.x + 12}
                  y={p.y + 19}
                  fontSize="11"
                  fontWeight="600"
                  fill={isMain ? "#c7d2e3" : isPass ? "#5f6f8f" : "#a3b1c9"}
                >
                  {isMain ? node.label : isPass ? "pass-through" : "cold storage"}
                </text>
                <text
                  x={p.x + 12}
                  y={p.y + 34}
                  fontSize="10"
                  fontFamily="ui-monospace, monospace"
                  fill="#5f6f8f"
                >
                  {isMain ? short(node.addr) : node.label}
                  {node.amount ? `  ·  ${fmtLink(node.amount, 0)} LINK` : ""}
                </text>
              </g>
            </a>
          );
        })}
      </svg>
    </div>
  );
}
