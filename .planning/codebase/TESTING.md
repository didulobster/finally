---
last_mapped_commit: 7f7cd7c670c507ac353eb6fe89563c5b28f50406
last_mapped_at: 2026-09-25
---
# Testing Patterns

**Analysis Date:** 2026-09-25

## Test Framework

**Backend - pytest (Python):**

- Framework: `pytest >= 9.1.1`
- Async support: `pytest-asyncio >= 1.4.0` with `asyncio_mode = "auto"`
- Config file: `backend/pyproject.toml` under `[tool.pytest.ini_options]`
- Test paths: `backend/tests/`

**Frontend/E2E - Playwright:**

- Framework: `@playwright/test >= 1.63.0`
- Config file: `test/playwright.config.ts`
- Test paths: `test/e2e/`
- Runs serially (single worker) against shared backend instance
- Mock LLM mode for determinism: `LLM_MOCK=true`

**Run Commands:**

```bash

# Backend tests (from backend/ directory)

pytest                     # Run all tests
pytest -v                  # Verbose output
pytest tests/test_portfolio.py  # Single test file
pytest -k "test_buy"      # Tests matching pattern

# E2E tests (from test/ directory)

npm test                   # Run all E2E tests
npm test -- --debug       # Debug mode
npm test -- --headed      # Show browser window
```

## Test File Organization

**Backend Structure:**

```
backend/tests/
├── __init__.py          # Empty, marks as package
├── conftest.py          # Shared fixtures (temp database setup)
├── test_portfolio.py    # Portfolio module tests
├── test_actions.py      # Actions module tests
└── test_api.py          # REST API route tests
```

**E2E Structure:**

```
test/e2e/
├── helpers.ts           # Shared helper functions and constants
├── 01-fresh-start.spec.ts   # Initial state and rendering
├── 02-watchlist.spec.ts     # Watchlist CRUD operations
├── 03-trading.spec.ts       # Buy/sell trading
├── 04-portfolio-viz.spec.ts # Portfolio visualizations
├── 05-chat.spec.ts          # LLM chat integration
└── 06-sse-reconnect.spec.ts # Server-Sent Events resilience
```

**Naming:**

- Backend: `test_*.py` (module_name → `test_module.py`)
- E2E: `*.spec.ts` (numbered: `01-*.spec.ts`)
- Test functions: `test_descriptive_name()`

## Test Structure

**Backend Suite Organization:**

```python

# Setup fixture per test file

@pytest.fixture(autouse=True)
def db():
    init_db()  # Fresh database for each test

# Test function

def test_buy_then_sell_updates_cash_and_avg_cost():
    # Setup / Arrange
    portfolio.execute_trade("AAPL", "buy", 10, 100.0)
    cache = PriceCache()
    cache.update("AAPL", 160.0)
    
    # Execute / Act
    state = portfolio.get_portfolio(cache)
    
    # Assert
    [pos] = state["positions"]
    assert pos["quantity"] == 20
    assert state["cash_balance"] == 7000.0
```

**E2E Test Organization:**

```typescript
import { expect, test } from "@playwright/test";
import { openApp, placeTrade, readNumber } from "./helpers";

test("descriptive test name", async ({ page }) => {
  // Setup: use helpers
  await openApp(page);
  
  // Act: interact with UI
  await placeTrade(page, "AAPL", 5, "buy");
  
  // Assert: verify state changed
  await expect(page.getByTestId("position-row-AAPL")).toBeVisible();
  const cash = await readNumber(page.getByTestId("cash-balance"));
  expect(cash).toBeLessThan(10000);
});
```

**Patterns:**

- **Setup**: Fixtures initialize fresh database (`temp_db` fixture in `conftest.py`)
- **Teardown**: Auto-cleanup via pytest fixtures; no explicit teardown needed
- **Async Tests**: Marked with `async def test_*()` in backend; handled by pytest-asyncio
- **E2E Async**: All Playwright tests are async; `await` on page interactions

## Mocking

**Backend - Database Isolation:**

- `conftest.py` fixture `temp_db` isolates tests with separate SQLite file:
  ```python
  @pytest.fixture(autouse=True)
  def temp_db(tmp_path, monkeypatch):
      monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
      monkeypatch.setenv("LLM_MOCK", "true")
      monkeypatch.delenv("MASSIVE_API_KEY", raising=False)
  ```

**Backend - Monkeypatch for Constants:**

- Used to override module constants during tests:
  ```python
  async def test_snapshot_loop_records_periodically(monkeypatch):
      monkeypatch.setattr(main, "SNAPSHOT_INTERVAL", 0.01)
      # Now snapshot_loop runs every 0.01s instead of 30s
  ```

