# Phase 1: Live Terminal in Docker - Context

**Gathered:** 2026-09-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify the existing FastAPI backend against `planning/PLAN.md` and fix only the gaps that break PLAN.md behavior or an E2E spec. Then build the Next.js static-export frontend shell so the Docker image builds and one container on :8000 serves a dark trading terminal. The terminal shows the 10 default tickers with live SSE prices and session change %, $10,000 cash and total value in the header, and a 3-state connection indicator that recovers after a network drop without a reload.

Done when: the Docker image builds, `pytest` passes, and E2E specs `01-fresh-start` (the "health endpoint responds" and "fresh start shows default watchlist..." tests) and `06-sse-reconnect` pass against the container.

Requirements: BACK-01, BACK-02, FND-01, FND-02, HDR-01, HDR-03, HDR-04, WTCH-01, DLVR-01.

Not in this phase: trading, positions, heatmap, P&L chart (Phase 2); watchlist add/remove, ticker selection, main chart (Phase 3); chat (Phase 4). The `01-fresh-start` ticker-selection test belongs to Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Terminal layout skeleton
- **D-01:** Use a 2-column layout with a bottom strip. The header holds total value, cash, and the connection indicator. Below it: the watchlist on the left, the main chart with the trade bar under it in the center, and the AI chat as a drawer on the right. A bottom strip spans the width with **Heatmap | P&L chart | Positions table**. — **Reversibility:** costly — every later phase slots its panel into this grid.
- **D-02:** Draw the full grid in Phase 1. Regions not built yet (chart, trade bar, heatmap, P&L, positions, chat) are empty panels with a title and a muted placeholder body. Later phases fill them in, so the layout never shifts.
- **D-03:** The chat drawer starts open on page load and can collapse to a thin edge tab. In Phase 1 it is only a placeholder panel with the collapse toggle.
- **D-04:** The app fills the viewport (100vh) with no page scroll. Panels scroll internally (watchlist, positions, chat). Below tablet width, the layout stacks into one scrolling column.

### Price & status display
- **D-05:** Each watchlist row's change % uses `session_change_percent` from the SSE payload (change since the stream started). It stands in for PLAN.md's "daily change %" and is not the tick-to-tick `change_percent`.
- **D-06:** The connection indicator is a colored dot plus a short small-caps label: green **LIVE**, yellow **RECONNECTING**, red **OFFLINE**. The element carries `data-testid="connection-status"`, and its `data-status` is `connected` / `reconnecting` / `disconnected`, exactly as the E2E contract requires.
- **D-07:** While the status is not `connected`, watchlist prices keep the last known value at reduced opacity. Full opacity returns on reconnect.
- **D-08:** Rows seed their initial prices from `GET /api/watchlist`, which already returns the latest prices, so no blank or dash appears on load. SSE ticks take over from there.

### Frontend state approach
- **D-09:** Use Zustand for client state: prices per ticker, connection status, cash and portfolio, watchlist, and the selected ticker in later phases. Components subscribe with per-ticker selectors so each tick re-renders only what changed. Keep it to a single small store and avoid extra abstraction layers. — **Reversibility:** costly — every later phase reads and writes through this store.
- **D-10:** Open exactly one `EventSource('/api/stream/prices')` at the app root. Status follows the native EventSource state: `onopen` gives `connected`; `onerror` with `readyState === CONNECTING` gives `reconnecting`; `readyState === CLOSED` gives `disconnected`. Rely on native auto-retry (the server sends `retry: 1000`), with no custom reconnect timers.
- **D-11:** The toolchain is Next.js 16 (App Router, single route `app/page.tsx`, `output: 'export'`), React 19, Tailwind CSS 4 (CSS-first `@tailwindcss/postcss`), TypeScript **5.9**, and npm with `package-lock.json` committed because the Dockerfile runs `npm ci`. Use TypeScript 5.9 rather than 7 because Next's tooling hasn't confirmed TS 7 support.
- **D-12:** All API and SSE calls use relative `/api/...` paths, never an absolute origin. `06-sse-reconnect` runs through a TCP proxy on a random port.

### Backend verification
- **D-13:** Verification method: walk PLAN.md §5–§9 (env vars, market data, SSE, DB schema and seed, API endpoints, LLM/mock) as a checklist against the code. Then start the server and call every endpoint (curl, plus a short SSE sample). Record pass or gap per item in a short verification note in the phase directory. Add a pytest test only where a real gap gets fixed.
- **D-14:** Fix only what breaks PLAN.md behavior or an E2E spec. Leave the soft items in `.planning/codebase/CONCERNS.md` alone: broad `except Exception` in background loops, the avg-cost fallback when a price is missing, and unbounded chat history. The existing 75 pytest tests must stay green (verified passing on 2026-09-25).
- **D-15:** Work order inside the phase, validating each step before the next: (1) verify and fix the backend; (2) build a frontend scaffold that produces a static export and a Docker image that builds and serves it; (3) add the header, watchlist, SSE store, and connection status; (4) run `01-fresh-start` (health and fresh-start tests) and `06-sse-reconnect` against the container.

