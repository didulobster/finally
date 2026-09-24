---
last_mapped_commit: 7f7cd7c670c507ac353eb6fe89563c5b28f50406
last_mapped_at: 2026-09-25
---
<!-- refreshed: 2026-09-25 -->

# Architecture

**Analysis Date:** 2026-09-25

## System Overview

FinAlly is a single-container FastAPI application that streams live market data, executes trades on a simulated portfolio, and integrates an LLM chat assistant. All components live in one Docker container on port 8000.

```text
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Application                      │
│                   `backend/app/main.py`                      │
├──────────────────┬──────────────────┬───────────────────────┤
│   REST API       │  SSE Stream      │  Static Frontend      │
│ `api.py`         │ `market/stream`  │   (SPA export)        │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                     │
    ┌────▼─────────────┬───▼──────────────┬─────▼──────────┐
    │                  │                  │                │
    │  Portfolio       │  Market Data     │  Chat/LLM      │
    │  `portfolio.py`  │  `market/`       │  `chat/`       │
    │  `actions.py`    │  (abstraction)   │  `service.py`  │
    │  `watchlist.py`  │  `cache.py`      │  `llm.py`      │
    │                  │                  │                │
    └────┬─────────────┴────┬─────────────┴────┬───────────┘
         │                  │                  │
         ▼                  ▼                  ▼
    ┌──────────────────────────────────────────────────┐
    │          SQLite Database                         │
    │          `db/finally.db`                         │
    │    (users, positions, trades, watchlist,         │
    │     portfolio_snapshots, chat_messages)          │
    └──────────────────────────────────────────────────┘
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

**Overall:** Layered service architecture with a clear separation between HTTP routing, business logic, and persistence.

**Key Characteristics:**

- **Abstraction-driven data sources** — Market data interface (`MarketDataSource`) allows swapping simulator and Massive API with zero impact on routing or portfolio logic
- **Shared in-memory cache** — `PriceCache` is the single source of truth for live prices, read by portfolio valuation, SSE stream, and chat
- **Atomic database transactions** — All writes use SQLite `BEGIN IMMEDIATE` to serialize portfolio state changes (e.g., trading depends on checking cash first)
- **Background tasks** — Market data polling and portfolio snapshots run async, independent from HTTP request handling
- **Stateless HTTP routes** — All state lives in the database or price cache; routes are pure functions of their inputs

## Layers

**HTTP/API Layer:**

- Purpose: Accept client requests, validate input, coordinate calls to business logic, return JSON
- Location: `backend/app/api.py`, routes in `main.py`
- Contains: Pydantic request models, FastAPI `@router` endpoints
- Depends on: `portfolio`, `watchlist`, `actions`, `chat` (business logic); `PriceCache`, `MarketDataSource` (from app state)
- Used by: Browser client making REST calls and SSE connections

**Market Data Layer:**

- Purpose: Provide live prices and manage the set of tracked tickers
- Location: `backend/app/market/`
- Contains: Abstract `MarketDataSource` interface; `SimulatorDataSource`, `MassiveDataSource` implementations; `PriceCache`, models
- Depends on: Nothing (self-contained)
- Used by: Portfolio calculations (to value positions), SSE streaming (to broadcast updates), chat (to execute trades at live prices), watchlist operations (to seed prices)

**Portfolio/Trading Layer:**

- Purpose: Execute trades, track positions, calculate P&L, record snapshots for charts
- Location: `backend/app/portfolio.py`, `backend/app/actions.py`
- Contains: Trade execution logic, position averaging, cash tracking
- Depends on: Database, `PriceCache`, `MarketDataSource` (for actions that update watchlist)
- Used by: HTTP routes, chat service (which calls `actions`)

**Chat/LLM Layer:**

- Purpose: Conversational interface that auto-executes portfolio and watchlist changes
- Location: `backend/app/chat/`
- Contains: `service.py` (orchestration), `llm.py` (LiteLLM integration and response parsing)
- Depends on: `portfolio`, `actions`, database, `PriceCache`, `MarketDataSource`
- Used by: `/api/chat` endpoint

**Database Layer:**

- Purpose: Persistence of all user state
- Location: `backend/app/db/database.py`, schema in `backend/app/db/schema.sql`
- Contains: SQLite connection pooling, transaction management, schema initialization
- Depends on: Nothing (self-contained)
- Used by: All other layers

**Static File Serving:**

- Purpose: Serve the built Next.js frontend (if present) under `/`
- Location: `main.py` (SPAStaticFiles middleware), frontend files in `backend/static/`
- Contains: HTML, CSS, JS from Next.js static export
- Used by: Browser client

## Data Flow

### Primary Request Path (Buy or Sell Trade)

1. **HTTP POST /api/portfolio/trade** — Client sends `{ticker, quantity, side}` (`api.py:44`)
2. **Route handler** calls `actions.trade()` (`api.py:48`)
3. **actions.trade()** normalizes ticker, ensures price cache is seeded, executes trade at live price (`actions.py:33`)
4. **portfolio.execute_trade()** acquires database lock, checks cash/shares, updates positions and cash (`portfolio.py:13`)
5. **portfolio.record_snapshot()** captures current portfolio value for the P&L chart (`portfolio.py:102`)
6. **Response** returns updated portfolio state (`api.py:51`)

**Price source:** `cache.get_price(ticker)` reads from in-memory `PriceCache`, seeded by market data polling loop

### SSE Price Stream (Server → Browser)

1. Browser connects to `GET /api/stream/prices` (`market/stream.py:17`)
2. **price_events()** polls `cache.get_all()` every 500ms, yields JSON of all tickers (`market/stream.py:28`)
3. Browser's `EventSource` receives and renders price updates, triggering flash animations
4. Cache version increments on every price update; SSE only yields when version changes (dedup)

**Concurrency:** `PriceCache` uses thread-locking; SSE reader is async and non-blocking

### Market Data Polling (Background)

1. **main.py lifespan** creates `MarketDataSource` via factory (`main.py:55`)
2. Factory selects `SimulatorDataSource` (default) or `MassiveDataSource` based on `MASSIVE_API_KEY` env var
3. Source starts background task via `await source.start(tickers)` (`main.py:62`)
4. **Simulator:** Steps GBM forward every 500ms, writes prices to cache
5. **Massive:** Polls API every 15s (configurable), parses REST response, writes prices to cache
6. Both implementations write to the same `PriceCache` — downstream code is agnostic

### Portfolio Snapshot Recording (Background)

1. **Every 30 seconds**, `snapshot_loop()` calls `portfolio.record_snapshot(cache)` (`main.py:43`)
2. Snapshot reads live portfolio value and inserts into `portfolio_snapshots` table
3. **Also recorded immediately after each trade** (`actions.py:48`) — ensures P&L chart shows trade entry/exit points
4. Frontend queries `/api/portfolio/history` to render the P&L line chart

### Chat Message Flow

1. **HTTP POST /api/chat** — Client sends `{message}` (`api.py:96`)
2. **handle_message()** builds LLM prompt: system + portfolio context + history + user message (`chat/service.py:62`)
3. **ask_llm()** calls LiteLLM → OpenRouter → Cerebras inference, returns structured `ChatResponse` (`chat/llm.py`)
4. **execute_actions()** runs each trade/watchlist change in sequence; collects results and errors (`chat/service.py:45`)
5. **Message + actions persisted** to `chat_messages` table (`chat/service.py:71`)
6. **Response** returns conversational text + executed trades/changes + error messages (`chat/service.py:72`)

**Auto-execution:** Trades specified by the LLM run immediately with no user confirmation

### Watchlist Change (Add/Remove)

1. **HTTP POST /api/watchlist** or **DELETE /api/watchlist/{ticker}** (`api.py:69, 79`)
2. **actions.add_to_watchlist()** or **actions.remove_from_watchlist()** (`actions.py:52, 59`)
3. Ticker added to `watchlist` table
4. Market data source updates its tracking set via `source.add_ticker()` or `source.remove_ticker()`
5. If ticker has an open position, it stays tracked even if removed from watchlist
6. `tracked_tickers()` = `watchlist ∪ held_tickers()` (`actions.py:24`)

**State Management:**

- **Watchlist:** Database table
- **Positions:** Database table
- **Live prices:** In-memory `PriceCache`
- **Trade history:** Append-only `trades` table
- **Portfolio value over time:** `portfolio_snapshots` table
- **Chat history:** `chat_messages` table

## Key Abstractions

**MarketDataSource (Abstract):**

- Purpose: Represents any provider of live ticker prices
- Examples: `SimulatorDataSource` (`backend/app/market/simulator.py`), `MassiveDataSource` (`backend/app/market/massive_client.py`)
- Pattern: Abstract base class with async lifecycle (`start`, `stop`), ticker tracking (`add_ticker`, `remove_ticker`), and all implementations write to shared `PriceCache`

**PriceCache:**

- Purpose: Thread-safe, versioned store of the latest price for each ticker
- Pattern: In-memory dict with lock, `version` counter used by SSE to detect changes
- Updates atomic; all downstream logic (portfolio valuation, SSE, chat) reads stale-ok

**Portfolio Operations:**

- Purpose: Encapsulate trade logic, position tracking, P&L calculation
- Pattern: Stateless functions; all state in database. Each trade: check cash/shares, update position, update cash, log trade, record snapshot

## Entry Points

**FastAPI Lifespan:**

- Location: `backend/app/main.py:57`
- Triggers: App startup (uvicorn command)
- Responsibilities: Initialize database, create market data source, start background tasks (market polling, snapshot recording)

**HTTP Routes:**

- Location: `backend/app/api.py`
- Triggers: Client HTTP request
- Responsibilities: Validate input, call business logic, return JSON response

**Browser SSE Connection:**

- Location: `backend/app/market/stream.py:17`
- Triggers: `new EventSource('/api/stream/prices')`
- Responsibilities: Push price updates every 500ms

**LLM Chat:**

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

**What happens:** Code calls the market data source directly for prices instead of reading from `cache.get_price()`

**Why it's wrong:** Breaks SSE synchronization; different clients see different prices; no single source of truth

**Do this instead:** Always read prices from `PriceCache`. Market data sources write to the cache, not returned directly. See `portfolio.get_portfolio()` for the pattern (`backend/app/portfolio.py:78`).

### Uncoordinated Watchlist and Position Tracking

**What happens:** Ticker removed from watchlist without checking if user holds a position

**Why it's wrong:** User's position becomes orphaned and prices stop updating

**Do this instead:** Use `actions.remove_from_watchlist()` which calls `untrack_if_unused()` to keep positions in the tracking set (`backend/app/actions.py:59`).

### Database Transactions Without Serialization

**What happens:** Read-then-write trades (check cash, then debit) race with other writers

**Why it's wrong:** Leads to overdrafts or negative share counts

**Do this instead:** All portfolio writes use `connect()` context manager with `BEGIN IMMEDIATE`, not plain SQLite connections (`backend/app/db/database.py:30`).

### Hardcoded Ticker Lists

**What happens:** Seed prices or parameters scattered across files instead of centralized

**Why it's wrong:** Inconsistent state; simulator and tests use different defaults

**Do this instead:** All seed data and defaults in `backend/app/market/seed_prices.py` and `backend/app/db/database.py` (`DEFAULT_WATCHLIST`, `SEED_PRICES`, `TICKER_PARAMS`).

## Error Handling

**Strategy:** Validation at routes, business logic raises `ValueError` subclasses, caught by HTTP handlers and returned as 400/404

**Patterns:**

- Trade validation: Raise `portfolio.TradeError` if cash/shares insufficient (`backend/app/portfolio.py:9`)
- Ticker validation: `actions.normalize_ticker()` raises `ValueError` if not 1–5 letters (`backend/app/actions.py:16`)
- Watchlist operations: Raise `actions.NotOnWatchlist` if ticker not on list (`backend/app/actions.py:12`)
- LLM response parsing: `parse_response()` catches Pydantic `ValidationError`, returns fallback reply (`backend/app/chat/llm.py:57`)
- Background tasks: Exception logged, loop continues (`backend/app/main.py:49`)

## Cross-Cutting Concerns

**Logging:** Simple `logging` module via `getLogger(__name__)`. Background tasks log exceptions; no structured logging.

**Validation:** Pydantic models in API routes; custom `normalize_ticker()` for symbols; database triggers enforce data integrity (UNIQUE constraints).

**Authentication:** None — single-user demo; `user_id` hardcoded to `"default"` everywhere.

**Concurrency:** Database serialized via `BEGIN IMMEDIATE`; `PriceCache` uses lock; SSE reader async and non-blocking; background tasks in event loop.

---

*Architecture analysis: 2026-09-25*
