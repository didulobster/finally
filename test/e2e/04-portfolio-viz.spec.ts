import { expect, test } from "@playwright/test";
import { openApp, placeTrade } from "./helpers";

/** Parse "rgb(r, g, b)" / "rgba(r, g, b, a)" into [r, g, b]. */
function rgb(color: string): number[] {
  return color.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);
}

test("heatmap shows held positions colored by P&L", async ({ page }) => {
  await openApp(page);
  await placeTrade(page, "GOOGL", 3, "buy");
  await expect(page.getByTestId("position-row-GOOGL")).toBeVisible();

  await expect(page.getByTestId("heatmap")).toBeVisible();
  const tile = page.getByTestId("heatmap-cell-GOOGL");
  await expect(tile).toBeVisible();
  const box = await tile.boundingBox();
  expect(box!.width * box!.height).toBeGreaterThan(0);

  const tiles = page.locator('[data-testid^="heatmap-cell-"]');
  for (const t of await tiles.all()) {
    const pnl = await t.getAttribute("data-pnl");
    const [r, g] = rgb(await t.evaluate((el) => getComputedStyle(el).backgroundColor));
    if (pnl === "up") expect(g).toBeGreaterThan(r);
    else if (pnl === "down") expect(r).toBeGreaterThan(g);
    else expect(pnl).toBe("flat");
  }
});

test("P&L chart renders with snapshot data", async ({ page, request }) => {
  await openApp(page);
  const history = await (await request.get("/api/portfolio/history")).json();
  expect(history.length).toBeGreaterThan(0);

  const chart = page.getByTestId("pnl-chart");
  await expect(chart).toBeVisible();
  await expect.poll(async () => Number(await chart.getAttribute("data-points"))).toBeGreaterThan(0);
  await expect(chart.locator("canvas").first()).toBeVisible();
});

test("positions table lists every held position", async ({ page, request }) => {
  await openApp(page);
  const portfolio = await (await request.get("/api/portfolio")).json();
  expect(portfolio.positions.length).toBeGreaterThan(0);
  await expect(page.getByTestId("positions-empty")).toHaveCount(0);
  for (const p of portfolio.positions) {
    await expect(page.getByTestId(`position-row-${p.ticker}`)).toBeVisible();
  }
});
