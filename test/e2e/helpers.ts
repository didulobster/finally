import { expect, type Locator, type Page } from "@playwright/test";

export const DEFAULT_TICKERS = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "JPM", "V", "NFLX"];

/** Parse a money/number string like "$10,000.00" or "−1.5" (U+2212 minus) into a number. */
export function parseNumber(text: string | null): number {
  return Number((text ?? "").replace(/−/g, "-").replace(/[^0-9.-]/g, ""));
}

/** Read a number rendered inside a locator. */
export async function readNumber(locator: Locator): Promise<number> {
  return parseNumber(await locator.textContent());
}

/** Open the app and wait until the SSE stream is connected. */
export async function openApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
}

/** Wait for a ticker's watchlist price to show a number, then return it. */
export async function waitForPrice(page: Page, ticker: string): Promise<number> {
  const price = page.getByTestId(`watchlist-price-${ticker}`);
  await expect(price).toHaveText(/\d/);
  return readNumber(price);
}

/** Remove a ticker via its row's remove button, which only shows on hover. */
export async function removeFromWatchlist(page: Page, ticker: string): Promise<void> {
  await page.getByTestId(`watchlist-row-${ticker}`).hover();
  await page.getByTestId(`watchlist-remove-${ticker}`).click();
}

/** Place a market order through the trade bar. */
export async function placeTrade(page: Page, ticker: string, quantity: number, side: "buy" | "sell"): Promise<void> {
  await page.getByTestId("trade-ticker").fill(ticker);
  await page.getByTestId("trade-quantity").fill(String(quantity));
  await page.getByTestId(`trade-${side}`).click();
}
