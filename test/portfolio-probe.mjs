/**
 * portfolio-probe: checks the trade bar edges and the live header total that no E2E spec covers.
 *
 * Stages: empty-inputs (422 and 400 texts shown, cash unchanged), lowercase ("nvda" fills as NVDA),
 * identity (total-value equals cash plus sum of qty x price over positions rows, and each row's
 * P&L equals (price - avg cost) x qty, on every sample), ticking (the total moves while cash holds).
 *
 * Usage (from the repo root, app running): node test/portfolio-probe.mjs [app-url]
 */
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://127.0.0.1:8000";
const TIMEOUT = 15_000;
const SAMPLES = 20;
const SAMPLE_MS = 500;

const id = (t) => `[data-testid="${t}"]`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Same rule as e2e/helpers.ts parseNumber: U+2212 to "-", keep digits, "." and "-". */
const parseNumber = (text) => Number((text ?? "").replace(/−/g, "-").replace(/[^0-9.-]/g, ""));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

async function trade(ticker, qty) {
  await page.fill(id("trade-ticker"), ticker);
  await page.fill(id("trade-quantity"), qty);
  await page.click(id("trade-buy"));
}

async function waitResult(text) {
  await page.waitForFunction(
    ([sel, t]) => document.querySelector(sel)?.textContent.includes(t),
    [id("trade-result"), text],
    { timeout: TIMEOUT },
  );
}

/** Read the header numbers and every positions row in one pass over the DOM. */
function sample() {
  return page.evaluate(() => {
    const text = (t) => document.querySelector(`[data-testid="${t}"]`)?.textContent ?? "";
    const rows = [...document.querySelectorAll('tr[data-testid^="position-row-"]')].map((tr) =>
      [...tr.cells].slice(1, 5).map((c) => c.textContent),
    );
    return { total: text("total-value"), cash: text("cash-balance"), rows };
  });
}

let stage = "connect";
let code = 0;
try {
  await page.goto(url);
  await page.waitForSelector(`${id("connection-status")}[data-status="connected"]`, { timeout: TIMEOUT });
  await page.waitForSelector(id("cash-balance"), { timeout: TIMEOUT });

  stage = "empty-inputs";
  const cashBefore = await page.textContent(id("cash-balance"));
  await trade("", "");
  await waitResult("greater than 0");
  await trade("", "1");
  await waitResult("Invalid ticker");
  const cashAfter = await page.textContent(id("cash-balance"));
  if (cashAfter !== cashBefore) throw new Error(`cash changed ${cashBefore} -> ${cashAfter}`);

  stage = "lowercase";
  await trade("nvda", "2");
  await waitResult("Bought 2 NVDA @ $");
  await page.waitForSelector(id("position-row-NVDA"), { timeout: TIMEOUT });

  stage = "identity";
  const totals = new Set();
  const cashes = new Set();
  for (let i = 0; i < SAMPLES; i++, await sleep(SAMPLE_MS)) {
    const s = await sample();
    const total = parseNumber(s.total);
    const cash = parseNumber(s.cash);
    const rows = s.rows.map((cells) => cells.map(parseNumber));
    const shares = rows.reduce((n, [qty]) => n + qty, 0);
    const expected = rows.reduce((sum, [qty, , price]) => sum + qty * price, cash);
    if (Math.abs(total - expected) > 0.01 + 0.005 * shares) {
      throw new Error(`total ${s.total} vs cash ${s.cash} + positions = ${expected.toFixed(2)}`);
    }
    for (const [qty, avg, price, pnl] of rows) {
      if (Math.abs(pnl - (price - avg) * qty) > 0.01 + 0.01 * qty) {
        throw new Error(`row pnl ${pnl} vs (${price} - ${avg}) x ${qty}`);
      }
    }
    totals.add(s.total);
    cashes.add(s.cash);
  }

  stage = "ticking";
  if (totals.size < 3 || cashes.size !== 1) throw new Error(`distinct totals=${totals.size} cash=${cashes.size}`);
  console.log(`portfolio-probe: PASS totals=${totals.size} samples=${SAMPLES}`);
} catch (e) {
  const detail = e.message.split("\n")[0];
  console.log(`portfolio-probe: FAIL ${stage}: ${detail}`);
  code = 1;
} finally {
  await browser.close();
}
process.exit(code);
