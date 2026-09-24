---
last_mapped_commit: 7f7cd7c670c507ac353eb6fe89563c5b28f50406
last_mapped_at: 2026-09-25
---
# External Integrations

**Analysis Date:** 2026-09-25

## APIs & External Services

### LLM / AI Services

**OpenRouter (Cerebras Backend):**

- Service: LLM inference via OpenRouter aggregator
- Provider: Cerebras (for this model)
- Model: `openrouter/openai/gpt-oss-120b` (open-source model on Cerebras hardware)
- SDK/Client: LiteLLM 1.102.0+
- Integration: `backend/app/chat/llm.py` → `ask_llm()` function
- Auth: Environment variable `OPENROUTER_API_KEY` (required)
- Protocol: OpenAI-compatible API via LiteLLM
- Features:
  - Structured outputs using Pydantic models (TradeInstruction, WatchlistChange, ChatResponse)
  - Reasoning effort parameter: `reasoning_effort="low"`
  - Provider hint: `extra_body={"provider": {"order": ["cerebras"]}}`
- Request Format:
  - System prompt: Instructs model to act as "FinAlly" trading assistant
  - Context: Serialized portfolio state (cash, positions, watchlist, prices)
  - History: Recent chat message history from database
  - User message: Latest query
- Response Format:
  ```json
  {
    "message": "conversational response",
    "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 10}],
    "watchlist_changes": [{"ticker": "PYPL", "action": "add"}]
  }
  ```
- Async: Runs in thread pool via `asyncio.to_thread()`
- Fallback: If call fails, returns error message with empty trades/watchlist changes
- Mock Mode: `LLM_MOCK=true` returns deterministic responses for testing without API

### Market Data Services

**Massive (Polygon.io REST API):**

- Service: Real-time stock market data (optional, requires paid API key)
- Provider: Massive (Polygon.io)
- API Endpoint: Snapshot market endpoint (REST, not WebSocket)
- SDK/Client: `massive>=2.8.0` Python package
- Integration: `backend/app/market/massive_client.py`
- Auth: Environment variable `MASSIVE_API_KEY` (optional)
- Activation: Only used if `MASSIVE_API_KEY` is set and non-empty; otherwise simulator is used
- Market: Stocks (US equities)
- Poll Interval: 15 seconds (configurable, default in `MassiveDataSource.__init__`)
- API Call:
  - Method: `RESTClient.get_snapshot_all(SnapshotMarketType.STOCKS, tickers=[...])`
  - Returns: List of TickerSnapshot objects with last trade, minute, day, and prev_day OHLC
  - Price Selection: Tries last_trade.price first, falls back to minute/day close, then prev_day close
- Concurrency: Polls run in background async task
- Error Handling: Logs exceptions; failed polls are skipped gracefully
- Factory: `backend/app/market/factory.py` → `create_market_data_source()` selects this source if key is present

**Built-in Market Simulator:**

- Location: `backend/app/market/simulator.py`
- Algorithm: Geometric Brownian Motion (GBM) for realistic price movement
- Default: Used when `MASSIVE_API_KEY` is absent or empty
- Update Frequency: ~500ms intervals
- Features:
  - Configurable drift and volatility per ticker
  - Correlated moves across tickers (tech stocks move together, etc.)
  - Occasional random "events" (2-5% sudden moves for drama)
  - Realistic seed prices (e.g., AAPL ~$190, GOOGL ~$175)
- Tickers: Tracks watchlist dynamically, adds/removes with watchlist changes
- Runs as: In-process background async task started on app lifespan

## Data Storage

### Databases

**SQLite (File-based):**

- Provider: Built-in (Python standard library `sqlite3`)
- Database File: `/app/db/finally.db` (default), overridable via `DB_PATH` environment variable
- Connection: `sqlite3.connect(db_path())`
- Isolation Level: Serialized transactions via `BEGIN IMMEDIATE` (prevents dirty reads/writes)
- Row Format: Dictionary-like via `sqlite3.Row` factory
- Schema Location: `backend/app/db/schema.sql`
- Initialization: Lazy on first request (app startup) via `backend/app/db/database.py` → `init_db()`
- Seed Data:
  - Default user: `id="default"`, `cash_balance=10000.0`
  - Default watchlist: 10 tickers (AAPL, GOOGL, MSFT, AMZN, TSLA, NVDA, META, JPM, V, NFLX)

