import type { Position, TerminalState } from "./terminal";

/** Live price for a position, falling back to the API's current_price. */
export function livePrice(p: Position, prices: TerminalState["prices"]): number {
  return prices[p.ticker]?.price ?? p.current_price;
}

/** A dollar amount as whole cents. */
function cents(v: number): number {
  return Math.round(v * 100);
}

/**
 * Header total in whole cents: cash plus each position's live value rounded to cents, as the backend does,
 * so the order of positions cannot change it. A primitive, so it is a stable Zustand selector.
 */
export function selectTotalValue(s: TerminalState): number | null {
  if (s.cash === null) return null;
  const total = s.positions.reduce((sum, p) => sum + cents(p.quantity * livePrice(p, s.prices)), cents(s.cash));
  return total / 100;
}
