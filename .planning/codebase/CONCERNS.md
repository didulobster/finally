---
last_mapped_commit: 7f7cd7c670c507ac353eb6fe89563c5b28f50406
last_mapped_at: 2026-09-25
---
# Codebase Concerns

**Analysis Date:** 2026-09-25

## Critical Blockers

### Missing Frontend Directory

**What happens:** The entire `frontend/` directory is missing from the repository. The Next.js application is not present.

**Why it's critical:** 

- The Dockerfile expects to build a frontend (Stage 1, lines 2-7 of `Dockerfile`) and copy static exports to `backend/static`
- Without it, Docker builds will fail immediately
- All e2e tests (`test/e2e/*.spec.ts`) are completely non-functional — they reference `data-testid` attributes that exist only in the missing frontend
- The entire deployment architecture depends on the frontend being served by FastAPI (`backend/app/main.py` line 72-73 mounts SPAStaticFiles)
- The project specification in `planning/PLAN.md` defines the frontend as essential

**Impact:** The application cannot be built or deployed. Streaming prices, trading UI, portfolio visualization, and chat interface are all missing.

**Fix approach:** Implement the Next.js frontend using the specification in `planning/PLAN.md` sections 2 (UX) and 10 (Design). See `STRUCTURE.md` for where to place it.

---

## Tech Debt

### Bare Exception Handlers Hiding Errors

**Issue:** Multiple background tasks and async operations catch `Exception` broadly and log, allowing execution to continue despite unknown failures.

**Files affected:**

- `backend/app/main.py` lines 49-50: snapshot_loop catches all exceptions during portfolio snapshot recording
- `backend/app/market/simulator.py` lines 138-139: _run catches all exceptions during price stepping
- `backend/app/chat/llm.py` lines 96-97: ask_llm catches all exceptions during LLM API calls
- `backend/app/market/massive_client.py` lines 73-74: _poll_once catches all exceptions during Massive API polling

**Why it's wrong:** Bare `except Exception:` swallows unexpected errors (network timeouts, out-of-memory, database corruption) and logs them to console. This:

- Masks bugs that should fail fast
- Makes debugging in production nearly impossible
- Allows the system to enter inconsistent states (e.g., prices not updating, snapshots not recording)
- The application continues running even if a critical system is broken

**Do this instead:** Catch specific exceptions and handle them explicitly. Example from `backend/app/portfolio.py` lines 49-50:

```python
try:
    portfolio.record_snapshot(cache)
except sqlite3.OperationalError as e:
    logger.error(f"Database error recording snapshot: {e}")
    # Consider retrying or alerting
except Exception:
    logger.exception("Unexpected error recording snapshot")
```

---

### Fallback to Average Cost Masks Missing Price Data

**Issue:** When a position has no live price, portfolio valuation falls back to average cost silently.

**File:** `backend/app/portfolio.py` line 78

```python
current = cache.get_price(row["ticker"]) or row["avg_cost"]
```

**Why it's wrong:** If the market data stream stops for a ticker, or a new ticker is added but hasn't received a price update yet, the P&L calculation becomes stale. The user sees no warning — positions appear profitable/unprofitable based on outdated cost basis, not live prices.

**Impact:** Misleading portfolio valuations, user makes trading decisions based on stale data.

**Do this instead:** 

```python
current = cache.get_price(row["ticker"])
if current is None:
    logger.warning(f"No live price for {row['ticker']}; using cost basis temporarily")
    current = row["avg_cost"]

# Or: raise an error if price is missing, forcing explicit handling

```

---

### Chat Message History Unbounded Growth

**Issue:** Chat messages are written to the database with no limit; only the read operation applies `HISTORY_LIMIT`.

**Files:** `backend/app/chat/service.py` lines 10, 18-29

**Why it's wrong:** The `chat_messages` table will grow indefinitely. Over months of use, queries to `get_history()` will scan the entire table, slowing responses. No disk space protection.

**Impact:** Gradual performance degradation; eventual disk exhaustion in production.

**Do this instead:** Enforce retention at write time:

```python
def save_message(role: str, content: str, actions_taken: dict | None = None) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO chat_messages (...) VALUES (...)",
            (new_id(), DEFAULT_USER, role, content, ...)
        )
        # Delete oldest messages beyond limit
        conn.execute("""
            DELETE FROM chat_messages WHERE id NOT IN (
                SELECT id FROM chat_messages WHERE user_id = ? 
                ORDER BY created_at DESC LIMIT ?
            ) AND user_id = ?
        """, (DEFAULT_USER, HISTORY_LIMIT, DEFAULT_USER))
```

