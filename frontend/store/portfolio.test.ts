import { describe, expect, it } from "vitest";
import { formatPrice } from "./format";
import { selectTotalValue } from "./portfolio";
import type { Position, Price, TerminalState } from "./terminal";

const CASH = 1234.56;
const EXPECTED_TOTAL = 4716.834494;

const positions: Position[] = [
  { ticker: "AAPL", quantity: 5, avg_cost: 180, current_price: 190.12 },
  { ticker: "JPM", quantity: 7, avg_cost: 200, current_price: 210.55 },
  { ticker: "MSFT", quantity: 2.5, avg_cost: 400, current_price: 415.3 },
  { ticker: "NVDA", quantity: 0.1234, avg_cost: 120, current_price: 131.07 },
];

/** A full Price for a ticker at a flat price. */
function price(ticker: string, value: number): Price {
  return {
    ticker,
    price: value,
    previous_price: value,
    timestamp: 0,
    change: 0,
    change_percent: 0,
    direction: "flat",
    open_price: value,
    session_change_percent: 0,
  };
}

// JPM has no live price, so its current_price is used.
const prices = {
  AAPL: price("AAPL", 191.37),
  MSFT: price("MSFT", 414.02),
  NVDA: price("NVDA", 133.91),
};

/** Terminal state with the fixed cash and prices and the given positions. */
function stateWith(ps: Position[]): TerminalState {
  return { status: "connected", prices, watchlist: [], cash: CASH, positions: ps, history: [] };
}

/** Every order of the items. */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

describe("selectTotalValue", () => {
  it("sums cash plus quantity x live price, falling back to current_price", () => {
    // 1234.56 + 5x191.37 + 7x210.55 + 2.5x414.02 + 0.1234x133.91
    expect(selectTotalValue(stateWith(positions))).toBeCloseTo(EXPECTED_TOTAL, 9);
  });

  it("gives the same header total for every order of the same positions", () => {
    const orders = permutations(positions);
    expect(orders).toHaveLength(24);
    // Float addition is not associative (raw totals differ in the last bit), so assert cents and 1e-9, not exact equality.
    for (const order of orders) {
      const total = selectTotalValue(stateWith(order));
      if (total === null) throw new Error("cash is set, so the total is not null");
      expect(total).toBeCloseTo(EXPECTED_TOTAL, 9);
      expect(formatPrice(total)).toBe("$4,716.83");
    }
  });
});
