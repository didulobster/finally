import { expect, test } from "@playwright/test";
import { openApp, removeFromWatchlist, waitForPrice } from "./helpers";

test("add and remove a ticker from the watchlist", async ({ page, request }) => {
  await openApp(page);

  await page.getByTestId("watchlist-add-input").fill("pypl");
  await page.getByTestId("watchlist-add-button").click();
  await expect(page.getByTestId("watchlist-row-PYPL")).toBeVisible();
  expect(await waitForPrice(page, "PYPL")).toBeGreaterThan(0);
  const added = await (await request.get("/api/watchlist")).json();
  expect(added.map((w: { ticker: string }) => w.ticker)).toContain("PYPL");

  await removeFromWatchlist(page, "PYPL");
  await expect(page.getByTestId("watchlist-row-PYPL")).toHaveCount(0);
  const removed = await (await request.get("/api/watchlist")).json();
  expect(removed.map((w: { ticker: string }) => w.ticker)).not.toContain("PYPL");
});

test("watchlist survives a page reload", async ({ page }) => {
  await openApp(page);
  await page.getByTestId("watchlist-add-input").fill("DIS");
  await page.getByTestId("watchlist-add-button").click();
  await expect(page.getByTestId("watchlist-row-DIS")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("watchlist-row-DIS")).toBeVisible();

  await removeFromWatchlist(page, "DIS");
  await expect(page.getByTestId("watchlist-row-DIS")).toHaveCount(0);
});