---

### Missing Indexes on Frequently Queried Columns

**Issue:** SQLite schema has no indexes on commonly filtered/joined columns.

**File:** `backend/app/db/schema.sql`

**Why it's wrong:** Queries like `SELECT * FROM positions WHERE user_id = ? AND ticker = ?` (done on every trade) perform full table scans. As data grows (months of trades, snapshots), these become slow.

**Current schema:** Only PRIMARY KEY constraints and UNIQUE constraints; no explicit indexes.

**Do this instead:** Add indexes in schema.sql:

```sql
CREATE INDEX IF NOT EXISTS idx_positions_user_ticker 
  ON positions(user_id, ticker);
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_recorded 
  ON portfolio_snapshots(user_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_trades_user_ticker 
  ON trades(user_id, ticker);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created 
  ON chat_messages(user_id, created_at);
```

---

### Unusual Database Transaction Handling

**Issue:** SQLite connection is opened with `isolation_level=None` (autocommit mode) but immediately uses explicit `BEGIN IMMEDIATE`.

**File:** `backend/app/db/database.py` lines 37-40

```python
conn = sqlite3.connect(db_path(), isolation_level=None)  # autocommit mode

# ...

conn.execute("BEGIN IMMEDIATE")  # manual transaction
```

**Why it's wrong:** This is unconventional and error-prone:

- `isolation_level=None` disables implicit transaction handling
- `BEGIN IMMEDIATE` acquires the write lock upfront (correct for serialization)
- But if an exception occurs between the manual BEGIN and COMMIT, cleanup relies on the try/except block (which works, but is fragile)
- SQLite documentation recommends using the standard Python context manager

**Impact:** Works correctly but is harder to reason about; potential for missed commits/rollbacks if exception handling changes.

**Do this instead:** Use standard Python sqlite3 transaction handling:

```python
@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(db_path())
    conn.row_factory = sqlite3.Row
    conn.isolation_level = 'DEFERRED'  # or 'IMMEDIATE' for write-heavy workloads
    try:
        yield conn
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()
```

---

## Performance Bottlenecks

### No Database Indexes on Foreign Keys and Timestamps

**Issue:** Portfolio snapshot queries (`backend/app/portfolio.py` line 111-116) join and filter on `user_id` and `recorded_at` without indexes.

**Files:** `backend/app/db/schema.sql` (missing indexes), `backend/app/portfolio.py` (queries affected)

**Impact:** As `portfolio_snapshots` table grows (one row every 30 seconds = ~2,880 rows per day), queries become slower.

**Symptom:** Slow API response for `/api/portfolio/history` endpoint after weeks of operation.

---

### Price Cache Version Counter Unbounded

**Issue:** The `version` field in `PriceCache` increments on every price update with no reset mechanism.

**File:** `backend/app/market/cache.py` lines 15, 29, 46

**Why it's wrong:** Theoretically, after ~2 billion price updates (10 years at 1 update/second), the version counter could overflow if Python's int wraps (unlikely due to arbitrary precision, but a code smell).

**Impact:** Unlikely to manifest, but indicates the version should be reset periodically or use a hash-based change detection.

---

### Potential Memory Growth in Price Update History

**Issue:** The market demo (`backend/market_data_demo.py` line 71) accumulates price history indefinitely.

**File:** `backend/market_data_demo.py` lines 24-25, 71

**Impact:** The `history` dictionary grows without bound during long demo runs. For production, the frontend should handle sparkline history, not the server.

---

## Fragile Areas

### Correlated Price Simulator Cholesky Decomposition

**Issue:** The GBM simulator computes a Cholesky decomposition of the correlation matrix on every ticker add/remove.

**File:** `backend/app/market/simulator.py` lines 79-89

```python
def _rebuild_cholesky(self) -> None:
    # ...
    self._cholesky = np.linalg.cholesky(corr)  # No error handling
```

**Why fragile:** If the correlation matrix becomes singular (some tickers have identical correlations), or nearly singular (numerical precision issues), `np.linalg.cholesky()` raises `numpy.linalg.LinAlgError` with no catch. This will crash the market data source.

**Impact:** Adding certain ticker combinations could crash the simulator. Safe modification: test with any ticker combination first.

**Do this instead:**

```python
try:
    self._cholesky = np.linalg.cholesky(corr)
except np.linalg.LinAlgError:
    logger.warning(f"Singular correlation matrix for {self._tickers}; using identity")
    self._cholesky = np.eye(n)
```

