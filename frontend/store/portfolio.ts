import type { Position, TerminalState } from "./terminal";

/** Live price for a position, falling back to the API's current_price. */
export function livePrice(p: Position, prices: TerminalState["prices"]): number {
  return prices[p.ticker]?.price ?? p.current_price;
}

/** Header total: cash + sum of qty x live price. A primitive, so it is a stable Zustand selector. */
export function selectTotalValue(s: TerminalState): number | null {
  if (s.cash === null) return null;
  return s.positions.reduce((sum, p) => sum + p.quantity * livePrice(p, s.prices), s.cash);
}
