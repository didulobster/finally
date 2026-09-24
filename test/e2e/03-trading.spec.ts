import { expect, test } from "@playwright/test";
import { openApp, placeTrade, readNumber, waitForPrice } from "./helpers";

test("buy shares: cash decreases and position appears", async ({ page }) => {
  await openApp(page);
  const cash = page.getByTestId("cash-balance");
  const before = await readNumber(cash);
  const price = await waitForPrice(page, "AAPL");

  await placeTrade(page, "AAPL", 5, "buy");

  await expect(page.getByTestId("position-row-AAPL")).toBeVisible();
  await expect(page.getByTestId("position-qty-AAPL")).toHaveText(/\b5(\.0+)?\b/);
  await expect.poll(() => readNumber(cash)).toBeLessThan(before);
  const spent = before - (await readNumber(cash));
  expect(Math.abs(spent - 5 * price) / (5 * price)).toBeLessThan(0.02);
});

test("sell shares: cash increases and position updates, then disappears", async ({ page }) => {
  await openApp(page);
  const cash = page.getByTestId("cash-balance");
  await placeTrade(page, "MSFT", 4, "buy");
  await expect(page.getByTestId("position-qty-MSFT")).toHaveText(/\b4(\.0+)?\b/);

  const beforePartial = await readNumber(cash);
  await placeTrade(page, "MSFT", 1, "sell");
  await expect(page.getByTestId("position-qty-MSFT")).toHaveText(/\b3(\.0+)?\b/);
  await expect.poll(() => readNumber(cash)).toBeGreaterThan(beforePartial);

  const beforeFull = await readNumber(cash);
  await placeTrade(page, "MSFT", 3, "sell");
  await expect(page.getByTestId("position-row-MSFT")).toHaveCount(0);
  await expect.poll(() => readNumber(cash)).toBeGreaterThan(beforeFull);
});

test("rejected trades show an error and leave cash unchanged", async ({ page }) => {
  await openApp(page);
  const cash = page.getByTestId("cash-balance");
  const before = await readNumber(cash);

  await placeTrade(page, "NFLX", 1_000_000, "buy");
  await expect(page.getByTestId("trade-result")).toContainText(/insufficient cash/i);

  await placeTrade(page, "JPM", 10, "sell");
  await expect(page.getByTestId("trade-result")).toContainText(/insufficient shares/i);

  expect(await readNumber(cash)).toBe(before);
  await expect(page.getByTestId("position-row-JPM")).toHaveCount(0);
});
