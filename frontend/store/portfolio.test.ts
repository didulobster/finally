import { describe, expect, it } from "vitest";
import { formatPrice } from "./format";
import { selectTotalValue } from "./portfolio";
import type { Position, Price, TerminalState } from "./terminal";

const CASH = 1234.56;
const EXPECTED_TOTAL = 4716.83;

const positions: Position[] = [
  { ticker: "AAPL", quantity: 5, avg_cost: 180, current_price: 190.12 },
  { ticker: "JPM", quantity: 7, avg_cost: 200, current_price: 210.55 },
  { ticker: "MSFT", quantity: 2.5, avg_cost: 400, current_price: 415.3 },
  { ticker: "NVDA", quantity: 0.1234, avg_cost: 120, current_price: 131.07 },
];

// The exact sum is 11899.145, a half-cent boundary where a float sum rounds differently depending on order.
const BOUNDARY_CASH = 7916.37;
const boundary: Position[] = [
  { ticker: "A", quantity: 4.368, avg_cost: 1, current_price: 370.93 },
  { ticker: "B", quantity: 4.348, avg_cost: 1, current_price: 487.04 },
  { ticker: "C", quantity: 6.396, avg_cost: 1, current_price: 38.29 },
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

/** Terminal state with the fixed prices and the given positions and cash. */
function stateWith(ps: Position[], cash: number | null = CASH): TerminalState {
  return { status: "connected", prices, watchlist: [], cash, positions: ps, history: [] };
}

/** Every order of the items. */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

describe("selectTotalValue", () => {
  it("sums cash plus each position rounded to cents, falling back to current_price", () => {
    // 1234.56 + 5x191.37 (956.85) + 7x210.55 (1473.85) + 2.5x414.02 (1035.05) + 0.1234x133.91 (16.52)
    expect(selectTotalValue(stateWith(positions))).toBe(EXPECTED_TOTAL);
  });

  it("gives exactly the same header total for every order of the same positions", () => {
    const orders = permutations(positions);
    expect(orders).toHaveLength(24);
    for (const order of orders) {
      const total = selectTotalValue(stateWith(order));
      if (total === null) throw new Error("cash is set, so the total is not null");
      expect(total).toBe(EXPECTED_TOTAL);
      expect(formatPrice(total)).toBe("$4,716.83");
    }
  });

  it("gives exactly the same total in every order at a half-cent boundary", () => {
    const orders = permutations(boundary);
    expect(orders).toHaveLength(6);
    const first = selectTotalValue(stateWith(orders[0], BOUNDARY_CASH));
    for (const order of orders) {
      expect(selectTotalValue(stateWith(order, BOUNDARY_CASH))).toBe(first);
    }
  });

  it("rounds a half-cent boundary total the way the backend does", () => {
    const total = selectTotalValue(stateWith(boundary, BOUNDARY_CASH));
    if (total === null) throw new Error("cash is set, so the total is not null");
    expect(total).toBe(11899.14);
    expect(formatPrice(total)).toBe("$11,899.14");
  });

  it("returns the cash alone with no positions, and null before the portfolio loads", () => {
    expect(selectTotalValue(stateWith([]))).toBe(1234.56);
    expect(selectTotalValue(stateWith(positions, null))).toBeNull();
  });
});
