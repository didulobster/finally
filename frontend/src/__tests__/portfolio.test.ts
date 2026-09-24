import { describe, expect, it } from "vitest";
import { revaluePortfolio } from "@/lib/portfolio";
import { squarify } from "@/lib/treemap";
import type { Portfolio, PriceUpdate } from "@/lib/types";

const portfolio: Portfolio = {
  cash_balance: 1000,
  positions: [
    { ticker: "AAPL", quantity: 10, avg_cost: 100, current_price: 100, market_value: 1000, unrealized_pnl: 0, pnl_percent: 0 },
    { ticker: "TSLA", quantity: 2, avg_cost: 200, current_price: 200, market_value: 400, unrealized_pnl: 0, pnl_percent: 0 },
  ],
  positions_value: 1400,
  total_value: 2400,
  unrealized_pnl: 0,
};

const tick = (ticker: string, price: number): PriceUpdate => ({
  ticker, price, previous_price: price, timestamp: 0, change: 0, change_percent: 0, direction: "flat",
  open_price: price, session_change_percent: 0,
});

describe("revaluePortfolio", () => {
  it("revalues positions at live prices", () => {
    const live = revaluePortfolio(portfolio, { AAPL: tick("AAPL", 110), TSLA: tick("TSLA", 150) });
    expect(live.positions[0].unrealized_pnl).toBeCloseTo(100);
    expect(live.positions[0].pnl_percent).toBeCloseTo(10);
    expect(live.positions[1].unrealized_pnl).toBeCloseTo(-100);
    expect(live.positions[1].pnl_percent).toBeCloseTo(-25);
    expect(live.positions_value).toBeCloseTo(1400);
    expect(live.total_value).toBeCloseTo(2400);
    expect(live.unrealized_pnl).toBeCloseTo(0);
  });

  it("falls back to the backend price when no tick has arrived", () => {
    const live = revaluePortfolio(portfolio, {});
    expect(live.total_value).toBe(2400);
  });
});

describe("squarify", () => {
  it("fills the box with areas proportional to weight", () => {
    const tiles = squarify([6, 6, 4, 3, 2, 2, 1], (n) => n, { x: 0, y: 0, w: 6, h: 4 });
    expect(tiles).toHaveLength(7);
    for (const t of tiles) expect(t.w * t.h).toBeCloseTo(t.item);
    for (const t of tiles) {
      expect(t.x + t.w).toBeLessThanOrEqual(6 + 1e-9);
      expect(t.y + t.h).toBeLessThanOrEqual(4 + 1e-9);
    }
  });

  it("returns nothing for zero total weight", () => {
    expect(squarify([0], (n) => n, { x: 0, y: 0, w: 1, h: 1 })).toEqual([]);
  });
});