---

### SSE Stream Version-Based Change Detection Without Locking

**Issue:** The SSE stream reads from `cache.get_all()` which may be modified while iterating.

**File:** `backend/app/market/stream.py` lines 32-36

```python
while not await request.is_disconnected():
    if cache.version != last_version:
        last_version = cache.version
        payload = {t: u.to_dict() for t, u in cache.get_all().items()}
```

**Why fragile:** The `cache.get_all()` method in `backend/app/market/cache.py` acquires a lock (line 40), but the version check (line 33) happens outside the lock. Between checking version and calling `get_all()`, the cache could be updated multiple times, potentially missing updates.

**Impact:** Rare race condition where SSE clients miss a price update. Frontend shows stale data briefly.

**Do this instead:** Return both version and snapshot atomically:

```python
def get_snapshot(self) -> tuple[int, dict[str, PriceUpdate]]:
    with self._lock:
        return self.version, dict(self._prices)
```

---

### No Error Handling for Massive API Rate Limits

**Issue:** The Massive (Polygon.io) client has no handling for rate limit responses.

**File:** `backend/app/market/massive_client.py` lines 66-80

**Why fragile:** If the Massive API returns a 429 (Too Many Requests), the code logs the exception and continues, silently stopping price updates.

**Impact:** Real market data users won't notice their data has stopped; they'll see stale prices.

**Do this instead:** Detect rate limits explicitly and backoff:

```python
try:
    snapshots = await asyncio.to_thread(
        self._client.get_snapshot_all, SnapshotMarketType.STOCKS, tickers=self._tickers
    )
except Exception as e:
    if "429" in str(e) or "rate limit" in str(e).lower():
        logger.warning(f"Rate limited; backing off to {self._poll_interval * 2}s")
        self._poll_interval *= 2  # Exponential backoff
    logger.exception("Massive snapshot poll failed")
    return
```

---

### LLM Structured Output Parsing Doesn't Validate Ticker Format

**Issue:** The LLM can return any ticker string; no validation that it matches the expected format before execution.

**Files:** `backend/app/chat/llm.py` (parsing), `backend/app/chat/service.py` lines 45-59 (execution)

**Why fragile:** If the LLM returns trades with ticker="AAPL123" or an empty string, the trade attempts fail silently (caught as ValueError, added to errors list), but the user sees a truncated error message.

**Impact:** LLM appears broken; user confused by missing error explanations.

**Do this instead:** Validate trades/watchlist changes before execution:

```python
for t in reply.trades:
    try:
        normalized = actions.normalize_ticker(t.ticker)  # Re-validate
        trades.append(await actions.trade(..., normalized, ...))
    except ValueError as e:
        errors.append(f"Invalid ticker '{t.ticker}': {e}")
```

---

## Security Considerations

### No Authentication or Authorization

**Issue:** The application has no login, no API key, no multi-tenancy. Hardcoded `user_id="default"`.

**File:** `backend/app/db/database.py` line 13, everywhere else uses DEFAULT_USER.

**Risk:** If the container is exposed on a network (intentionally or via misconfiguration), anyone can:

- View portfolio state
- Execute trades with fake money (low impact, but embarrassing)
- Clear chat history
- Inject malicious market data via chat

**Current mitigation:** Single container, intended for local development only. Not production-ready.

**Recommendations:** 

- Document security model clearly (local-only, development only)
- If deploying remotely, add authentication (API key header, JWT, or simple password)
- Example: add `Authorization: Bearer <token>` header check in `backend/app/api.py`

---

### No Input Validation on Ticker Symbols

**Issue:** While `actions.normalize_ticker()` exists, not all paths use it before querying the database.

**File:** `backend/app/api.py` line 80 (watchlist removal) accepts ticker directly from path parameter without validation.

**Risk:** SQL injection is not possible (using parameterized queries), but invalid tickers could cause unexpected behavior.

**Impact:** Low severity; the normalize function is eventually called, but validation order is inconsistent.

---

### Secrets in `.env` Not Gitignored

**Issue:** `.env` contains API keys but is tracked by git (gitignored in `.gitignore`).

**Files:** `.env` (contains OPENROUTER_API_KEY), `.gitignore` (has `.env` rule)

**Current mitigation:** `.gitignore` correctly excludes `.env`, so secrets are not checked in.

**Status:** Safe; follow convention of committing `.env.example` instead.

---

