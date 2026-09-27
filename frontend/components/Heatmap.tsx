"use client";

import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import { PanelNote } from "@/components/Panel";
import { formatPercent, formatPrice } from "@/store/format";
import { livePrice } from "@/store/portfolio";
import { useTerminal } from "@/store/terminal";

type Dir = "up" | "down" | "flat";
type Tile = { ticker: string; value: number; pct: number; dir: Dir };
type Datum = Tile | { children: Tile[] };

/** Squarified layout of tiles by market value in a unit square; callers render percentages. */
function layout(tiles: Tile[]) {
  const root = hierarchy<Datum>({ children: tiles }, (d) => ("children" in d ? d.children : undefined))
    .sum((d) => ("value" in d ? d.value : 0))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return treemap<Datum>().size([1, 1]).tile(treemapSquarify)(root).leaves();
}

// Inline rgb/rgba only: Tailwind opacity or palette classes compute to oklab/oklch, which spec 04 misreads.
function tileColor(dir: Dir, pct: number): string {
  const a = Math.min(1, 0.35 + Math.abs(pct) / 5);
  if (dir === "up") return `rgba(63, 185, 80, ${a})`;
  if (dir === "down") return `rgba(248, 81, 73, ${a})`;
  return "rgb(48, 54, 61)";
}

/** Treemap of held positions, sized by live market value and colored by unrealized P&L. */
export function Heatmap() {
  const positions = useTerminal((s) => s.positions);
  const prices = useTerminal((s) => s.prices);
  const cash = useTerminal((s) => s.cash);
  if (cash === null) return <PanelNote>Loading holdings…</PanelNote>;
  if (positions.length === 0) {
    return <PanelNote>No holdings to map. Each position appears here sized by its value.</PanelNote>;
  }
  const tiles = positions.map((p): Tile => {
    const live = livePrice(p, prices);
    const pnl = (live - p.avg_cost) * p.quantity;
    const dir: Dir = pnl > 0 ? "up" : pnl < 0 ? "down" : "flat";
    return { ticker: p.ticker, value: p.quantity * live, pct: ((live - p.avg_cost) / p.avg_cost) * 100, dir };
  });
  return (
    <div data-testid="heatmap" className="relative h-full min-h-40">
      {layout(tiles).map((leaf) => {
        const t = leaf.data as Tile;
        return (
          <div
            key={t.ticker}
            data-testid={`heatmap-cell-${t.ticker}`}
            data-pnl={t.dir}
            title={`${t.ticker} · ${formatPrice(t.value)} · ${formatPercent(t.pct)}`}
            className="absolute overflow-hidden border border-bg p-1"
            style={{
              left: `${leaf.x0 * 100}%`,
              top: `${leaf.y0 * 100}%`,
              width: `${(leaf.x1 - leaf.x0) * 100}%`,
              height: `${(leaf.y1 - leaf.y0) * 100}%`,
              backgroundColor: tileColor(t.dir, t.pct),
            }}
          >
            <div className="font-mono text-xs font-semibold text-text">{t.ticker}</div>
            <div className="font-mono text-[11px] text-text tabular-nums">{formatPercent(t.pct)}</div>
          </div>
        );
      })}
    </div>
  );
}