**Backend - Real Objects Over Mocks:**

- No mock objects; real implementations preferred
- `SimulatorDataSource` used in tests (real in-memory market data)
- `PriceCache` used directly (in-memory)
- Database operations use real `connect()` with isolated temp database

**LLM Mock Mode:**

- Backend provides deterministic mock LLM responses when `LLM_MOCK=true`
- Tests and E2E runs enable this via environment variable in conftest/playwright config
- Mock response predictable: `{"message": "Mock response", "trades": [...], "watchlist_changes": [...]}`

**E2E - No Test Doubles:**

- Tests run against real running FinAlly container
- No mocking at UI layer; all interactions are real
- SSE stream is real (used to verify connection status)
- Relies on `LLM_MOCK=true` for deterministic chat responses

## Fixtures and Factories

**Backend Fixtures:**

**Global Fixture (`conftest.py`):**

```python
@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    """Point every test at its own fresh SQLite file."""
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("LLM_MOCK", "true")
    monkeypatch.delenv("MASSIVE_API_KEY", raising=False)
```

**Per-File Fixtures:**

```python

# test_portfolio.py

@pytest.fixture(autouse=True)
def db():
    init_db()  # Initialize fresh database schema

# test_actions.py

@pytest.fixture
async def market():
    init_db()
    cache = PriceCache()
    source = SimulatorDataSource(cache)
    await source.start(watchlist.get_tickers())
    yield cache, source  # Provide to test
    await source.stop()  # Cleanup
```

**Test Data:**

- No factory classes; data created inline in tests
- Example:
  ```python
  def test_buy_then_sell():
      portfolio.execute_trade("AAPL", "buy", 10, 100.0)  # Direct call
      cache = PriceCache()
      cache.update("AAPL", 160.0)
      # ... assertions
  ```

**E2E Helpers (`test/e2e/helpers.ts`):**

```typescript
export const DEFAULT_TICKERS = ["AAPL", "GOOGL", "MSFT", ...];

export async function openApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("connection-status"))
    .toHaveAttribute("data-status", "connected");
}

export async function placeTrade(
  page: Page, 
  ticker: string, 
  quantity: number, 
  side: "buy" | "sell"
): Promise<void> {
  await page.getByTestId("trade-ticker").fill(ticker);
  await page.getByTestId("trade-quantity").fill(String(quantity));
  await page.getByTestId(`trade-${side}`).click();
}
```

## Coverage

**Backend Requirements:** None enforced

**View Coverage:**

```bash

# From backend/ directory

pytest --cov=app --cov-report=html

# View report in htmlcov/index.html (if coverage tool installed)

```

**Current Coverage Observed:**

- Portfolio logic: High (all trade paths tested)
- API routes: Medium-High (happy path and error cases)
- Market data: Simulator tested; Massive API not exercised in tests
- Chat service: Mocked LLM makes integration testing limited

## Test Types

**Unit Tests (Backend):**

- **Scope:** Individual module functions (portfolio, watchlist, actions)
- **Approach:** Direct function calls with fixtures providing dependencies
- **Example:** `test_buy_then_sell_updates_cash_and_avg_cost()` — tests `portfolio.execute_trade()` directly
- **Data:** Real in-memory objects (PriceCache, SimulatorDataSource)
- **Location:** `backend/tests/test_portfolio.py`, `backend/tests/test_actions.py`

**Integration Tests (Backend):**

- **Scope:** Multiple modules working together (portfolio + market + actions)
- **Approach:** Call higher-level `actions.trade()` which orchestrates portfolio, market, cache
- **Example:** `test_trade_fills_at_cache_price_and_snapshots()` — tests trade flow with real market source
- **Data:** Real market data source (simulator)
- **Location:** `backend/tests/test_actions.py`

**API Tests (Backend):**

- **Scope:** REST endpoints and request/response handling
- **Approach:** `TestClient` from FastAPI, no actual HTTP
- **Example:** `test_buy_and_sell()` — sends POST to `/api/portfolio/trade`, checks response
- **Error Cases:** Tested separately with parametrize decorator
- **Location:** `backend/tests/test_api.py`

**E2E Tests (Browser):**

- **Scope:** Full user workflows (UI → API → Database)
- **Approach:** Playwright test framework against running FinAlly container
- **Environment:** `LLM_MOCK=true` for determinism
- **Browser:** Chromium only (configured in `playwright.config.ts`)
- **Viewport:** 1600x1000 (desktop)
- **Serial Execution:** Tests run one at a time, sharing backend state (by design)
- **Scenarios Covered:**
  - Fresh start: default watchlist, $10k cash, streaming prices
  - Watchlist CRUD: add/remove tickers
  - Trading: buy, sell, error handling
  - Portfolio viz: treemap, P&L chart rendering
  - Chat: message sending, mock LLM response, trade execution
  - SSE resilience: connection status indicator
