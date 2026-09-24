"use client";
/** Treemap of positions sized by market value and colored by unrealized P&L %. */
import { percent } from "@/lib/format";
import { squarify } from "@/lib/treemap";
import type { Position } from "@/lib/types";
import { Panel } from "./Panel";

/** Map P&L % to a green/red tint; full saturation at ±5%. */
export function pnlColor(pnlPercent: number): string {
  const strength = Math.min(Math.abs(pnlPercent) / 5, 1);
  const alpha = (0.18 + strength * 0.62).toFixed(2);
  if (pnlPercent > 0) return `rgb(47 191 113 / ${alpha})`;
  if (pnlPercent < 0) return `rgb(239 83 80 / ${alpha})`;
  return "rgb(124 136 163 / 0.25)";
}

export function Heatmap({ positions, onSelect }: { positions: Position[]; onSelect: (ticker: string) => void }) {
  const tiles = squarify(positions, (p) => p.market_value, { x: 0, y: 0, w: 100, h: 100 });
  return (
    <Panel title="Portfolio heatmap">
      {tiles.length === 0 ? (
        <p className="p-3 text-muted">Your holdings appear here, sized by value.</p>
      ) : (
        <div className="relative h-full" data-testid="heatmap">
          {tiles.map(({ item, x, y, w, h }) => (
            <button
              type="button"
              key={item.ticker}
              data-testid={`heatmap-cell-${item.ticker}`}
              data-pnl={item.pnl_percent > 0 ? "up" : item.pnl_percent < 0 ? "down" : "flat"}
              onClick={() => onSelect(item.ticker)}
              className="absolute flex flex-col items-center justify-center overflow-hidden border border-panel text-text"
              style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`, background: pnlColor(item.pnl_percent) }}
            >
              <span className="font-semibold">{item.ticker}</span>
              <span className="text-[11px]">{percent(item.pnl_percent)}</span>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}
