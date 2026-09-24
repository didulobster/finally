<!-- GSD:project-start source:PROJECT.md -->

## Project

**FinAlly — AI Trading Workstation**

FinAlly (Finance Ally) is a single-container, Bloomberg-style trading workstation. It streams live (simulated or real) market data, lets the user trade a $10k virtual portfolio, and includes an AI chat copilot that analyzes positions and executes trades and watchlist changes on the user's behalf. It is the capstone project for an agentic AI coding course, built entirely by coding agents. The full spec is `planning/PLAN.md`.

**Core Value:** One `docker run` opens `http://localhost:8000` to a live, data-dense trading terminal. Prices stream, trades fill instantly, and the AI assistant can trade by natural language. The whole flow is proven by the E2E suite passing in Docker.

### Constraints

- **Tech stack**: FastAPI + uv (Python 3.12), Next.js TypeScript static export, Tailwind, SQLite, SSE — fixed by PLAN.md
- **Deployment**: single container, single port 8000; the frontend is served by FastAPI from the same origin (no CORS)
- **Charts**: canvas-based library preferred (Lightweight Charts or Recharts)
- **Visual**: dark theme (~`#0d1117`/`#1a1a2e`), accent `#ecad0a`, blue `#209dd7`, purple `#753991` for submit buttons
- **Code style**: simple, incremental, no overengineering, no defensive programming, latest APIs; `uv run`/`uv add` only
- **Testing**: E2E runs with `LLM_MOCK=true` via `test/docker-compose.test.yml`

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- Python 3.12 - Backend runtime, all server-side logic via FastAPI in `backend/` with uv project management

## Runtime & Package Management

- Python 3.12 (specified in `backend/.python-version`)
- uv (Python) - Fast, modern package manager with reproducible lockfile
- Node.js 24-slim - Frontend (deleted from working tree, referenced in Dockerfile Stage 1)
- npm - Frontend package manager
- Node.js - via Playwright in `test/package.json`

## Frameworks & Core Dependencies

### Backend (Python)

- FastAPI 0.141.1+ - REST API, SSE streaming, static file serving
- uvicorn[standard] 0.53.0+ - ASGI server, runs FastAPI on port 8000
- Pydantic 2.13.5+ - Data validation, structured output parsing for LLM responses
- python-dotenv 1.2.3+ - Loads `.env` variables
- NumPy 2.5.3+ - Used in market simulator for GBM calculations
- Massive 2.8.0+ - Polygon.io REST client for real market data
- LiteLLM 1.102.0+ - Unified LLM API, routes to OpenRouter (Cerebras backend)

### Frontend (Not Present in Current Tree)

- Next.js - Static export build (outputs to `out/` directory)
- Tailwind CSS - Utility-first CSS framework (noted in README.md)
- React Testing Library or similar (inferred from planning docs, not present in current tree)

### E2E Testing

- Playwright 1.63.0+ - Browser automation for end-to-end tests

## Build & Development Tools

- pytest 9.1.1+ - Unit test runner
- httpx 0.28.1+ - HTTP client for testing
- rich 15.0.0+ - Rich terminal output for logs/debugging
- python (via uv) - Script running with `uv run <script>`

## Configuration Files

- `backend/pyproject.toml` - Project metadata, dependencies, build config, pytest settings
- `backend/.python-version` - Python version constraint (3.12)
- `backend/uv.lock` - Reproducible dependency lock
- `.env` (gitignored) - Runtime environment variables
- `Dockerfile` - Multi-stage build (Node stage for frontend, Python stage for backend)
- `docker-compose.yml` - Simple single-service wrapper
- `scripts/start_mac.sh` - macOS/Linux start script with optional browser open
- `scripts/stop_mac.sh` - macOS/Linux stop script
- `scripts/start_windows.ps1` - Windows PowerShell equivalent
- `scripts/stop_windows.ps1` - Windows PowerShell stop script

## Database

- Path: `/app/db/finally.db` (volume-mounted at runtime, default `db/finally.db` in repo)
- Connection: Python `sqlite3` standard library
- Isolation: `BEGIN IMMEDIATE` transactions (serialized write lock)
- Row factory: `sqlite3.Row` (dict-like access)
- Lazy initialization: Schema created on first startup if missing
- Location: `backend/app/db/schema.sql`
- Tables: `users_profile`, `watchlist`, `positions`, `trades`, `portfolio_snapshots`, `chat_messages`
- Initialization: `backend/app/db/database.py` → `init_db()` function
- Seed data: Default user (id="default", cash=10000.0), 10 default tickers (AAPL, GOOGL, MSFT, AMZN, TSLA, NVDA, META, JPM, V, NFLX)

