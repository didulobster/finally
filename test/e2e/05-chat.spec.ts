import { expect, test, type Page } from "@playwright/test";
import { openApp, readNumber } from "./helpers";

/** With LLM_MOCK=true the backend parses "buy/sell N TICKER" and "add/remove TICKER". */
async function sendChat(page: Page, text: string) {
  await page.getByTestId("chat-input").fill(text);
  await page.getByTestId("chat-send").click();
}

const lastAssistant = (page: Page) => page.locator('[data-testid="chat-message"][data-role="assistant"]').last();

test("chat replies to a message", async ({ page }) => {
  await openApp(page);
  await sendChat(page, "How is my portfolio doing?");
  await expect(page.locator('[data-testid="chat-message"][data-role="user"]').last()).toContainText("How is my portfolio doing?");
  await expect(lastAssistant(page)).toContainText("Mock response to: How is my portfolio doing?");
  await expect(page.getByTestId("chat-loading")).toHaveCount(0);
});

test("chat executes a trade and shows it inline", async ({ page }) => {
  await openApp(page);
  const cash = page.getByTestId("cash-balance");
  const before = await readNumber(cash);

  await sendChat(page, "buy 2 NVDA");
  await expect(page.locator('[data-testid="chat-action"][data-kind="trade"]').last()).toContainText(/Bought 2 NVDA/);
  await expect(page.getByTestId("position-row-NVDA")).toBeVisible();
  await expect.poll(() => readNumber(cash)).toBeLessThan(before);
});

test("chat manages the watchlist", async ({ page }) => {
  await openApp(page);
  await sendChat(page, "add PYPL");
  await expect(page.locator('[data-testid="chat-action"][data-kind="watchlist"]').last()).toContainText("PYPL");
  await expect(page.getByTestId("watchlist-row-PYPL")).toBeVisible();

  await sendChat(page, "remove PYPL");
  await expect(page.getByTestId("watchlist-row-PYPL")).toHaveCount(0);
});

test("chat reports a failed trade", async ({ page }) => {
  await openApp(page);
  await sendChat(page, "sell 500 V");
  await expect(lastAssistant(page)).toContainText(/insufficient shares/i);
  await expect(page.getByTestId("position-row-V")).toHaveCount(0);
});

test("chat history survives a page reload", async ({ page }) => {
  await openApp(page);
  await sendChat(page, "remember this message");
  await expect(lastAssistant(page)).toContainText("Mock response to: remember this message");

  await page.reload();
  await expect(page.locator('[data-testid="chat-message"][data-role="user"]').last()).toContainText("remember this message");
  await expect(lastAssistant(page)).toContainText("Mock response to: remember this message");
});