### File Storage

**Local Filesystem:**

- Static Frontend: `backend/static/` (Next.js build output, mounted at `/app/backend/static` in container)
  - Served by: FastAPI `SPAStaticFiles` middleware
  - Route: `/` (SPA fallback to `index.html` for non-API paths)
- Database: `/app/db/finally.db` (volume-mounted `finally-data:/app/db` in Docker)
- Application Code: `/app/backend/` (copied into container)

**No Object Storage:** File storage is local filesystem only (no S3, Azure Blob Storage, etc.)

### Caching

**In-Memory Price Cache:**

- Location: `backend/app/market/cache.py` → `PriceCache` class
- Storage: Python dictionary (non-persistent)
- Contents: Latest price, previous price, timestamp per ticker
- Updates: Populated by market data source (simulator or Massive client)
- Access: Read by SSE stream router and portfolio valuation logic
- Thread-Safety: Implementation uses `asyncio.Lock` for concurrent updates
- No external cache service (Redis, Memcached, etc.)

**No Session/Cache Persistence:** Cache is volatile; cleared on app restart

## Authentication & Identity

**Auth Provider:**

- Custom hardcoded single-user model
- User ID: Hardcoded `"default"` throughout codebase
- No login/signup: Implicit authentication (single-user trading workstation)
- Database schema includes `user_id` column (defaulting to `"default"`) for future multi-user support
- Authorization: None (single-user scenario)

**API Key Authentication:**

- LLM API Key: `OPENROUTER_API_KEY` (passed to LiteLLM → OpenRouter)
- Market Data API Key: `MASSIVE_API_KEY` (passed to Massive Python SDK)
- Keys loaded via `python-dotenv` from `.env` file (or Docker `--env-file`)
- No token validation logic in application; keys are trusted

## Monitoring & Observability

### Error Tracking

**No External Service:** No error tracking integration (Sentry, Rollbar, etc.)

**Local Logging:**

- Logger: Python standard `logging` module
- Level: INFO
- Setup: `logging.basicConfig(level=logging.INFO)` in `backend/app/main.py`
- Module Loggers: Per-module `logger = logging.getLogger(__name__)` in each file
- Log Destinations: Stdout/stderr (captured by Docker container logs)
- Exception Logging: `logger.exception()` used in error handlers (logs stack trace)

**Examples:**

- Market data polling failures logged in `backend/app/market/massive_client.py` → `_poll_once()`
- LLM call failures logged in `backend/app/chat/llm.py` → `ask_llm()`
- Portfolio snapshot failures logged in `backend/app/main.py` → `snapshot_loop()`

### Logs

**Output Format:** Standard Python logging (timestamp, level, module, message)
**Transport:** Container stdout/stderr (Docker collects and stores)
**Retention:** Depends on Docker logging driver (default: local file on host)
**No Centralized Logging:** No ELK stack, Datadog, CloudWatch, etc.

## CI/CD & Deployment

### Hosting

**Container Platform:**

- Docker containerization (single container, single port)
- Tested on: Docker Desktop, presumed compatible with Docker Swarm, Kubernetes, AWS App Runner, Render

**Port & Network:**

- Single port: 8000
- Protocol: HTTP (no HTTPS termination in app; expected to be reverse-proxied in production)
- Health check: `GET http://localhost:8000/api/health` (returns 200 OK if running)

### CI Pipeline

**No CI/CD Service Configured:** No GitHub Actions, GitLab CI, Jenkins, etc.

**Manual Build & Test:**

- Local development: `uv sync`, `uv run pytest`, `uv run uvicorn app.main:app`
- Docker build: `docker build .` or `docker compose up --build`
- E2E tests: `cd test && npm test` (Playwright, requires running app)