## Key Dependencies (By Purpose)

### Network & Async

- **aiohttp** 3.14.3+ - Async HTTP client (dependency of LiteLLM)
- **httpx** 0.28.1+ - Modern HTTP client (dev/testing)

### Data Processing

- **numpy** 2.5.3+ - Numerical arrays for market simulator GBM calculations
- **pydantic** 2.13.5+ - Data validation and JSON serialization

### Market Data

- **massive** 2.8.0+ - Polygon.io (Massive) REST API client

### AI/LLM

- **litellm** 1.102.0+ - LLM provider abstraction

### Infrastructure

- **fastapi** 0.141.1+ - Web framework, async-first
- **uvicorn[standard]** 0.53.0+ - ASGI server with uvloop/httptools for performance
- **python-dotenv** 1.2.3+ - Environment variable loading

### Testing & Development

- **pytest** 9.1.1+ - Test runner
- **pytest-asyncio** 1.4.0+ - Async test support
- **rich** 15.0.0+ - Terminal styling and rich output

## Platform Requirements

- Python 3.12+
- uv (Python package manager)
- Docker (for containerized development/deployment)
- Docker Compose (optional convenience wrapper)
- Docker runtime
- Single container on port 8000
- Persistent volume for SQLite database (volume-mounted)
- Environment variables: `OPENROUTER_API_KEY` (required), `MASSIVE_API_KEY` (optional)
- Docker-compatible platforms (Docker Desktop, Docker Swarm, Kubernetes, AWS App Runner, Render, etc.)
- Single port exposure: 8000
- Stateless API (state lives in SQLite volume)

## Build Artifacts

- Output directory: `frontend/out/` (static export from Next.js)
- Copied to: `backend/static/` in final Docker image
- Served by: FastAPI `SPAStaticFiles` middleware at `/`
- Wheel package: Built via hatchling (configured in `pyproject.toml`)
- Package location: `app/` module
- Final image: Based on `python:3.12-slim`
- Size: Optimized via multi-stage build (Node stage discarded, frontend files copied)
- Registry: Local or pushed to container registry (not configured in repo)

## Version Constraints

| Component | Version | Source |
|-----------|---------|--------|
| Python | >=3.12 | `backend/pyproject.toml` |
| FastAPI | >=0.141.1 | `backend/pyproject.toml` |
| uvicorn | >=0.53.0 | `backend/pyproject.toml` |
| Pydantic | >=2.13.5 | `backend/pyproject.toml` |
| LiteLLM | >=1.102.0 | `backend/pyproject.toml` |
| Massive | >=2.8.0 | `backend/pyproject.toml` |
| NumPy | >=2.5.3 | `backend/pyproject.toml` |
| pytest | >=9.1.1 | `backend/pyproject.toml` (dev group) |
| Node.js | 24-slim | Dockerfile Stage 1 |
| Playwright | ^1.63.0 | `test/package.json` |
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- Module files: lowercase with underscores (`portfolio.py`, `market_data.py`)
- Test files: `test_*.py` in backend, `*.spec.ts` in E2E tests
- Dataclasses and frozen models: descriptive names like `PriceUpdate`
- Helper modules: descriptive purpose-based names (`seed_prices.py`, `database.py`)
- Snake_case for all function names (`execute_trade()`, `record_snapshot()`, `get_portfolio()`)
- Private functions not prefixed with underscore — conventionally internal only
- Async functions use same naming convention as sync (`async def handle_message()`)
- Helper functions have descriptive names indicating purpose (`normalize_ticker()`, `percent_change()`)
- Snake_case for local variables and parameters
- UPPER_CASE for module-level constants (`DEFAULT_USER`, `SNAPSHOT_INTERVAL`, `EPSILON`)
- Single letters acceptable only in loops (`for r in rows`)
- Dataclass fields use snake_case (`previous_price`, `session_change_percent`)
- PascalCase for classes (`PriceUpdate`, `TradeError`, `SPAStaticFiles`)
- PascalCase for custom exceptions (`NotOnWatchlist`, `TradeError`)
- Exceptions inherit from appropriate base (`ValueError`, `ABC` for abstract classes)

