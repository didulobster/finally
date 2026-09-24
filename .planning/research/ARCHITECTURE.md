# Architecture Research

**Domain:** Frontend integration for an existing FastAPI + SSE trading backend (Next.js static-export SPA)
**Researched:** 2026-09-25
**Confidence:** HIGH (based on direct reading of `backend/app/*`, `Dockerfile`, `docker-compose*.yml`, `test/e2e/*`, `.planning/codebase/ARCHITECTURE.md` — not general ecosystem speculation)

## Standard Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│ Docker container, port 8000 — uvicorn app.main:app                 │
│                                                                      │
│  FastAPI                                                            │
│  ├── /api/*            REST (portfolio, watchlist, chat, health)   │
│  ├── /api/stream/prices  SSE (one JSON payload per tick, all       │
│  │                        tracked tickers, throttled by cache      │
│  │                        version, ~500ms cadence)                 │
│  └── /*  SPAStaticFiles → backend/static/  (Next.js `out/` export) │
│           unknown, no-extension paths fall back to index.html      │
├────────────────────────────────────────────────────────────────────┤
│                         Browser (single page)                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ PriceStream (1 EventSource singleton)                       │    │
│  │  → connectionStatus (connected/reconnecting/disconnected)   │    │
│  │  → latestPrices: Record<ticker, {price, prevPrice, ts}>     │    │
│  │  → priceHistory: Record<ticker, Point[]>  (client-buffered, │    │
│  │      capped, since page load — feeds sparklines + main chart)│   │
│  └───────────────┬──────────────────────────┬──────────────────┘    │
│                  │ read                      │ read                 │
│  ┌───────────────▼───────┐   ┌───────────────▼──────────────────┐   │
│  │ Watchlist panel        │   │ Main chart (selected ticker)     │   │
│  │ Header (conn dot)      │   │                                   │   │
│  └────────────────────────┘   └───────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ PortfolioStore (REST-backed: cash, positions[qty,avg_cost], │    │
│  │  watchlist tickers) — fetched on mount, refetched/patched   │    │
│  │  after trade / watchlist / chat actions                     │    │
│  └───────────────┬──────────────────────────┬──────────────────┘    │
│                  │                           │                       │
│  ┌───────────────▼───────┐   ┌───────────────▼──────────────────┐   │
│  │ Positions table        │   │ Heatmap + P&L chart               │   │
│  │ Trade bar               │   │ (P&L chart from GET history)      │   │
│  └────────────────────────┘   └───────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ Chat panel — POST /api/chat, GET /api/chat on mount          │    │
│  │  on response with trades/watchlist_changes: refetch          │    │
│  │  PortfolioStore (chat response does NOT embed portfolio)     │    │
│  └────────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|-------------------------|
| `PriceStream` provider | Owns the single `EventSource`, exposes live prices + connection status + per-ticker history buffer to the whole tree | React context + `useSyncExternalStore` or a small custom hook wrapping one `EventSource` instance created once at app root |
| `PortfolioStore` provider | Owns cash/positions/watchlist as fetched from REST; exposes refetch + optimistic local mutators | React context with `fetch` calls; no client-side cache library needed at this scale |
| Watchlist panel | Renders one row per watchlist ticker, reads price + sparkline from `PriceStream`, add/remove via REST | Table/grid component, one row component per ticker |
| Main chart | Renders the selected ticker's accumulated price history (same buffer as sparklines, just the full series) | Canvas chart component (Lightweight Charts or Recharts) |
| Positions table | Renders `PortfolioStore.positions`, computing live P&L from `PriceStream` prices rather than the REST snapshot | Table component |
| Heatmap | Treemap of positions sized by weight, colored by live P&L | Canvas/SVG treemap (Recharts `Treemap` is sufficient) |
| P&L chart | Line chart of `GET /api/portfolio/history` — server-recorded snapshots, not client-buffered | Canvas chart component |
| Trade bar | Ticker/quantity inputs, buy/sell buttons, calls `POST /api/portfolio/trade`, applies the response's embedded `portfolio` directly (no refetch needed) | Simple form component |
| Chat panel | Message list, input, loading state; on response, appends message + inline action confirmations, and triggers a `PortfolioStore`/watchlist refetch if actions were executed | Form + scrolling list, `GET /api/chat` on mount for history |
| Header | Total value (`cash + Σ(qty × live price)`, computed client-side, not polled), cash balance, connection dot | Reads both providers |

## Recommended Project Structure

```
frontend/
├── package.json / package-lock.json     # committed — Dockerfile runs `npm ci`
├── next.config.ts                       # output: 'export'
├── tailwind.config.ts                   # dark theme, accent colors from PLAN.md
├── app/
│   ├── layout.tsx                       # single root layout, no other routes
│   ├── page.tsx                         # the one page: composes all panels
│   └── globals.css                      # Tailwind base + flash animation keyframes
├── components/
│   ├── Header.tsx
│   ├── ConnectionStatus.tsx             # data-testid="connection-status", data-status attr
│   ├── watchlist/
│   │   ├── WatchlistPanel.tsx
│   │   ├── WatchlistRow.tsx             # data-testid=`watchlist-row-${ticker}`, data-selected
│   │   └── Sparkline.tsx
│   ├── chart/
│   │   └── MainChart.tsx                # data-testid="main-chart"/"price-chart"/"chart-price"
│   ├── portfolio/
│   │   ├── PositionsTable.tsx           # data-testid=`position-row-${ticker}` etc.
│   │   ├── Heatmap.tsx                  # data-testid="heatmap", `heatmap-cell-${ticker}`, data-pnl
│   │   └── PnlChart.tsx                 # data-testid="pnl-chart", data-points
│   ├── trade/
│   │   └── TradeBar.tsx                 # data-testid="trade-ticker" etc., "trade-result"
│   └── chat/
│       ├── ChatPanel.tsx
│       ├── ChatMessage.tsx              # data-testid="chat-message", data-role
│       └── ChatAction.tsx               # data-testid="chat-action", data-kind
├── lib/
│   ├── api.ts                           # thin fetch wrappers for /api/*
│   ├── priceStream.ts                   # EventSource singleton + context/hook
│   └── portfolioStore.ts                # REST-backed context/hook
└── __tests__/                           # component unit tests
```

### Structure Rationale

- **Single page, no Next.js router pages beyond `app/page.tsx`:** PLAN.md describes one dense dashboard, not multiple routes. Keeping it single-route sidesteps the `SPAStaticFiles` fallback logic in `main.py` entirely — Next.js export emits one `index.html`, and every request either hits `/api/*` or falls through to that file. Do not add extra route segments unless a real second page is needed.
- **`lib/priceStream.ts` and `lib/portfolioStore.ts` are the only two stateful providers:** everything else is a pure reader. This mirrors the backend's own split between the in-memory `PriceCache` (live, ephemeral) and the SQLite-backed portfolio/watchlist state (durable, REST) — the frontend should not blur that line by, e.g., polling `/api/portfolio` on a timer to simulate liveness. Compute live totals client-side instead (see Data Flow).
- **`components/` grouped by panel, not by type:** matches the six PLAN.md UI sections 1:1, keeps `data-testid` ownership co-located with the component that renders it, and matches the existing E2E spec structure (`test/e2e/01..06`) so each spec maps to one or two component groups.

## Architectural Patterns

### Pattern 1: Single EventSource, fan-out via context

**What:** One `new EventSource('/api/stream/prices')` created once (e.g. in `app/page.tsx` or a top-level provider), never re-created by child components. Every SSE message is a full JSON snapshot of all tracked tickers (`{TICKER: {price, previous_price, timestamp, change, change_percent, direction}}`, per `market/stream.py`); the provider merges it into `latestPrices` and appends one point per ticker into a capped `priceHistory` buffer.
**When to use:** Always, for this app — there is exactly one live data source and many consumers (watchlist rows, main chart, header total, positions table P&L).
**Trade-offs:** Simpler than a full state library; the only cost is remembering not to instantiate `EventSource` inside a component that can remount (e.g. inside `WatchlistRow`), which would open one connection per row.

```typescript
// lib/priceStream.ts
type PriceUpdate = { price: number; previous_price: number; timestamp: string };
type Status = "connected" | "reconnecting" | "disconnected";

function createPriceStream() {
  const source = new EventSource("/api/stream/prices");
  let status: Status = "disconnected";
  const history: Record<string, { t: string; price: number }[]> = {};
  const HISTORY_CAP = 300;

  source.onopen = () => (status = "connected");
  source.onerror = () => (status = source.readyState === EventSource.CONNECTING ? "reconnecting" : "disconnected");
  source.onmessage = (e) => {
    status = "connected";
    const prices: Record<string, PriceUpdate> = JSON.parse(e.data);
    for (const [ticker, u] of Object.entries(prices)) {
      (history[ticker] ??= []).push({ t: u.timestamp, price: u.price });
      if (history[ticker].length > HISTORY_CAP) history[ticker].shift();
    }
    // notify subscribers with { prices, history, status }
  };
}
```

### Pattern 2: REST is the source of truth for holdings; SSE is the source of truth for prices; the client derives everything else

**What:** `PortfolioStore` fetches `GET /api/portfolio` and `GET /api/watchlist` once on mount. It never polls. Instead, live figures (current price, unrealized P&L, total portfolio value shown in the header) are derived on every render by combining the stored `{qty, avg_cost, cash}` with the latest price from `PriceStream`. `PortfolioStore` is only refetched/mutated after an action:
  - **Manual trade** (`POST /api/portfolio/trade`): response already embeds `{trade, portfolio}` — apply `portfolio` directly, no refetch.
  - **Manual watchlist add/remove** (`POST`/`DELETE /api/watchlist`): response returns only the single ticker — append/remove it from local watchlist state directly (optimistic), then let `PriceStream` fill in its price once the backend starts tracking it (this is why the E2E watchlist spec waits for a price to appear after add, rather than expecting it immediately).
  - **Chat actions** (`POST /api/chat`): response returns `{message, trades, watchlist_changes, errors}` with **no embedded portfolio** — after any response with a non-empty `trades` or `watchlist_changes` array, refetch `GET /api/portfolio` and `GET /api/watchlist` to resync (see Gaps below).
**When to use:** Always for this app — it avoids inventing a polling interval that would fight with the SSE cadence and keeps the two backend sources of truth (`PriceCache` vs SQLite) mirrored honestly in the client.
**Trade-offs:** Requires the three call sites above to remember which one needs a refetch. Worth a one-line comment at each call site; not worth abstracting further at this scale.

### Pattern 3: Client-buffered price history, not a backend history endpoint

**What:** Neither sparklines nor the main chart have a backing REST endpoint — `PriceCache` only holds the latest tick, and `portfolio_snapshots` is portfolio-level (every 30s), not per-ticker. PLAN.md is explicit that sparklines/charts "accumulate... from the SSE stream since page load," so history necessarily resets on reload. The main chart for the selected ticker reads from the same `priceHistory[ticker]` buffer the watchlist sparklines use — just rendered larger, not a separate data source.
**When to use:** For any per-ticker time series in this app.
**Trade-offs:** Chart is empty for a few seconds after every reload (E2E test 01 tolerates this by polling for prices to change rather than expecting instant history). No backend change needed or wanted here.

## Data Flow

### Request Flow — manual trade

```
TradeBar (ticker, qty, side)
    ↓ POST /api/portfolio/trade
FastAPI api.py → actions.trade() → portfolio.execute_trade() (SQLite, BEGIN IMMEDIATE)
    ↓ response: { trade, portfolio }
PortfolioStore.setPortfolio(response.portfolio)   ← direct apply, no refetch
    ↓
PositionsTable / Header / Heatmap re-render from PortfolioStore + live PriceStream price
```

### Request Flow — chat trade (the asymmetric case)

```
ChatPanel (message)
    ↓ POST /api/chat
FastAPI chat/service.py → LLM (or mock) → execute_actions() → actions.trade()/watchlist ops
    ↓ response: { message, trades: [...], watchlist_changes: [...], errors: [...] }
ChatPanel renders message + inline ChatAction confirmations from trades/watchlist_changes
    ↓ if trades.length or watchlist_changes.length > 0
PortfolioStore.refetch()  ← GET /api/portfolio + GET /api/watchlist (response has no portfolio object)
```

### SSE Flow (Server → Browser, continuous)

```
market/stream.py: cache.version changes → one JSON payload, all tracked tickers, ~500ms
    ↓ EventSource.onmessage
PriceStream provider: merge into latestPrices, push into priceHistory[ticker] (capped)
    ↓ subscribed components re-render
WatchlistRow (flash green/red on price vs previous_price, sparkline from history)
MainChart (full history for selected ticker)
Header (recomputed total_value = cash + Σ qty·price)
PositionsTable (recomputed unrealized P&L per row)
```

### Connection Status derivation

`EventSource` only exposes 3 `readyState` values (`CONNECTING`, `OPEN`, `CLOSED`) and auto-retries on its own — there is no native "reconnecting" event. Derive the three states the header dot needs (`connected`/`reconnecting`/`disconnected`, per `test-testid="connection-status"` `data-status`) as:
- `onopen` / any `onmessage` → `connected`
- `onerror` while `readyState === EventSource.CONNECTING` (browser will retry) → `reconnecting`
- `onerror` while `readyState === EventSource.CLOSED` → `disconnected`

The 06-sse-reconnect E2E spec drops the TCP connection and expects the dot to leave `connected` immediately, then return to `connected` within 20s and prices to change again — the above mapping satisfies that without any custom reconnect loop (native `EventSource` retry, `retry: 1000` set server-side in `stream.py`, is sufficient).

## Docker / Build Integration

```
Dockerfile stage "frontend" (node:24-slim)
  COPY frontend/package.json frontend/package-lock.json  →  npm ci
  COPY frontend/                                          →  npm run build
  produces frontend/out/  (Next.js `output: 'export'`, default dist dir)
        ↓
Dockerfile stage "app" (extends "backend")
  COPY --from=frontend /frontend/out ./static             →  backend/static/ at runtime
        ↓
main.py: STATIC_DIR = /app/backend/static (env STATIC_DIR)
  app.mount("/", SPAStaticFiles(directory=STATIC_DIR, html=True))
```

**Build order implication:** `frontend/package.json` + `package-lock.json` + a working `next.config.ts` with `output: 'export'` must exist and build cleanly (`npm run build` → `out/index.html`) before the Docker image builds at all — this is the "critical blocker" PROJECT.md calls out (no `frontend/` today means Stage 1 fails, so Stage 3 and every E2E spec fail). This should be the very first frontend increment, even before any real UI: a placeholder `page.tsx` that builds and is served correctly is enough to unblock `docker compose -f test/docker-compose.test.yml up` and get the harness green on infrastructure before UI work starts.

**E2E harness reachability:** `test/docker-compose.test.yml` builds the same root `Dockerfile` (context `..`), runs it with `LLM_MOCK=true`, waits on `/api/health` (already implemented), and points the `playwright` container at `http://finally:8000`. `playwright.config.ts`'s `baseURL` resolves from `BASE_URL`. No frontend-specific wiring is needed in the test compose file — once the static export lands in `backend/static/`, `openApp()` (`test/e2e/helpers.ts`) works unchanged. `tmpfs: /app/db` means each E2E run starts from a fresh, freshly-seeded SQLite file (lazy init in `main.py`'s lifespan), so specs can assume the default 10-ticker watchlist and $10k cash.

## Scaling Considerations

Not relevant at the scale this project targets (single user, demo/course capstone, PLAN.md explicitly rules out multi-user). Skip this section's usual content — the one real "scale" axis is polling cadence (500ms SSE tick, 30s snapshot), both fixed by the existing backend and already appropriate for a single browser tab.

## Anti-Patterns

### Anti-Pattern 1: Polling `/api/portfolio` on an interval for "live" total value

**What people do:** Add a `setInterval(fetchPortfolio, 1000)` so the header total value looks live.
**Why it's wrong:** Redundant with SSE (which already ticks every 500ms), adds needless HTTP load, and desyncs from the price flash animations (numbers would jump on a different cadence than the flash).
**Do this instead:** Fetch positions/cash once (and after actions), recompute `total_value` and per-position P&L on every SSE tick using `PriceStream`'s latest prices — exactly how `portfolio.get_portfolio()` computes it server-side (`current = cache.get_price(ticker)`), just done client-side to avoid a round trip.

### Anti-Pattern 2: One `EventSource` per component (e.g., one per watchlist row or inside `MainChart`)

**What people do:** Each `WatchlistRow` or `MainChart` opens its own `new EventSource(...)` to "get its own ticker's data."
**Why it's wrong:** The backend endpoint always pushes *all* tracked tickers in one payload (`price_events()` in `stream.py`) — there is no per-ticker SSE endpoint. Multiple connections multiply server load for identical data and make reconnect-status tracking ambiguous (which connection's status is "the" status?).
**Do this instead:** One provider at the app root owns the single `EventSource`; components read from context.

### Anti-Pattern 3: Assuming chat trade responses update the portfolio automatically

**What people do:** Render the chat's trade confirmation and assume `cash-balance`/`position-row-*` will update because "the trade already happened on the backend."
**Why it's wrong:** They did happen (SQLite is updated), but the browser's `PortfolioStore` state is stale until it refetches — `POST /api/chat`'s response shape (`{message, trades, watchlist_changes, errors}`) does not include a `portfolio` field the way `POST /api/portfolio/trade` does.
**Do this instead:** Treat any non-empty `trades`/`watchlist_changes` in a chat response as a refetch trigger for `PortfolioStore` (see Gaps below).

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Browser ↔ FastAPI | `fetch()` to `/api/*` (JSON), one `EventSource` to `/api/stream/prices` | Same origin — no CORS config needed, per PLAN.md |
| `PriceStream` ↔ rest of app | React context, read-only for consumers | Single source of live price truth |
| `PortfolioStore` ↔ rest of app | React context with `refetch()`/optimistic setters | Single source of holdings truth; combined with `PriceStream` at render time for live figures |
| Next.js build ↔ Docker image | Static export (`frontend/out/`) copied to `backend/static/` | No Node runtime in the final image — Stage "app" extends "backend" only |

## Gaps vs PLAN.md Noticed While Reading the Backend

These are not bugs to fix in the backend (per PROJECT.md: keep the existing backend, no rewrite) — they are frontend-side design implications to plan for:

1. **Chat response doesn't embed updated portfolio state.** `chat/service.py:handle_message()` returns `{message, trades, watchlist_changes, errors}`, unlike `POST /api/portfolio/trade` which embeds `portfolio`. The frontend must explicitly refetch `GET /api/portfolio` (and `GET /api/watchlist` if `watchlist_changes` is non-empty) after any chat response containing actions. Flag this for the phase that builds the chat panel.
2. **Watchlist add/remove responses return only the single ticker,** not the updated list (`{ticker, price}` / `{ticker, removed: true}`). The frontend keeps its own local watchlist array and merges it with `PriceStream` prices; it should not expect a price to be present immediately in the add response (`cache.get(ticker)` can be `None` right after `add_to_watchlist` runs, until the market source ticks it — matches the E2E test's explicit `waitForPrice` after add).
3. **No per-ticker price history endpoint exists** (confirmed intentional per PLAN.md section 2 and 10 — "accumulated on the frontend... since page load"). Any phase estimating "add a chart" must budget for a client-side ring-buffer, not a backend fetch.
4. **`GET /api/chat` (history) exists and must be called on mount** to satisfy the "chat history survives a page reload" E2E spec — easy to miss since it's not in PLAN.md's endpoint table explicitly by that name but is implemented in `api.py:91`.

## Suggested Build Order (dependency-driven)

1. **Scaffold + Docker plumbing:** `frontend/` with Next.js (`output: 'export'`), Tailwind, a placeholder page. Verify `docker compose -f test/docker-compose.test.yml up --build` at least reaches a running container serving *something* at `/`. This unblocks the whole E2E harness immediately (PROJECT.md's stated critical blocker) before any real UI exists.
2. **`PriceStream` provider + Header + connection-status dot.** Nothing else can be built/tested meaningfully without live prices and the dot the E2E `openApp()` helper waits on.
3. **Watchlist panel** (rows, sparklines, add/remove) — depends only on `PriceStream` plus simple REST calls.
4. **`PortfolioStore` provider + Trade bar + Positions table** — depends on `PriceStream` (for live P&L) and its own REST fetch/refetch logic.
5. **Main chart** (selection wired from watchlist row click) — reuses `PriceStream`'s history buffer; no new data dependency once step 2–3 exist.
6. **Heatmap + P&L chart** — depend on `PortfolioStore` (positions) and `GET /api/portfolio/history` respectively; naturally last of the "visualization" panels since they're the least blocking for other work.
7. **Chat panel** — depends on both providers being refetchable/mutable (per Gap #1–2 above), so build it after `PortfolioStore`'s refetch path is proven correct via the trade bar.
8. **Frontend unit tests** written alongside each component (not deferred to the end), plus a final full Docker + Playwright pass once all 6 specs' components exist.

## Sources

- `backend/app/main.py` — `SPAStaticFiles`, lifespan, static mount path (read directly, HIGH confidence)
- `backend/app/api.py` — REST endpoint shapes and response payloads (read directly, HIGH confidence)
- `backend/app/market/stream.py` — SSE payload shape and cadence (read directly, HIGH confidence)
- `backend/app/portfolio.py`, `backend/app/actions.py`, `backend/app/chat/service.py` — trade/watchlist/chat response shapes (read directly, HIGH confidence)
- `Dockerfile`, `docker-compose.yml`, `test/docker-compose.test.yml` — build stages, volume/env wiring, E2E harness (read directly, HIGH confidence)
- `test/e2e/*.spec.ts`, `test/e2e/helpers.ts` — the frontend contract (`data-testid` hooks, expected flows), treated as authoritative per PROJECT.md (read directly, HIGH confidence)
- `.planning/codebase/ARCHITECTURE.md` — existing backend architecture map (read directly, HIGH confidence)
- `planning/PLAN.md`, `.planning/PROJECT.md` — product/architecture spec (required reading, HIGH confidence)

---
*Architecture research for: FinAlly frontend integration*
*Researched: 2026-09-25*