**Deployment Method:**

- Manual: Build image, push to registry, run container
- Alternative: `docker compose up` for local development
- Scripts: `scripts/start_mac.sh`, `scripts/stop_mac.sh` (bash) or PowerShell equivalents for Windows

## Webhooks & Callbacks

**Incoming Webhooks:** None

**Outgoing Webhooks:** None

**Event Streaming:**

- SSE (Server-Sent Events) outbound only
- Endpoint: `GET /api/stream/prices`
- Direction: Server → Client (prices pushed to browser)
- No bidirectional communication (no WebSockets)

## Environment Configuration

### Required Environment Variables

| Variable | Purpose | Example | Source |
|----------|---------|---------|--------|
| `OPENROUTER_API_KEY` | LLM API authentication | `sk-...` (OpenRouter key) | Required; must be in `.env` |

### Optional Environment Variables

| Variable | Purpose | Example | Default |
|----------|---------|---------|---------|
| `MASSIVE_API_KEY` | Market data API authentication | `pk_...` (Polygon.io key) | Empty; if absent, simulator used |
| `LLM_MOCK` | Deterministic mock LLM (testing) | `true` or `false` | `false` (use real OpenRouter) |
| `DB_PATH` | SQLite database file path | `/app/db/finally.db` | `<repo>/db/finally.db` |
| `STATIC_DIR` | Frontend static files directory | `/app/backend/static` | `backend/static/` |

### Environment File Locations

- **Development:** `.env` (gitignored, example at `.env.example`)
- **Docker:** Passed via `--env-file .env` flag or `env_file: .env` in compose
- **Loading:** Python `dotenv.load_dotenv()` in `backend/app/main.py` (reads `Path(__file__).parents[2] / ".env"`)

### Secrets Management

**Current Approach:**

- Secrets stored in `.env` file (local development only)
- Never committed to git (`.env` in `.gitignore`)
- Docker: Passed via `--env-file` flag at runtime

**Production Considerations:**

- Should use container platform secrets management (Docker Secrets, Kubernetes Secrets, AWS Secrets Manager, etc.)
- `.env` approach is dev-only; not suitable for production

## Data Flow & Integration Points

### Price Update Flow

```
Market Data Source (Simulator or Massive Client)
    ↓ (every 15s for Massive, ~500ms for Simulator)
Price Cache (in-memory dictionary)
    ↓ (push on cadence)
SSE Stream Endpoint (/api/stream/prices)
    ↓
Browser (EventSource API)
    ↓
Frontend UI (price flash animation, sparkline accumulation)
```

### Trade Execution Flow

```
User (manual trade or AI chat)
    ↓
POST /api/portfolio/trade or Auto-exec from LLM
    ↓
Backend (portfolio.py → execute_trade)
    ↓ (1. Check cash/shares, 2. Update position, 3. Record trade, 4. Record snapshot)
SQLite Database
    ↓
Response to client
```

### Chat / LLM Integration Flow

```
User Message
    ↓
POST /api/chat
    ↓
Backend (chat/service.py)
    ↓ (Load context: portfolio state, history, prices from cache)
Build Messages (system prompt + context + history + user msg)
    ↓
LiteLLM → OpenRouter (Cerebras backend)
    ↓
Structured JSON response (message + trades + watchlist_changes)
    ↓ (Auto-execute trades & watchlist changes via actions.py)
SQLite Database (save chat message, executed actions)
    ↓
Response to client
```

## Third-Party Libraries (Dependency Tree Highlights)

**Web Framework:**

- fastapi → starlette, pydantic, anyio, httpx (dependencies)

**Async HTTP:**

- aiohttp → multidict, yarl, frozenlist, async helpers

**Data Validation:**

- pydantic → pydantic_core, annotated_types, typing-extensions

**LLM:**

- litellm → aiohttp, requests, openai, anthropic, httpx (providers)

**Market Data:**

- massive → requests, pytz, msgspec (serialization)

**NumPy:**

- numpy (no external dependencies, compiled native code)

---

*Integration audit: 2026-09-25*