## Code Style

- No explicit formatter configured (no `.prettierrc`, `.eslintrc`, `black.toml`)
- Python: Follow PEP 8 implicitly — 4-space indentation, clear readability
- TypeScript/JavaScript: Standard formatting in Playwright tests
- Line length: Implied ~100-120 characters (lines fit naturally in code)
- Imports organized in groups: standard library, third-party, relative imports
- No ESLint or Pylint configuration detected
- Code style enforced through clear, simple patterns rather than tooling

## Import Organization

- Relative imports only; no configured path aliases
- Use `.` for same package: `from . import portfolio`
- Use `..` for parent package: `from .. import actions`
- Import from Playwright test module: `import { expect, test } from "@playwright/test"`
- Import types separately when needed: `import type { Page, Locator } from "@playwright/test"`

## Error Handling

- Custom exceptions inherit from `ValueError` or appropriate base class, not generic `Exception`
- Exceptions include descriptive context: `f"Invalid side: {side!r}"` with repr for clarity
- No try/except for flow control; exceptions are for error conditions only
- Use `raise ... from e` to chain exceptions and preserve context: `raise TradeError(str(e)) from e`
- Finally blocks used for cleanup: `finally: conn.close()` or `finally: await source.stop()`
- `HTTPException(status_code, message)` from FastAPI
- 400 for validation failures and business logic violations
- 404 for resource not found (`NotOnWatchlist`)
- 422 for Pydantic validation errors (auto-generated)
- Error messages are plain text, included in HTTPException string
- Transactions wrapped in context manager with automatic rollback on error:

## Logging

- `logger.exception()` in exception handlers to capture full stack trace: `logger.exception("Portfolio snapshot failed")`
- Informal logging; no structured logging (JSON) configured
- Logs to stdout (console), no file rotation configured
- Exceptions that are caught and handled (not re-raised immediately)
- Background task failures (e.g., snapshot loop failures)
- Not for every function call or debug tracing

## Comments

- Explain "why" not "what" — code should be self-documenting on the "what"
- Document non-obvious invariants: `# BEGIN IMMEDIATE takes the write lock up front, so read-then-write logic...`
- Explain algorithm choices or performance tradeoffs
- Rarely used; clear naming and structure preferred
- Module-level docstring at top of file explaining module purpose
- Function docstrings (one line or multi-line) on functions
- Optional on trivial getters/setters
- Function docstrings in comments above function for clarity in TypeScript/JavaScript:

## Function Design

- Small, focused functions (typically 5-20 lines)
- Each function does one thing
- Examples: `normalize_ticker()` (5 lines), `execute_trade()` (25 lines), `get_portfolio()` (30 lines)
- Use positional arguments for required parameters
- Use default values for optional parameters
- Pydantic models for complex request payloads: `class TradeRequest(BaseModel)`
- Dataclass or dict for returns with multiple fields
- Explicit return type hints: `-> dict`, `-> list[dict]`, `-> str`
- Return dict for complex results (not custom classes unless shared across modules)
- Return `list[str]` for collections of strings
- Async functions return same types as sync equivalents

## Module Design

- No explicit `__all__` defined
- All non-private names are implicitly exported
- Imports at module level make public API clear: `from .db import connect, new_id, now`
- Not used; imports are specific to each module
- Example: `from .db import connect` (not `from .db import *`)
- Typically 50-100 lines per module
- Larger modules (150+ lines): `app/portfolio.py`, `app/api.py`, `app/chat/service.py`
- Split by responsibility: separate files for `db.py`, `portfolio.py`, `market/`, `chat/`
- `main.py`: FastAPI app creation, lifespan, background tasks
- `api.py`: REST route definitions
- `portfolio.py`: trade execution, portfolio queries
- `watchlist.py`: watchlist state management
- `actions.py`: orchestration of portfolio and watchlist actions
- `chat/`: Separate submodule with `service.py`, `llm.py`
- `market/`: Separate submodule with `interface.py`, `simulator.py`, `cache.py`, etc.
- `db/`: Separate submodule with `database.py` (connection, initialization)

## Type Hints