## Scaling Limits

### Single SQLite Connection Pool

**Issue:** Each database operation creates a fresh connection; no connection pooling.

**Files:** `backend/app/db/database.py` line 37, every query uses `with connect():`

**Current capacity:** Single user, low-frequency trading (few trades per minute). SQLite handles this fine.

**Scaling limit:** If this scales to multi-user or high-frequency trading, SQLite will bottleneck. Each connection blocks others during writes.

**Scaling path:** 

- Single-user: SQLite with WAL mode enabled (automatic in modern Python sqlite3 with journal_mode='WAL')
- Multi-user: Migrate to PostgreSQL + connection pooling (psycopg2 + asyncpg)

---

### Market Data Polling Interval Hard-Coded

**Issue:** Massive API polling interval is fixed at 15 seconds (`backend/app/market/massive_client.py` line 31).

**Scaling limit:** High-frequency trading would require faster updates. Real-time SSE push is not supported.

**Scaling path:** Implement WebSocket support or keep-alive heartbeats; increase polling frequency if Massive API tier supports it.

---

### In-Memory Price Cache Not Durable

**Issue:** Price history is lost on restart; only accumulated during this server session.

**File:** `backend/app/market/cache.py`

**Current impact:** Sparklines in the frontend reset on server restart. This is acceptable for demo.

**Scaling concern:** If implementing historical price analytics, need to persist prices to database.

---

## Dependencies at Risk

### OpenRouter/LiteLLM Model Hard-Coded

**Issue:** The LLM model is fixed to `openrouter/openai/gpt-oss-120b` with Cerebras provider.

**File:** `backend/app/chat/llm.py` lines 13-14

**Risk:** If Cerebras availability degrades or Cerebras is delisted, chat breaks with no fallback.

**Impact:** Users can't chat; trading can't be managed via natural language.

**Mitigation:** Model is configurable via environment variable; fallback to simpler model.

**Do this instead:**

```python
MODEL = os.getenv("LLM_MODEL", "openrouter/openai/gpt-oss-120b")
```

---

### Massive API Tier Dependency

**Issue:** The Massive (Polygon.io) free tier does not have snapshot endpoint.

**File:** `backend/app/market/factory.py` and `planning/PLAN.md` section 6.

**Impact:** Users who set `MASSIVE_API_KEY` with free tier account silently fall back to (fail) or get no price updates.

**Current mitigation:** `planning/PLAN.md` documents that Stocks Starter plan or higher is required.

**Do this instead:** Validate the API key and plan tier on startup; fail fast with a helpful error.

---

### NumPy Dependency for Price Correlation

**Issue:** Market simulator depends on NumPy for Cholesky decomposition.

**File:** `backend/app/market/simulator.py` lines 8, 89

**Risk:** If NumPy is unavailable or incompatible, simulator crashes. This is a heavy dependency for a simple math operation.

**Impact:** Market data stops; all prices freeze.

**Mitigation:** NumPy is listed in `backend/pyproject.toml` dependencies.

**Do this instead:** For a simple 2x2 correlation, implement Cholesky manually; avoid heavy dependency:

```python
def cholesky_2x2(corr: list[list[float]]) -> list[list[float]]:
    # Manual Cholesky for small matrices
    a = math.sqrt(corr[0][0])
    b = corr[1][0] / a
    c = math.sqrt(corr[1][1] - b**2)
    return [[a, 0], [b, c]]
```

---

## Test Coverage Gaps

### E2E Tests Depend on Missing Frontend

**Issue:** All 6 end-to-end tests in `test/e2e/*.spec.ts` reference React component test IDs that don't exist.

**Files affected:**

- `test/e2e/01-fresh-start.spec.ts` lines 13-24
- `test/e2e/02-watchlist.spec.ts`
- `test/e2e/03-trading.spec.ts`
- `test/e2e/04-portfolio-viz.spec.ts`
- `test/e2e/05-chat.spec.ts`
- `test/e2e/06-sse-reconnect.spec.ts`

**Test data-testids expected:**

- `watchlist-row-{TICKER}`
- `watchlist-price-{TICKER}`
- `cash-balance`
- `total-value`
- `trade-ticker`, `buy-button`, `sell-button`
- `main-chart`, `price-chart`
- Various chat UI elements

**Impact:** E2E test suite is non-functional. Cannot validate end-to-end user flows.

**Do this instead:** Implement frontend and ensure all test IDs match.

---

### No Integration Test for LLM Trade Execution

