import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TradeBar } from "@/components/TradeBar";

describe("TradeBar", () => {
  it("submits a sell order and shows the confirmation", async () => {
    const onTrade = vi.fn().mockResolvedValue("Sold 2 AAPL at 190.00");
    render(<TradeBar ticker="AAPL" onTickerChange={() => {}} onTrade={onTrade} />);
    await userEvent.type(screen.getByTestId("trade-quantity"), "2");
    await userEvent.click(screen.getByTestId("trade-sell"));
    expect(onTrade).toHaveBeenCalledWith("AAPL", 2, "sell");
    expect(await screen.findByTestId("trade-result")).toHaveTextContent("Sold 2 AAPL");
  });

  it("rejects a missing quantity without calling the API", async () => {
    const onTrade = vi.fn();
    render(<TradeBar ticker="AAPL" onTickerChange={() => {}} onTrade={onTrade} />);
    await userEvent.click(screen.getByTestId("trade-buy"));
    expect(onTrade).not.toHaveBeenCalled();
    expect(screen.getByTestId("trade-result")).toHaveTextContent("quantity above zero");
  });

  it("shows backend errors", async () => {
    const onTrade = vi.fn().mockRejectedValue(new Error("Insufficient cash"));
    render(<TradeBar ticker="AAPL" onTickerChange={() => {}} onTrade={onTrade} />);
    await userEvent.type(screen.getByTestId("trade-quantity"), "1000");
    await userEvent.click(screen.getByTestId("trade-buy"));
    expect(await screen.findByTestId("trade-result")).toHaveTextContent("Insufficient cash");
  });
});
