"use client";

import { PanelNote } from "@/components/Panel";
import { formatPercent, formatPrice, formatQty, formatSignedPrice } from "@/store/format";
import { livePrice } from "@/store/portfolio";
import { useTerminal, type Position } from "@/store/terminal";

const TH = "px-2 text-[11px] font-normal uppercase tracking-widest text-muted";

/** Held positions in server (alphabetical) order, with live price, P&L and %. */
export function Positions() {
  const cash = useTerminal((s) => s.cash);
  const positions = useTerminal((s) => s.positions);
  if (cash === null) return <PanelNote>Loading positions…</PanelNote>;
  if (positions.length === 0) {
    return (
      <p data-testid="positions-empty" className="p-3 text-xs text-muted">
        No positions yet. Buy a ticker from the trade bar to open one.
      </p>
    );
  }
  return (
    <table className="w-full font-mono text-sm tabular-nums">
      <thead className="sticky top-0 bg-panel">
        <tr className="h-7">
          <th className={`${TH} text-left`}>Ticker</th>
          <th className={`${TH} text-right`}>Qty</th>
          <th className={`${TH} text-right`}>Avg Cost</th>
          <th className={`${TH} text-right`}>Price</th>
          <th className={`${TH} text-right`}>P&L</th>
          <th className={`${TH} text-right`}>%</th>
        </tr>
      </thead>
      <tbody>
        {positions.map((p) => (
          <PositionRow key={p.ticker} position={p} />
        ))}
      </tbody>
    </table>
  );
}

function PositionRow({ position }: { position: Position }) {
  const { ticker, quantity, avg_cost } = position;
  const live = useTerminal((s) => livePrice(position, s.prices));
  const pnl = (live - avg_cost) * quantity;
  const color = pnl > 0 ? "text-up" : pnl < 0 ? "text-down" : "text-muted";
  return (
    <tr data-testid={`position-row-${ticker}`} className="border-b border-border">
      <td className="px-2 py-1 font-semibold">{ticker}</td>
      <td data-testid={`position-qty-${ticker}`} className="px-2 py-1 text-right">
        {formatQty(quantity)}
      </td>
      <td className="px-2 py-1 text-right">{formatPrice(avg_cost)}</td>
      <td className="px-2 py-1 text-right">{formatPrice(live)}</td>
      <td className={`px-2 py-1 text-right ${color}`}>{formatSignedPrice(pnl)}</td>
      <td className={`px-2 py-1 text-right ${color}`}>{formatPercent(((live - avg_cost) / avg_cost) * 100)}</td>
    </tr>
  );
}