### Claude's Discretion
- Number formatting: prices as `$` with 2 decimals and thousands separators, change % signed with 2 decimals, green for positive and red for negative. Output must parse with the `parseNumber` helper in `test/e2e/helpers.ts` (no scientific notation; U+2212 minus is fine).
- Exact panel proportions, spacing, fonts (monospace for numbers), and placeholder copy, within the PLAN.md colors: backgrounds `#0d1117`/`#1a1a2e`, accent `#ecad0a`, blue `#209dd7`, purple `#753991` for submit buttons.
- Internal file and component structure under `frontend/`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product spec
- `planning/PLAN.md` — full spec. §2 (UX, visual design, colors), §3 (architecture), §5–§9 (the backend verification checklist), §10 (frontend layout and technical notes), §11 (Docker)
- `planning/MARKET_DATA_SUMMARY.md` — SSE event payload fields (ticker, price, previous_price, change, change_percent, direction, session_change_percent)

### E2E contract (binding)
- `test/e2e/01-fresh-start.spec.ts` — health test and fresh-start test (10 rows, $10k cash and total value, prices changing)
- `test/e2e/06-sse-reconnect.spec.ts` — `connection-status` `data-status` transitions through a TCP proxy; prices must resume
- `test/e2e/helpers.ts` — `parseNumber`, `openApp` (waits for `data-status="connected"`), `waitForPrice`
- `test/docker-compose.test.yml` — how the E2E suite runs the container (`LLM_MOCK=true`, tmpfs DB)
- `test/playwright.config.ts` — base URL and runner config

### Build & serve
- `Dockerfile` — Node 24 stage runs `npm ci && npm run build` and copies `frontend/out` to `backend/static`
- `backend/app/main.py` — `SPAStaticFiles` mount at `/` when `STATIC_DIR` exists; lifespan starts the market source and snapshot loop

### Planning & research
- `.planning/REQUIREMENTS.md` — requirement IDs and exact `data-testid` names
- `.planning/research/SUMMARY.md` — stack versions, architecture (PriceStream + store), pitfalls (absolute URLs, testid drift, canvas SSR)
- `.planning/research/PITFALLS.md` — detailed pitfalls and recovery
- `.planning/codebase/ARCHITECTURE.md` — backend layers and data flow
- `.planning/codebase/CONCERNS.md` — known soft issues, deliberately left alone (D-14)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GET /api/watchlist` (`backend/app/api.py:59`): returns watchlist tickers with latest prices; use it to seed rows (D-08)
- `GET /api/portfolio` (`backend/app/api.py:38`): cash, positions, and total value for the header
- `GET /api/stream/prices` (`backend/app/market/stream.py`): sends `retry: 1000` first, then one JSON event keyed by ticker whenever the cache version changes
- `PriceUpdate.to_dict()` (`backend/app/market/models.py`): the exact per-ticker SSE fields, including `session_change_percent`
- `GET /api/health` (`backend/app/api.py:33`)

### Established Patterns
- Backend: FastAPI router under `/api`, `PriceCache` as the single price source, lazy DB init and seed, `LLM_MOCK` for chat
- Backend tests: pytest, run with `UV_CACHE_DIR=$TMPDIR/uvcache uv run --directory backend pytest` in the sandbox (75 passing)
- Code style: simple, short modules, no defensive code, `uv run`/`uv add` only

### Integration Points
- `frontend/out/` → copied to `backend/static/` in the Docker `app` stage; FastAPI serves it at `/` with an SPA fallback
- The frontend must exist with `package.json` + `package-lock.json` for Docker Stage 1 (`npm ci`)
- Header `cash-balance`/`total-value` and watchlist `watchlist-row-{T}`/`watchlist-price-{T}` testids feed spec 01; `connection-status` feeds specs 01 and 06

</code_context>

<specifics>
## Specific Ideas

- Terminal layout as sketched by the user:
  ```
  ┌──────────── Header: value · cash · ● ────────────┐
  │ Watch-  │  Main chart               │ Chat ▸     │
  │ list    │                           │ (drawer)   │
  │         │  Trade bar                │            │
  ├─────────┴───────────┬───────────────┴────────────┤
  │ Heatmap │ P&L chart │ Positions table            │
  └─────────┴───────────┴────────────────────────────┘
  ```
- Bloomberg-terminal feel: dense, dark, and data-first.

</specifics>

<deferred>
## Deferred Ideas

None. The discussion stayed within phase scope. Price flash, sparklines, and frontend unit tests were already deferred to v2 in REQUIREMENTS.md.

</deferred>

---

*Phase: 01-live-terminal-in-docker*
*Context gathered: 2026-09-25*
