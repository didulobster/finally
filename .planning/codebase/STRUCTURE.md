---
last_mapped_commit: 7f7cd7c670c507ac353eb6fe89563c5b28f50406
last_mapped_at: 2026-09-25
---
# Codebase Structure

**Analysis Date:** 2026-09-25

## Directory Layout

```
finally/
├── backend/                          # FastAPI Python project (uv-managed)
│   ├── app/                          # Main application code
│   │   ├── main.py                   # FastAPI lifespan, app factory, middleware
│   │   ├── api.py                    # REST routes for portfolio, trades, watchlist, chat
│   │   ├── actions.py                # High-level operations (trade, watchlist changes)
│   │   ├── portfolio.py              # Trade execution, position tracking, P&L
│   │   ├── watchlist.py              # Watchlist persistence
│   │   ├── chat/                     # LLM chat assistant
│   │   │   ├── __init__.py           # Exports: get_history, handle_message
│   │   │   ├── service.py            # Chat flow orchestration
│   │   │   └── llm.py                # LiteLLM calls, structured output parsing
│   │   ├── market/                   # Market data abstraction + implementations
│   │   │   ├── __init__.py           # Exports: PriceCache, MarketDataSource, etc.
│   │   │   ├── interface.py          # Abstract MarketDataSource base class
│   │   │   ├── cache.py              # In-memory price store (thread-safe)
│   │   │   ├── models.py             # PriceUpdate dataclass
│   │   │   ├── factory.py            # Creates Simulator or Massive source based on env
│   │   │   ├── simulator.py          # GBM-based price simulator
│   │   │   ├── massive_client.py     # Polygon.io Massive API client
│   │   │   ├── seed_prices.py        # Default tickers, seed prices, GBM parameters
│   │   │   └── stream.py             # SSE endpoint for price streaming
│   │   ├── db/                       # Database layer
│   │   │   ├── __init__.py           # Exports: DEFAULT_USER, connect, init_db, etc.
│   │   │   ├── database.py           # SQLite connection, transactions, lazy init
│   │   │   └── schema.sql            # Table definitions (run once on init)
│   │   └── __init__.py               # Empty
│   ├── tests/                        # Unit tests (pytest)
│   │   ├── conftest.py               # Pytest fixtures
│   │   ├── test_portfolio.py         # Trade execution, P&L, validation
│   │   ├── test_api.py               # HTTP endpoint tests
│   │   ├── test_actions.py           # High-level operation tests
│   │   ├── chat/                     # Chat tests
│   │   │   └── test_chat.py
│   │   ├── db/                       # Database tests
│   │   │   └── test_database.py
│   │   ├── market/                   # Market data tests
│   │   │   └── (test files for simulator, cache, etc.)
│   │   └── __init__.py
│   ├── pyproject.toml                # uv project config, dependencies
│   ├── uv.lock                       # Lockfile (commit this)
│   ├── .python-version               # Python version (3.12)
│   ├── README.md                     # Backend-specific notes
│   └── market_data_demo.py           # Demo script for market data testing
│
├── test/                             # Playwright E2E tests
│   ├── e2e/                          # Test files
│   │   └── (Playwright test scripts)
│   ├── playwright.config.ts          # Playwright config
│   ├── package.json                  # Node dependencies for Playwright
│   ├── docker-compose.test.yml       # Spins up app + browser for E2E tests
│   └── README.md                     # E2E testing notes
│
├── scripts/                          # Start/stop helper scripts
│   ├── start_mac.sh                  # Build and run Docker container (macOS/Linux)
│   ├── stop_mac.sh                   # Stop and remove container (macOS/Linux)
│   ├── start_windows.ps1             # PowerShell equivalent
│   └── stop_windows.ps1
│
├── db/                               # Docker volume mount point (runtime)
│   ├── .gitkeep                      # Commit this; .db file is gitignored
│   └── finally.db                    # Created at runtime; persists across restarts
│
├── planning/                         # Project documentation (not built)
│   ├── PLAN.md                       # Full specification (this is the spec)
│   ├── MARKET_DATA_SUMMARY.md        # Market data subsystem details
│   └── archive/                      # Historical design docs
│
├── .planning/                        # GSD tooling directory
│   └── codebase/                     # This maps → generated architecture docs
│
├── .env                              # Env vars (gitignored; copy .env.example)
├── .env.example                      # Template for .env
├── Dockerfile                        # Multi-stage: Node (frontend) → Python (backend)
├── docker-compose.yml                # Optional convenience wrapper
├── .dockerignore
├── CLAUDE.md                         # Project instructions
├── README.md                         # Quick start and overview
└── .gitignore
```