- All function signatures include parameter and return type hints
- Pydantic models for API requests: `class TradeRequest(BaseModel)`
- Generic types: `list[str]`, `dict[str, float]`
- Optional types: `dict | None` (Python 3.10+ union syntax)
- Never: `Any` — always specify concrete types

## Dataclasses and Models

- Define request models with validation: `class TradeRequest(BaseModel)`
- Use `Field()` for constraints: `Field(gt=0)`, `Field(min_length=1)`
- Use `Literal` for specific values: `side: Literal["buy", "sell"]`
- Used for price updates: `@dataclass(frozen=True, slots=True)`
- Slots for memory efficiency
- Computed properties via `@property` methods

## Code Organization in Functions

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **FastAPI App** | Application lifecycle, route registration, static file serving, background tasks | `backend/app/main.py` |
| **REST API Router** | HTTP endpoints for portfolio, trades, watchlist, chat, health | `backend/app/api.py` |
| **Market Data Abstraction** | Interface for pluggable market data sources (simulator or Massive API) | `backend/app/market/interface.py` |
| **Price Cache** | In-memory, thread-safe store of latest prices for all tracked tickers | `backend/app/market/cache.py` |
| **Market Simulator** | GBM-based price generation with correlated shocks | `backend/app/market/simulator.py` |
| **Massive Client** | REST polling from Polygon.io Massive API | `backend/app/market/massive_client.py` |
| **SSE Stream** | Server-Sent Events endpoint pushing price updates to browser | `backend/app/market/stream.py` |
| **Portfolio** | Trade execution, position tracking, valuation, P&L calculations | `backend/app/portfolio.py` |
| **Actions** | Coordinated high-level operations (trade, watchlist changes) | `backend/app/actions.py` |
| **Watchlist** | Ticker list persistence | `backend/app/watchlist.py` |
| **Chat Service** | LLM integration, message persistence, auto-execution of trades/watchlist changes | `backend/app/chat/service.py` |
| **LLM Handler** | Calls LiteLLM → OpenRouter with structured output parsing | `backend/app/chat/llm.py` |
| **Database** | SQLite connection pooling, schema initialization, transactions | `backend/app/db/database.py` |

## Pattern Overview

- **Abstraction-driven data sources** — Market data interface (`MarketDataSource`) allows swapping simulator and Massive API with zero impact on routing or portfolio logic
- **Shared in-memory cache** — `PriceCache` is the single source of truth for live prices, read by portfolio valuation, SSE stream, and chat
- **Atomic database transactions** — All writes use SQLite `BEGIN IMMEDIATE` to serialize portfolio state changes (e.g., trading depends on checking cash first)
- **Background tasks** — Market data polling and portfolio snapshots run async, independent from HTTP request handling
- **Stateless HTTP routes** — All state lives in the database or price cache; routes are pure functions of their inputs

## Layers

- Purpose: Accept client requests, validate input, coordinate calls to business logic, return JSON
- Location: `backend/app/api.py`, routes in `main.py`
- Contains: Pydantic request models, FastAPI `@router` endpoints
- Depends on: `portfolio`, `watchlist`, `actions`, `chat` (business logic); `PriceCache`, `MarketDataSource` (from app state)
- Used by: Browser client making REST calls and SSE connections
- Purpose: Provide live prices and manage the set of tracked tickers
- Location: `backend/app/market/`
- Contains: Abstract `MarketDataSource` interface; `SimulatorDataSource`, `MassiveDataSource` implementations; `PriceCache`, models
- Depends on: Nothing (self-contained)
- Used by: Portfolio calculations (to value positions), SSE streaming (to broadcast updates), chat (to execute trades at live prices), watchlist operations (to seed prices)
- Purpose: Execute trades, track positions, calculate P&L, record snapshots for charts
- Location: `backend/app/portfolio.py`, `backend/app/actions.py`
- Contains: Trade execution logic, position averaging, cash tracking
- Depends on: Database, `PriceCache`, `MarketDataSource` (for actions that update watchlist)
- Used by: HTTP routes, chat service (which calls `actions`)
- Purpose: Conversational interface that auto-executes portfolio and watchlist changes
- Location: `backend/app/chat/`
- Contains: `service.py` (orchestration), `llm.py` (LiteLLM integration and response parsing)
- Depends on: `portfolio`, `actions`, database, `PriceCache`, `MarketDataSource`
- Used by: `/api/chat` endpoint
- Purpose: Persistence of all user state
- Location: `backend/app/db/database.py`, schema in `backend/app/db/schema.sql`
- Contains: SQLite connection pooling, transaction management, schema initialization
- Depends on: Nothing (self-contained)
- Used by: All other layers
- Purpose: Serve the built Next.js frontend (if present) under `/`
- Location: `main.py` (SPAStaticFiles middleware), frontend files in `backend/static/`
- Contains: HTML, CSS, JS from Next.js static export
- Used by: Browser client