**Issue:** Chat module tests (`backend/tests/chat/test_chat.py`) use mock LLM responses; no real LLM integration test.

**File:** `backend/tests/chat/test_chat.py` (uses mock by default)

**Gap:** The structured output schema parsing is not tested against real LLM responses. Format changes could break chat without warning.

**Impact:** Regression risk if LiteLLM or OpenRouter changes response format.

**Do this instead:** Add optional integration test:

```python
@pytest.mark.skipif(not os.getenv("OPENROUTER_API_KEY"), reason="Requires API key")
async def test_real_llm_responds_with_valid_schema():
    cache = PriceCache()
    source = SimulatorDataSource(cache)
    await source.start(["AAPL", "GOOGL"])
    result = await handle_message(cache, source, "What's my portfolio?")
    assert isinstance(result["message"], str)
    assert isinstance(result["trades"], list)
    assert isinstance(result["watchlist_changes"], list)
```

---

### No Tests for Massive API Client

**Issue:** The Massive client has a test file (`backend/tests/market/test_massive.py`), but it likely mocks the API.

**File:** `backend/tests/market/test_massive.py` (51 lines, minimal)

**Gap:** Real API response parsing, rate limit handling, and malformed JSON recovery untested.

**Impact:** Massive users (those with API key) might encounter real API quirks not caught in tests.

---

### Portfolio P&L Calculation Not Tested with High Precision

**Issue:** Tests use round numbers; no edge cases for floating-point precision.

**File:** `backend/tests/test_portfolio.py`

**Gap:** Test buys of 0.33333 shares at $99.99, or positions with thousands of shares to expose rounding errors.

**Impact:** Rare cases of P&L mismatch by ±0.01 could occur.

**Do this instead:** Add parametrized tests with fractional quantities and extreme prices.

---

## Missing Critical Features

### No Graceful Shutdown for Long-Running Requests

**Issue:** When the app shuts down (Ctrl+C in Docker), long-lived SSE connections are abruptly closed.

**File:** `backend/app/main.py` lines 64-67 (lifespan cleanup)

**Impact:** SSE clients see connection drop without warning; no chance to reconnect or save state.

**Do this instead:** Implement graceful shutdown with timeout:

```python
async def lifespan(app: FastAPI):
    # ... startup ...
    yield
    # Shutdown phase
    snapshots.cancel()
    try:
        await asyncio.wait_for(snapshots, timeout=5)
    except asyncio.TimeoutError:
        logger.warning("Snapshot task did not complete in time")
    await source.stop()
```

---

### No Health Check for Market Data Source

**Issue:** The `/api/health` endpoint returns 200 even if market data is stalled.

**File:** `backend/app/api.py` lines 33-35

**Impact:** Container orchestration (Docker, Kubernetes) can't detect that prices aren't updating. The app appears healthy but is non-functional.

**Do this instead:**

```python
@router.get("/health")
async def health(request: Request) -> dict:
    cache, source = market(request)
    tickers = source.get_tickers()
    if tickers and not cache.get_all():
        return {"status": "degraded", "reason": "No prices in cache"}
    recent_prices = [u for u in cache.get_all().values() 
                     if time.time() - u.timestamp < 60]
    if tickers and not recent_prices:
        return {"status": "unhealthy", "reason": "No recent price updates"}
    return {"status": "ok"}
```

---

### No Logging Configuration for Production

**Issue:** Logging is set to INFO level with basic console output only.

**File:** `backend/app/main.py` lines 20

**Impact:** No structured logs, no log rotation, no way to send logs to centralized service (ELK, CloudWatch, etc.).

**Do this instead:** Implement structured logging:

```python
import logging.config
logging.config.dictConfig({
    "version": 1,
    "formatters": {
        "json": {
            "()": "pythonjsonlogger.jsonlogger.JsonFormatter",
            "format": "%(asctime)s %(name)s %(levelname)s %(message)s",
        }
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "json"}
    },
    "root": {"level": "INFO", "handlers": ["console"]},
})
```

---

### No Metrics or Observability

**Issue:** No instrumentation for latency, error rates, cache hit ratios, or market data freshness.

**Impact:** Cannot diagnose performance issues or detect degradation.

**Do this instead:** Integrate Prometheus or equivalent:

```python
from prometheus_client import Counter, Histogram, generate_latest

trades_total = Counter("trades_total", "Total trades", ["side"])
trade_latency = Histogram("trade_latency_seconds", "Trade execution latency")
```

---

*Concerns audit: 2026-09-25*
