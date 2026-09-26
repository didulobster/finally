import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WatchlistRow } from "@/components/WatchlistRow";
import { FLASH_HOLD_MS } from "@/hooks/useFlash";
import type { PriceUpdate } from "@/lib/types";

const update = (price: number): PriceUpdate => ({
  ticker: "AAPL", price, previous_price: price, timestamp: 0, change: 0, change_percent: 0,
  direction: "flat", open_price: 100, session_change_percent: price - 100,
});

const row = (price: number) => (
  <WatchlistRow ticker="AAPL" update={update(price)} history={[]} selected={false} onSelect={() => {}} onRemove={() => {}} />
);

describe("WatchlistRow price flash", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not flash on first render", () => {
    render(row(100));
    expect(screen.getByTestId("watchlist-price-AAPL")).not.toHaveClass("flash-up", "flash-down");
  });

  it("flashes green on uptick, then clears", () => {
    const { rerender } = render(row(100));
    rerender(row(101));
    const cell = screen.getByTestId("watchlist-price-AAPL");
    expect(cell).toHaveClass("flash-up");
    act(() => vi.advanceTimersByTime(FLASH_HOLD_MS));
    expect(cell).not.toHaveClass("flash-up");
  });

  it("flashes red on downtick", () => {
    const { rerender } = render(row(100));
    rerender(row(99));
    expect(screen.getByTestId("watchlist-price-AAPL")).toHaveClass("flash-down");
  });

  it("shows session change percent with trend color", () => {
    render(row(101.5));
    const change = screen.getByTestId("watchlist-change-AAPL");
    expect(change).toHaveTextContent("+1.50%");
    expect(change).toHaveClass("text-up");
  });
});