## Data Flow

### Primary Request Path (Buy or Sell Trade)

### SSE Price Stream (Server → Browser)

### Market Data Polling (Background)

### Portfolio Snapshot Recording (Background)

### Chat Message Flow

### Watchlist Change (Add/Remove)

- **Watchlist:** Database table
- **Positions:** Database table
- **Live prices:** In-memory `PriceCache`
- **Trade history:** Append-only `trades` table
- **Portfolio value over time:** `portfolio_snapshots` table
- **Chat history:** `chat_messages` table

## Key Abstractions

- Purpose: Represents any provider of live ticker prices
- Examples: `SimulatorDataSource` (`backend/app/market/simulator.py`), `MassiveDataSource` (`backend/app/market/massive_client.py`)
- Pattern: Abstract base class with async lifecycle (`start`, `stop`), ticker tracking (`add_ticker`, `remove_ticker`), and all implementations write to shared `PriceCache`
- Purpose: Thread-safe, versioned store of the latest price for each ticker
- Pattern: In-memory dict with lock, `version` counter used by SSE to detect changes
- Updates atomic; all downstream logic (portfolio valuation, SSE, chat) reads stale-ok
- Purpose: Encapsulate trade logic, position tracking, P&L calculation
- Pattern: Stateless functions; all state in database. Each trade: check cash/shares, update position, update cash, log trade, record snapshot

## Entry Points

- Location: `backend/app/main.py:57`
- Triggers: App startup (uvicorn command)
- Responsibilities: Initialize database, create market data source, start background tasks (market polling, snapshot recording)
- Location: `backend/app/api.py`
- Triggers: Client HTTP request
- Responsibilities: Validate input, call business logic, return JSON response
- Location: `backend/app/market/stream.py:17`
- Triggers: `new EventSource('/api/stream/prices')`
- Responsibilities: Push price updates every 500ms
- Location: `backend/app/api.py:96`
- Triggers: Client POST with message
- Responsibilities: Call LLM, execute actions, persist conversation

## Architectural Constraints

- **Single-user only:** `user_id` defaults to `"default"` everywhere; no multi-user logic
- **Simulated trading:** Market orders only, instant fills, no order book or confirmation dialogs
- **In-process market data:** No separate market service; polling runs in the FastAPI event loop
- **SQLite concurrency:** Uses `BEGIN IMMEDIATE` for mutual exclusion; not suitable for high-volume concurrent writes
- **No streaming JSON:** Chat responses returned as complete JSON, not token-by-token (Cerebras inference fast enough)
- **Frontend static export:** Next.js built as `output: 'export'`; no dynamic SSR
- **Single origin:** All `/api/*` routes on same port as static files — no CORS needed

## Anti-Patterns

### Bypassing the PriceCache

### Uncoordinated Watchlist and Position Tracking

### Database Transactions Without Serialization

### Hardcoded Ticker Lists

## Error Handling

- Trade validation: Raise `portfolio.TradeError` if cash/shares insufficient (`backend/app/portfolio.py:9`)
- Ticker validation: `actions.normalize_ticker()` raises `ValueError` if not 1–5 letters (`backend/app/actions.py:16`)
- Watchlist operations: Raise `actions.NotOnWatchlist` if ticker not on list (`backend/app/actions.py:12`)
- LLM response parsing: `parse_response()` catches Pydantic `ValidationError`, returns fallback reply (`backend/app/chat/llm.py:57`)
- Background tasks: Exception logged, loop continues (`backend/app/main.py:49`)

## Cross-Cutting Concerns

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| cerebras | Use this to write code to call an LLM using LiteLLM and OpenRouter with the Cerebras inference provider | `.claude/skills/cerebras/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