## Directory Purposes

**`backend/`** — FastAPI application, self-contained with its own `pyproject.toml` and dependencies. Knows nothing about frontend implementation.

**`backend/app/`** — Application code. Entry point is `main.py`, which creates the FastAPI app. All modules (`portfolio`, `watchlist`, `chat`, `market`, `db`) are imported here.

**`backend/app/market/`** — Market data subsystem. Abstract `MarketDataSource` interface with pluggable implementations (Simulator, Massive). `PriceCache` is the shared in-memory store read by all consumers. SSE endpoint in `stream.py`.

**`backend/app/chat/`** — LLM integration. `service.py` orchestrates the full chat flow (build context, call LLM, execute actions, persist). `llm.py` wraps LiteLLM and parses structured JSON responses.

**`backend/app/db/`** — Database layer. `database.py` handles SQLite connection pooling, transaction management (`BEGIN IMMEDIATE`), and lazy schema initialization. `schema.sql` is the idempotent schema; run once on app startup.

**`backend/tests/`** — Pytest unit tests. Mirror the `app/` structure: `test_portfolio.py`, `test_market/`, `test_chat/`, etc. Fixtures in `conftest.py`.

**`test/`** — Playwright E2E tests, separate from unit tests. Uses `docker-compose.test.yml` to spin up the full app in a container and run browser tests against it.

**`scripts/`** — Idempotent Docker helper scripts. `start_mac.sh` builds/runs the container with volume mount and port forwarding. Can be run multiple times safely.

**`db/`** — Directory that persists the SQLite file across container restarts. `.gitkeep` ensures the directory exists; `finally.db` is generated at runtime and gitignored.

**`planning/`** — Project specification and design docs. `PLAN.md` is the authoritative spec; read by all agents. `MARKET_DATA_SUMMARY.md` details the market data subsystem.

## Key File Locations

**Entry Points:**

- `backend/app/main.py` — FastAPI app factory, lifespan, static file serving
- `backend/tests/conftest.py` — Pytest fixtures (database setup, etc.)

**Configuration:**

- `backend/pyproject.toml` — Python dependencies, uv config
- `Dockerfile` — Multi-stage build
- `.env` — Environment variables (OPENROUTER_API_KEY, MASSIVE_API_KEY, LLM_MOCK)
- `backend/.python-version` — Python 3.12

**Core Logic:**

- `backend/app/api.py` — All REST routes
- `backend/app/portfolio.py` — Trade execution and valuation
- `backend/app/market/simulator.py` — GBM price generation
- `backend/app/market/cache.py` — In-memory price store
- `backend/app/chat/service.py` — LLM orchestration
- `backend/app/db/database.py` — SQLite transactions

**Database Schema:**

- `backend/app/db/schema.sql` — CREATE TABLE statements (run on init)

**Testing:**

- `backend/tests/test_portfolio.py` — Portfolio and trade tests
- `backend/tests/test_api.py` — HTTP endpoint tests
- `test/e2e/` — Playwright E2E tests
- `test/docker-compose.test.yml` — E2E test infrastructure

## Naming Conventions

**Files:**

- `module_name.py` — lowercase, underscores (e.g., `portfolio.py`, `market_data.py`)
- Tests: `test_<what>.py` (e.g., `test_portfolio.py`)
- Endpoints: Grouped by domain in `api.py`

**Directories:**

- Packages (with `__init__.py`): lowercase, underscores (e.g., `backend/app/chat/`, `backend/app/market/`)
- Generated: underscore-separated (e.g., `.pytest_cache/`, `node_modules/`)

