import { describe, expect, it } from "vitest";
import { applyPrices, emptyStream } from "@/hooks/usePriceStream";
import type { PriceUpdate } from "@/lib/types";

const tick = (price: number, timestamp: number): PriceUpdate => ({
  ticker: "AAPL", price, previous_price: price, timestamp, change: 0, change_percent: 0, direction: "flat",
  open_price: 100, session_change_percent: 0,
});

describe("applyPrices", () => {
  it("keeps the latest prices and appends history", () => {
    let s = applyPrices(emptyStream, { AAPL: tick(100, 1) });
    s = applyPrices(s, { AAPL: tick(101, 2) });
    expect(s.prices.AAPL.price).toBe(101);
    expect(s.history.AAPL.map((p) => p.value)).toEqual([100, 101]);
  });

  it("skips duplicate timestamps", () => {
    let s = applyPrices(emptyStream, { AAPL: tick(100, 1) });
    s = applyPrices(s, { AAPL: tick(100, 1) });
    expect(s.history.AAPL).toHaveLength(1);
  });

  it("drops tickers that disappear from the payload", () => {
    const s = applyPrices(applyPrices(emptyStream, { AAPL: tick(100, 1) }), {});
    expect(s.prices.AAPL).toBeUndefined();
  });
});
