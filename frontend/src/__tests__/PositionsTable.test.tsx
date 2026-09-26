import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Heatmap, pnlColor } from "@/components/Heatmap";
import { PositionsTable } from "@/components/PositionsTable";
import type { Position } from "@/lib/types";

const positions: Position[] = [
  { ticker: "AAPL", quantity: 10, avg_cost: 100, current_price: 110, market_value: 1100, unrealized_pnl: 100, pnl_percent: 10 },
  { ticker: "TSLA", quantity: 2, avg_cost: 200, current_price: 150, market_value: 300, unrealized_pnl: -100, pnl_percent: -25 },
];

describe("PositionsTable", () => {
  it("renders an empty state", () => {
    render(<PositionsTable positions={[]} onSelect={() => {}} />);
    expect(screen.getByTestId("positions-empty")).toBeInTheDocument();
  });

  it("renders P&L with sign and color", () => {
    render(<PositionsTable positions={positions} onSelect={() => {}} />);
    expect(screen.getByTestId("position-qty-AAPL")).toHaveTextContent("10");
    expect(screen.getByTestId("position-pnl-AAPL")).toHaveTextContent("+$100.00");
    expect(screen.getByTestId("position-pnl-AAPL")).toHaveClass("text-up");
    expect(screen.getByTestId("position-pnl-TSLA")).toHaveTextContent("−$100.00");
    expect(screen.getByTestId("position-pnl-TSLA")).toHaveClass("text-down");
  });
});

describe("Heatmap", () => {
  it("renders a tile per position tagged by P&L direction", () => {
    render(<Heatmap positions={positions} onSelect={() => {}} />);
    expect(screen.getByTestId("heatmap-cell-AAPL")).toHaveAttribute("data-pnl", "up");
    expect(screen.getByTestId("heatmap-cell-TSLA")).toHaveAttribute("data-pnl", "down");
  });

  it("colors green for gains and red for losses", () => {
    expect(pnlColor(3)).toContain("47 191 113");
    expect(pnlColor(-3)).toContain("239 83 80");
  });
});