**Functions:**

- Async endpoints: Prefixed with `async def` (e.g., `async def trade()`)
- Business logic: `execute_trade()`, `get_portfolio()` (verb-noun)
- Helpers: `normalize_ticker()`, `tracked_tickers()` (verb or predicate)

**Classes:**

- Data models: `PriceUpdate`, `ChatResponse` (noun, PascalCase, suffix with type if needed)
- Abstract bases: `MarketDataSource` (Interface pattern)
- Implementations: `SimulatorDataSource`, `MassiveDataSource` (concrete + implementation name)
- Errors: `TradeError`, `NotOnWatchlist` (suffix with Error or exception type)

**Database:**

- Tables: `users_profile`, `positions`, `trades`, `watchlist`, `portfolio_snapshots`, `chat_messages` (snake_case, plural when multiple rows per user)
- Columns: `user_id`, `ticker`, `quantity`, `avg_cost`, `created_at` (snake_case, suffixes like `_at`, `_id`, `_count`)

**Environment Variables:**

- Uppercase with underscores: `OPENROUTER_API_KEY`, `MASSIVE_API_KEY`, `LLM_MOCK`, `DB_PATH`, `STATIC_DIR`

## Where to Add New Code

**New HTTP Endpoint:**

- Add route to `backend/app/api.py`
- Add Pydantic request model if needed
- Call business logic module (e.g., `portfolio`, `watchlist`, `actions`)
- Wrap in try/except to catch `ValueError` and return HTTP 400/404

**New Business Logic (e.g., portfolio operation):**

- Add function to `backend/app/portfolio.py` (if stateful) or `backend/app/actions.py` (if coordinated)
- Raise `TradeError` or `ValueError` for validation failures
- Call `portfolio.record_snapshot()` after state changes if portfolio value affected
- Write tests in `backend/tests/test_portfolio.py` or `backend/tests/test_actions.py`

**New Market Data Source (e.g., real-time WebSocket):**

- Create new class inheriting from `backend/app/market/interface.py:MarketDataSource`
- Implement `start()`, `stop()`, `add_ticker()`, `remove_ticker()`, `get_tickers()`
- Write prices to the shared `PriceCache` passed to `__init__()`
- Update factory in `backend/app/market/factory.py` to instantiate it based on env var
- Test in `backend/tests/market/test_<new_source>.py`

**New Database Table:**

- Add CREATE TABLE to `backend/app/db/schema.sql` (idempotent, use IF NOT EXISTS)
- Add DEFAULT_* or helper functions in `backend/app/db/database.py` if needed
- Add row factory to `backend/tests/conftest.py` if tests need it
- Write tests in `backend/tests/db/test_database.py`

**New Test:**

- Unit tests in `backend/tests/test_*.py` (mirrors app structure)
- E2E tests in `test/e2e/*.spec.ts` (Playwright, runs against live container)
- Use fixtures from `backend/tests/conftest.py` for database setup

**Chat Feature (e.g., new action type):**

- Add parsing to `backend/app/chat/llm.py` (extend `ChatResponse` Pydantic model if needed)
- Add execution logic to `backend/app/chat/service.py:execute_actions()`
- Update system prompt in `backend/app/chat/llm.py:SYSTEM_PROMPT`

## Special Directories

**`backend/.venv/`** — Virtual environment created by `uv sync`. Not committed.

**`backend/.pytest_cache/`** — Pytest cache. Not committed. Recreated on first test run.

**`db/`** — Volume mount point for SQLite file. `.gitkeep` committed; `finally.db` generated at runtime and gitignored.

**`.planning/codebase/`** — Generated by GSD mapping tools. ARCHITECTURE.md, STRUCTURE.md, etc. written directly by CI/CD or manual mapping.

**`test/node_modules/`, `test/test-results/`, `test/playwright-report/`** — Generated by Playwright. Not committed.

**`planning/archive/`** — Historical design docs, not built. Reference only.

---

*Structure analysis: 2026-09-25*
