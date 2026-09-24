import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Watchlist } from "@/components/Watchlist";
import { emptyStream } from "@/hooks/usePriceStream";

const setup = (overrides: Partial<Parameters<typeof Watchlist>[0]> = {}) => {
  const props = {
    tickers: ["AAPL", "MSFT"],
    stream: emptyStream,
    selected: "AAPL",
    onSelect: vi.fn(),
    onAdd: vi.fn().mockResolvedValue(undefined),
    onRemove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<Watchlist {...props} />);
  return props;
};

describe("Watchlist", () => {
  it("renders a row per ticker", () => {
    setup();
    expect(screen.getByTestId("watchlist-row-AAPL")).toBeInTheDocument();
    expect(screen.getByTestId("watchlist-row-MSFT")).toBeInTheDocument();
  });

  it("adds an upper-cased ticker and clears the input", async () => {
    const props = setup();
    await userEvent.type(screen.getByTestId("watchlist-add-input"), "pypl");
    await userEvent.click(screen.getByTestId("watchlist-add-button"));
    expect(props.onAdd).toHaveBeenCalledWith("PYPL");
    expect(screen.getByTestId("watchlist-add-input")).toHaveValue("");
  });

  it("shows the error when adding fails", async () => {
    setup({ onAdd: vi.fn().mockRejectedValue(new Error("Invalid ticker: '1X'")) });
    await userEvent.type(screen.getByTestId("watchlist-add-input"), "1x");
    await userEvent.click(screen.getByTestId("watchlist-add-button"));
    expect(await screen.findByTestId("watchlist-error")).toHaveTextContent("Invalid ticker");
  });

  it("removes a ticker without selecting it", async () => {
    const props = setup();
    await userEvent.click(screen.getByTestId("watchlist-remove-MSFT"));
    expect(props.onRemove).toHaveBeenCalledWith("MSFT");
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("selects a ticker on click", async () => {
    const props = setup();
    await userEvent.click(screen.getByTestId("watchlist-row-MSFT"));
    expect(props.onSelect).toHaveBeenCalledWith("MSFT");
  });
});
