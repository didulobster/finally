import { expect, test } from "@playwright/test";
import { DEFAULT_TICKERS, openApp, readNumber, waitForPrice } from "./helpers";

test("health endpoint responds", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
});

test("fresh start shows default watchlist, $10k cash and streaming prices", async ({ page }) => {
  await openApp(page);

  for (const ticker of DEFAULT_TICKERS) {
    await expect(page.getByTestId(`watchlist-row-${ticker}`)).toBeVisible();
  }
  await expect(page.locator('[data-testid^="watchlist-row-"]')).toHaveCount(DEFAULT_TICKERS.length);

  expect(await readNumber(page.getByTestId("cash-balance"))).toBe(10000);
  expect(await readNumber(page.getByTestId("total-value"))).toBeCloseTo(10000, 0);

  expect(await waitForPrice(page, "AAPL")).toBeGreaterThan(0);
  const allPrices = async () =>
    (await Promise.all(DEFAULT_TICKERS.map((t) => readNumber(page.getByTestId(`watchlist-price-${t}`))))).join(",");
  const initial = await allPrices();
  await expect.poll(allPrices, { timeout: 15_000 }).not.toBe(initial);
});

test("clicking a ticker selects it in the main chart", async ({ page }) => {
  await openApp(page);
  const row = page.getByTestId("watchlist-row-MSFT");
  await row.click();
  await expect(row).toHaveAttribute("data-selected", "true");
  await expect(page.getByTestId("trade-ticker")).toHaveValue("MSFT");
  await expect(page.getByTestId("main-chart")).toHaveAttribute("data-ticker", "MSFT");
  await expect(page.getByTestId("main-chart")).toContainText("MSFT");

  const chart = page.getByTestId("price-chart");
  await expect(chart).toBeVisible();
  await expect.poll(async () => Number(await chart.getAttribute("data-points"))).toBeGreaterThan(0);
  const chartPrice = await readNumber(page.getByTestId("chart-price"));
  const listPrice = await readNumber(page.getByTestId("watchlist-price-MSFT"));
  expect(Math.abs(chartPrice - listPrice) / listPrice).toBeLessThan(0.01);
});