- **Location:** `test/e2e/*.spec.ts`

## Common Patterns

**Async Testing (Backend):**

```python

# Mark function async

async def test_trade_fills_at_cache_price_and_snapshots(market):
    cache, source = market
    trade = await actions.trade(cache, source, "aapl", "buy", 2)
    assert trade["ticker"] == "AAPL"
```

**Parametrized Tests:**

```python
@pytest.mark.parametrize("side,qty,msg", [
    ("buy", 1000, "Insufficient cash"),
    ("sell", 1, "Insufficient shares"),
    ("buy", 0, "positive"),
    ("hold", 1, "Invalid side"),
])
def test_trade_validation(side, qty, msg):
    with pytest.raises(TradeError, match=msg):
        portfolio.execute_trade("AAPL", side, qty, 100.0)
```

**Error Testing:**

```python
def test_trade_validation(side, qty, msg):
    with pytest.raises(TradeError, match=msg):  # Catch exception, match message
        portfolio.execute_trade("AAPL", side, qty, 100.0)
    assert portfolio.get_portfolio(PriceCache())["cash_balance"] == 10000.0  # State unchanged
```

**E2E Async with Polling:**

```typescript
// Wait for condition with timeout
await expect.poll(allPrices, { timeout: 15_000 }).not.toBe(initial);

// Wait for element then assert
await expect(page.getByTestId("position-row-AAPL")).toBeVisible();
const cash = page.getByTestId("cash-balance");
await expect.poll(() => readNumber(cash)).toBeLessThan(before);
```

**E2E Helper Usage:**

```typescript
test("buy shares", async ({ page }) => {
  await openApp(page);  // Helper: goto("/"), wait for connection
  const price = await waitForPrice(page, "AAPL");  // Helper: get price, parse
  await placeTrade(page, "AAPL", 5, "buy");  // Helper: fill form, click
  await expect(page.getByTestId("position-row-AAPL")).toBeVisible();
});
```

**Backend State Validation:**

```python
def test_failed_trade_on_new_ticker_does_not_track_it(market):
    cache, source = market
    with pytest.raises(TradeError):
        await actions.trade(cache, source, "PYPL", "sell", 1)
    # Verify no side effect
    assert "PYPL" not in source.get_tickers()
```

**E2E Numeric Assertion with Tolerance:**

```typescript
const chartPrice = await readNumber(page.getByTestId("chart-price"));
const listPrice = await readNumber(page.getByTestId("watchlist-price-MSFT"));
// Prices should be close (within 1%)
expect(Math.abs(chartPrice - listPrice) / listPrice).toBeLessThan(0.01);
```

## Test Data Setup

**Backend:**

- Database initialized fresh per test via `temp_db` fixture
- Default user: `id="default"`, `cash_balance=10000.0`
- Default watchlist: AAPL, GOOGL, MSFT, AMZN, TSLA, NVDA, META, JPM, V, NFLX
- Seed prices generated deterministically by simulator
- No external data files; all inline

**E2E:**

- Backend container runs with `LLM_MOCK=true` and simulator (default)
- Fresh database on container restart; tests share state (intentional, tests run serially)
- Helper constants: `DEFAULT_TICKERS` array
- No pre-built test data files

## Debugging

**Backend:**

- Use `pytest -v` for verbose output
- Add `print()` or `logger.info()` statements; pytest captures output
- Use `pytest --pdb` to drop into debugger on failure
- Use `monkeypatch` to override values for investigation

**E2E:**

- Use `--headed` flag to show browser: `npm test -- --headed`
- Use `--debug` flag for step-by-step debugging
- Playwright records traces on failure (configured in `playwright.config.ts`)
- Screenshots captured on failure in `test/test-results/`
- HTML report available: `test/playwright-report/` (open with browser)

## Assertions

**Backend Patterns:**

```python
assert condition, "optional message"
assert value == expected
assert value > threshold
assert value.isclose(expected, rel_tol=0.01)
```

**E2E Patterns (Playwright):**

```typescript
await expect(element).toBeVisible();
await expect(element).toHaveText(/pattern/);
await expect(element).toHaveAttribute("data-status", "connected");
await expect(element).toHaveCount(n);
expect(value).toBe(expected);
expect(value).toBeCloseTo(expected, decimals);
expect(value).toBeLessThan(threshold);
```

---

*Testing analysis: 2026-09-25*
