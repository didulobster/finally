/** Holdings with live valuation. */
import { money, percent, price, quantity, signedMoney, trendClass } from "@/lib/format";
import type { Position } from "@/lib/types";
import { Panel } from "./Panel";

export function PositionsTable({ positions, onSelect }: { positions: Position[]; onSelect: (ticker: string) => void }) {
  return (
    <Panel title="Positions">
      {positions.length === 0 ? (
        <p data-testid="positions-empty" className="p-3 text-muted">
          No positions yet. Buy shares with the trade bar or ask the assistant.
        </p>
      ) : (
        <div className="h-full overflow-auto">
          <table className="w-full" data-testid="positions-table">
            <thead className="sticky top-0 bg-panel text-[11px] text-muted">
              <tr className="[&>th]:px-3 [&>th]:py-1.5 [&>th]:text-right [&>th]:font-medium">
                <th className="!text-left">Ticker</th>
                <th>Qty</th>
                <th>Avg cost</th>
                <th>Price</th>
                <th>Value</th>
                <th>Unrealized P&L</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr
                  key={p.ticker}
                  data-testid={`position-row-${p.ticker}`}
                  onClick={() => onSelect(p.ticker)}
                  className="cursor-pointer border-t border-line/60 hover:bg-raised [&>td]:px-3 [&>td]:py-1.5 [&>td]:text-right"
                >
                  <td className="!text-left font-semibold">{p.ticker}</td>
                  <td data-testid={`position-qty-${p.ticker}`}>{quantity(p.quantity)}</td>
                  <td>{price(p.avg_cost)}</td>
                  <td>{price(p.current_price)}</td>
                  <td>{money(p.market_value)}</td>
                  <td data-testid={`position-pnl-${p.ticker}`} className={trendClass(p.unrealized_pnl)}>
                    {signedMoney(p.unrealized_pnl)}
                  </td>
                  <td className={trendClass(p.pnl_percent)}>{percent(p.pnl_percent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
