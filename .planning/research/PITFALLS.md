# Pitfalls Research

**Domain:** Next.js static-export frontend + FastAPI SSE backend + AI chat, wired to a fixed Playwright E2E contract, built to pass in Docker
**Researched:** 2026-09-25
**Confidence:** HIGH (grounded directly in this repo's Dockerfile, `backend/app/main.py`, `backend/app/market/stream.py`, `backend/app/portfolio.py`, `backend/app/chat/*`, `test/docker-compose.test.yml`, `test/playwright.config.ts`, `test/e2e/*.ts`, and `.planning/codebase/CONCERNS.md`) plus MEDIUM-confidence general web findings on Next.js static export and SSE-behind-proxy behavior (cited in Sources).

## Critical Pitfalls

### Pitfall 1: Frontend hardcodes an absolute API/SSE origin instead of using relative paths

**What goes wrong:**
The frontend calls `fetch("http://localhost:8000/api/...")` or opens `new EventSource("http://localhost:8000/api/stream/prices")` with a hardcoded host, instead of a relative URL (`/api/...`) or `window.location.origin`.

**Why it happens:**
It works fine in local dev (`next dev` on :3000 calling backend on :8000) and even passes most E2E specs, because in Docker the container is reached at whatever `BASE_URL` Playwright uses. It silently breaks only in `test/e2e/06-sse-reconnect.spec.ts`, which navigates the page through a local TCP proxy on a random port (`http://127.0.0.1:{port}/`) specifically so it can sever the SSE connection. If the SSE URL is hardcoded to the real backend origin, the browser connects straight through the proxy's target and the test's `proxy.drop()` never actually interrupts anything the frontend is using — the reconnect assertions then fail or falsely pass.

**How to avoid:**
Always build API/SSE URLs relative to the page's own origin (plain `/api/...` paths, or `new EventSource("/api/stream/prices")`). PLAN.md already mandates single-origin serving for exactly this reason — treat it as load-bearing, not just a CORS convenience.

**Warning signs:**
Any `fetch(` or `new EventSource(` call in the frontend that contains a literal `http://` or a `NEXT_PUBLIC_API_URL`-style env var pointing at a fixed host.

**Phase to address:**
Frontend scaffold / SSE integration phase — bake the relative-URL convention into the first API client and SSE hook, before any other component depends on it.

---

### Pitfall 2: `data-testid` / `data-*` attribute drift from the E2E contract

**What goes wrong:**
The frontend is built independently and the developer approximates the test hooks (e.g. `data-testid="watchlist-price"` instead of `watchlist-price-{TICKER}`, or `data-connected="true"` instead of `data-status="connected"`), so specs fail even though the feature visibly works in a browser.

**Why it happens:**
`.planning/codebase/CONCERNS.md` already flags that all 6 E2E specs reference test IDs that don't exist yet. Reading PLAN.md's prose description of the UI is not sufficient — the actual contract is the literal strings in `test/e2e/*.spec.ts` and `test/e2e/helpers.ts`. This repo has an unusually large number of exact-string dependencies:
- `connection-status` needs `data-status` = `"connected"` and something else while reconnecting/disconnected (test only asserts `not.toHaveAttribute("data-status", "connected")` during a drop, so any other value works, but it must change).
- `watchlist-row-{TICKER}` needs `data-selected="true"` when clicked.
- `main-chart` needs `data-ticker="{TICKER}"` and text containing the ticker.
- `price-chart` needs a numeric, increasing `data-points` attribute.
- `heatmap-cell-{TICKER}` needs `data-pnl` = `"up"` / `"down"` / `"flat"`, and its rendered `background-color` must actually reflect that (green channel > red for "up", vice versa for "down") — a CSS class name is not enough, computed style must differ.
- `pnl-chart` needs its own `data-points` attribute.
- `chat-message` needs `data-role="user"|"assistant"`; `chat-action` needs `data-kind="trade"|"watchlist"`.
- `trade-result` must literally contain the substrings `insufficient cash` / `insufficient shares` (case-insensitive) — which only happens if the frontend surfaces the backend's `HTTPException.detail` text verbatim rather than a generic "Trade failed" message.

**How to avoid:**
Treat `test/e2e/*.spec.ts` and `test/e2e/helpers.ts` as the frontend's literal API contract (PROJECT.md already says this). Before building each component, grep the specs for every `getByTestId(...)` / `data-*` string it touches and implement exactly that vocabulary — don't paraphrase.

**Warning signs:**
E2E failures where the underlying feature clearly works when clicked manually, but Playwright times out on `getByTestId`/`toHaveAttribute` — this almost always means an attribute name or value mismatch, not a functional bug.

**Phase to address:**
Every frontend-building phase should end with a pass against the one or two E2E specs it targets, not just a manual smoke check — do not defer all E2E verification to a final "Docker + E2E" phase.

---

### Pitfall 3: React re-render storm from 2Hz SSE ticks fanning out through the whole tree

**What goes wrong:**
The SSE endpoint (`backend/app/market/stream.py`) pushes **all** prices as a single JSON object roughly every 500ms whenever the cache's version changes. A naive implementation stores this payload in one top-level `useState`/context value; every tick then re-renders the watchlist, the selected chart, the heatmap, the positions table and the header simultaneously — 2 renders/sec across the entire UI, worse as more tickers are watched.

**Why it happens:**
It is the simplest thing to write (`const [prices, setPrices] = useState({})`, update it in the `EventSource.onmessage` handler), and it "works" during casual manual testing since 2 renders/sec on 10 rows isn't visibly janky on a dev machine — but it compounds badly once charts (canvas redraw), the treemap (recompute layout) and price-flash CSS timers are all wired to the same state, and it gets worse linearly as the user adds tickers via chat or the watchlist UI (no cap in PLAN.md).

**How to avoid:**
Scope subscriptions per ticker: keep the raw SSE payload out of top-level React state and instead let each watchlist row / chart subscribe to only its own ticker's price (via a small pub-sub store, context selector, or one `useSyncExternalStore` per ticker) so an update to AAPL doesn't re-render MSFT's row or the heatmap. Keep the sparkline/price-history buffers in refs or a dedicated store, not component state, and cap their length.

**Warning signs:**
React DevTools profiler shows the entire tree flashing/re-rendering every ~500ms even when only one ticker's price actually changed; frame drops or visible input lag while typing in the trade bar or chat box during active streaming.

**Phase to address:**
The phase that first wires the `EventSource` into React (watchlist/SSE integration phase) — this is an architectural decision, expensive to retrofit once charts, heatmap and positions all depend on a shared price blob.

---

### Pitfall 4: Canvas chart library breaks Next.js static export with "window is not defined"

**What goes wrong:**
Libraries like Lightweight Charts (or any canvas-based charting lib) touch `window`/`document` at module load or during the library's own SSR-safety checks. Even with `output: 'export'`, Next.js still runs each page through React's build-time render pass to produce the static HTML, so importing and rendering a chart component at the top level (not guarded) throws during `next build` — the build fails outright.

**Why it happens:**
Static export removes the *server*, but not build-time pre-rendering; developers assume "static export = no SSR" and skip the guard they'd normally add for `getServerSideProps`-style apps.

**How to avoid:**
Load the chart component with `next/dynamic` and `{ ssr: false }`, or construct/mount the chart instance only inside a `useEffect` (which never runs during the Node.js build pass) and render a plain empty container on first paint. Confirm the choice with `npm run build` locally before trusting `docker build` to catch it — a failed static export shows up as a Docker build failure, which is slow and expensive to iterate against.

**Warning signs:**
`next build` fails with `ReferenceError: window is not defined` or `document is not defined`, often pointing into the charting library's own code, not application code.

**Phase to address:**
Chart integration phase (main chart + P&L chart) — verify with a local `npm run build`, not just `npm run dev`, before wiring it into the Docker pipeline.

---

### Pitfall 5: Next.js multi-page routing conventions collide with the FastAPI SPA fallback

**What goes wrong:**
`backend/app/main.py`'s `SPAStaticFiles.get_response` treats any path with no `.` in its last segment and not starting with `api` as "a page" and serves `index.html` for it — a classic SPA-shell fallback. This works perfectly for a true single-page app, but if a developer later adds a second Next.js route (e.g. `/settings`), the static export will emit either `settings.html` or `settings/index.html` depending on the `trailingSlash` config, and the fallback logic's assumption (only one page, `index.html`, serves everything) will silently stop matching real exported files for that route — or a build-ID mismatch during a hard navigation drops the configured trailing slash entirely.

**Why it happens:**
It is easy to reach for Next.js's file-based routing out of habit even though PLAN.md describes a single dense dashboard page with client-side ticker selection (not page navigation).

**How to avoid:**
Keep the entire app as one route (`app/page.tsx` / `pages/index.tsx`) with all "navigation" (selecting a ticker, opening the chat panel) handled by client-side state, exactly as the E2E specs assume (`main-chart` updates via `data-ticker`, not a URL change). If a second route is ever genuinely needed, set `trailingSlash: true` in `next.config.js` and adjust `SPAStaticFiles` together, in the same change.

**Warning signs:**
A newly added page 404s only in the Docker-built container, not in `next dev`.

**Phase to address:**
Frontend scaffold phase — decide "single route, client-side view state" explicitly up front so it isn't reintroduced later.

---

### Pitfall 6: `LLM_MOCK=true` regex is a narrow contract the frontend can silently violate

**What goes wrong:**
`backend/app/chat/llm.py`'s `mock_response()` only recognizes messages matching `buy|sell <qty> <ticker>` and `add|remove <ticker>` (word-boundary regex over the lowercased raw text) and always replies `"Mock response to: {user_message}"` verbatim. The E2E chat spec (`05-chat.spec.ts`) asserts on that exact echo string and on `chat-action[data-kind=...]` for parsed trades/watchlist changes. If the frontend chat input trims/reformats the user's text before sending it (e.g. prepends a prompt template, or the send button fires twice due to a missing debounce, sending "buy 2 nvda buy 2 nvda"), the mock's regex either won't match or double-matches, and the deterministic assertions fail.

**Why it happens:**
Developers often add client-side massaging (auto-capitalization, trimming, prompt scaffolding) to "help" the LLM, forgetting that in test mode the exact string is pattern-matched, not understood.

**How to avoid:**
Send the user's raw message text unmodified in the `POST /api/chat` body. Guard the send button/input against double-submit (disable while `chat-loading` is present) so exactly one message is sent per user action — the E2E tests submit once and expect exactly one new `chat-message` pair.

**Warning signs:**
Chat E2E tests pass locally when clicking slowly but fail intermittently in CI (a classic double-submit symptom), or the assistant's echoed text has extra whitespace/casing differences from the regex `toContainText` expectations.

**Phase to address:**
AI chat panel phase — write the send handler with an explicit "disabled while pending" state from the start.

---

### Pitfall 7: E2E specs share one backend/portfolio and run order-dependently — new tests or reordering breaks hidden assumptions

**What goes wrong:**
`test/playwright.config.ts` runs `fullyParallel: false, workers: 1` deliberately, because every spec mutates the same single-user portfolio (`test/docker-compose.test.yml` gives the app a fresh `tmpfs`-backed SQLite file per container run, but that DB is shared across *all* specs within one run). `03-trading.spec.ts`'s "rejected trades" test assumes JPM is not currently held (so a sell of 10 JPM must fail with "insufficient shares"); `04-portfolio-viz.spec.ts` assumes GOOGL P&L renders after a fresh 3-share buy; `05-chat.spec.ts`'s failed-sell test assumes V is not held. Adding a new spec (or a phase's manual verification step) that trades JPM or V, or reordering spec files, can flip these assumptions and produce flaky, hard-to-diagnose failures that have nothing to do with the code under test.

**Why it happens:**
The shared-state design is intentional and cheap (no per-test DB reset), but it is easy to forget when adding a 7th spec or when a developer runs a subset of specs manually during frontend work against a container that already accumulated trades from prior manual clicking.

**How to avoid:**
Keep an explicit, written ticker allocation per spec file (which tickers each spec is allowed to buy/sell) and note it in `test/README.md`. Any new spec must pick untouched tickers or explicitly account for state left by earlier specs. When manually verifying a frontend change against a running container, restart the container (or use the test compose file) rather than reusing a session with accumulated trades.

**Warning signs:**
A spec that passes in isolation (`npx playwright test 03-trading`) but fails when run as part of the full suite, or vice versa.

**Phase to address:**
Docker/E2E hardening phase, but the *convention* should be documented as soon as the second trading-related spec is touched.

---

### Pitfall 8: Trade/watchlist error details get swallowed on the way to the UI

**What goes wrong:**
`POST /api/portfolio/trade` and `POST /api/watchlist` return `HTTPException(400, str(e))` with the exact `TradeError` text (e.g. `"Insufficient cash: need $X, have $Y"`). A frontend that only checks `response.ok` and shows a generic "Something went wrong" message (a common, "safe-looking" error-handling pattern) will never surface the specific text `03-trading.spec.ts` requires in `trade-result` (`/insufficient cash/i`, `/insufficient shares/i`).

**Why it happens:**
Generic catch-all error UI is a normal defensive habit; it directly conflicts with this project's test contract, which expects the raw backend message to reach the DOM.

**How to avoid:**
On a non-2xx response from `/api/portfolio/trade` or `/api/watchlist`, parse the JSON body's `detail` field and render it verbatim in the designated result element, rather than mapping errors to a fixed set of friendly strings.

**Warning signs:**
`trade-result` test failures where the element exists and is visible but contains the wrong text.

**Phase to address:**
Trading UI phase (trade bar + result display).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Store SSE price history only in browser memory (per PLAN.md — sparklines "accumulated on the frontend since page load") | No backend work, no schema changes | History resets on refresh/tab close; unbounded array growth if not capped | Always acceptable per spec — just cap array length (e.g. last N points) so a long-open tab doesn't leak memory |
| One shared top-level price object in React state instead of per-ticker subscriptions | Fastest to write | Re-render storm (Pitfall 3) as watchlist grows | Never acceptable beyond a first throwaway prototype — refactor before wiring charts/heatmap to it |
| Catch-all `except Exception` in background tasks (already present in `simulator.py`, `massive_client.py`, `chat/llm.py`, `main.py`'s `snapshot_loop`) | Keeps the demo running through transient errors | Masks real bugs (crashed simulator, dead LLM calls) as silent no-ops — noted in `.planning/codebase/CONCERNS.md` | Acceptable for a course capstone demo; flag explicitly rather than "fixing" broad — narrowing exception types is out of scope per PROJECT.md unless it breaks PLAN.md behavior |
| `docker-compose.test.yml` `volumes: e2e-db:` block is declared but unused (the `finally` service actually uses a `tmpfs` mount, not this named volume) | No cleanup needed | Dead config that could mislead a future contributor into thinking DB state persists across test runs | Leave as-is; note it, don't spend a phase "fixing" it |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| Native `EventSource` | Assuming a distinct "reconnecting" browser state exists to bind the connection-status dot to | `EventSource.onerror` fires with `readyState === EventSource.CONNECTING` while it auto-retries (the backend already sends `retry: 1000\n\n`) and `readyState === EventSource.CLOSED` only if the browser gives up or you call `.close()` yourself — map CONNECTING → "reconnecting" (yellow), CLOSED → "disconnected" (red), and only set "connected" on `onopen` |
| Docker multi-stage build (`Dockerfile`) | Editing frontend source and expecting Docker layer cache to skip `npm ci` | `COPY frontend/package.json frontend/package-lock.json` happens before `COPY frontend/ ./`, so `npm ci` is only invalidated by lockfile changes — but `package-lock.json` must exist and be committed once the frontend is scaffolded, or the `COPY` step itself fails |
| `next.config.js` static export | Using `next/image`'s default loader (needs a live optimization server) | Set `images: { unoptimized: true }` or avoid `next/image` entirely for this project (few/no raster images needed) |
| FastAPI `StaticFiles` mount (`SPAStaticFiles`) | Assuming any 404 falls back to `index.html`, including real API 404s | The check already excludes paths starting with `api`, but any *new* backend route prefix must also be excluded or it will get shadowed by the SPA fallback |
| Reverse proxies (only relevant for the optional cloud-deploy stretch goal) | Deploying behind nginx/ALB without disabling response buffering for `/api/stream/prices` | The backend already sends `X-Accel-Buffering: no` and `Cache-Control: no-cache`; an added reverse proxy must also set `proxy_buffering off` (nginx) or equivalent, or SSE events will queue for minutes instead of streaming |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| One React state blob for all SSE prices (Pitfall 3) | Visible input lag in trade bar/chat while prices stream; whole page flashes on every tick | Per-ticker subscriptions / external store, not one shared state object | Noticeable with the default 10 tickers; severe if the user grows the watchlist via chat |
| GBM simulator's correlation-matrix Cholesky decomposition rebuilt on every ticker add/remove (`backend/app/market/simulator.py`, flagged in CONCERNS.md) | Adding many tickers slows or crashes the simulator (`LinAlgError` on a near-singular matrix) | Cap watchlist size in the UI, or at minimum surface a clear error if the backend rejects a ticker | Not exercised by the current 6 E2E specs (which add at most 1-2 tickers), but a chat-driven "add 20 tickers" demo could hit it |
| Sparkline/price-history arrays growing unbounded in browser memory | Slow tab after being left open for hours; large chart re-render cost | Cap history length (e.g. last 200-500 points per ticker) before appending | Only manifests on long-lived sessions, unlikely to show up in a 30s-timeout E2E run but will show up in live demos |
| `chat_messages` table has no write-time retention (only read-time `HISTORY_LIMIT`, per CONCERNS.md) | `/api/chat` and `GET /api/chat` (used for reload-persistence, per `05-chat.spec.ts`) slow down over very long sessions | Out of scope per PROJECT.md ("only fix issues that break PLAN.md behavior or tests") — not worth a phase for this milestone | Not observable within a single Docker/E2E run; a multi-day demo session could feel it |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Treating "fake money" as "no consequences" for the chat's auto-execution | If the container is ever exposed beyond localhost, arbitrary visitors can drive real OpenRouter/Cerebras API spend through the chat with no rate limiting | Out of scope for this milestone per PROJECT.md, but the eventual `.env.example`/README should say plainly "local-only, do not expose this port publicly" |
| No validation that ticker input in the trade bar / watchlist-add box matches an allowed ticker format before it reaches the backend | Backend's `normalize_ticker` already validates, but a frontend that skips client-side hints will round-trip obviously-bad input and rely entirely on the 400 response | Basic client-side format check (letters, reasonable length) as a UX nicety, not a security boundary — the real validation stays server-side |
| Rendering LLM `message` / chat text as raw HTML instead of as text | Even though this is a local single-user demo, an XSS habit picked up here is worth avoiding | Render assistant/user chat content as text (React does this by default unless `dangerouslySetInnerHTML` is used) — don't introduce a markdown renderer that executes raw HTML |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|--------------|-------------------|
| Price flash animation implemented with an unmanaged `setTimeout` per update | On a busy stream (10 tickers, 500ms cadence), timers can pile up, get orphaned on unmount, or cause the flash class to "stick" if two updates land within the animation window | Use a CSS animation (`animation-fill-mode` + re-triggering by toggling a `key` or forcing reflow) rather than manual class-add/remove timers; clean up any timers in `useEffect` return |
| Connection-status dot only ever set once on mount | User never sees "reconnecting" (yellow) during a real network blip, so the SSE-reconnect UX promised in PLAN.md never actually appears | Drive the dot from `EventSource.onopen`/`onerror` continuously, not just an initial check (see Integration Gotchas) |
| Trade bar with no per-request disable state | Rapid double-clicks on Buy/Sell can fire duplicate trades before the first response returns, executing two trades instead of one | Disable buy/sell buttons while a trade request is in flight, mirroring the `chat-loading` pattern already implied by the chat spec |

## "Looks Done But Isn't" Checklist

- [ ] **Watchlist streaming:** Often "done" once prices render once on load — verify prices actually keep changing over time (`01-fresh-start.spec.ts` explicitly polls that all prices differ from their initial snapshot within 15s, not just that they render).
- [ ] **Connection status dot:** Often hardcoded green after first connect — verify it changes to a non-"connected" value during an actual SSE interruption (test with the same TCP-proxy technique `06-sse-reconnect.spec.ts` uses, not just DevTools "offline" mode, which does not interrupt an already-open `EventSource`).
- [ ] **Portfolio heatmap:** Often "done" once tiles render with *some* color — verify the actual computed `background-color` differs in the correct direction (green channel > red for gains, red > green for losses) for every tile, and that a flat/zero-P&L tile is explicitly `data-pnl="flat"` rather than defaulting to "up" or "down".
- [ ] **Chat trade execution:** Often "done" once the assistant's text response appears — verify the inline `chat-action[data-kind="trade"]` confirmation element also appears, and that the position/cash actually updates in the same render pass the test observes.
- [ ] **Docker build:** Often "done" once `docker build` succeeds — verify the full `docker compose -f test/docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from playwright` passes, since the build succeeding says nothing about `next build`'s static export matching what `SPAStaticFiles` expects at runtime.
- [ ] **Watchlist reload persistence:** Often "done" once add/remove work in the current session — verify a full page reload (`02-watchlist.spec.ts`'s "survives a page reload" test) still shows the change, i.e. state is read from `GET /api/watchlist` on mount, not just kept in a client-only store.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|------------------|
| Hardcoded absolute API/SSE origin (Pitfall 1) | LOW | Grep the frontend for `http://` / `https://` literals and env-var-based base URLs; replace with relative paths; re-run `06-sse-reconnect.spec.ts` to confirm |
| Shared top-level SSE state causing re-render storm (Pitfall 3) | MEDIUM | Introduce a per-ticker store/selector layer (e.g. a small pub-sub map keyed by ticker) and migrate consumers one at a time (watchlist rows first, then chart, then heatmap); no schema or backend change needed |
| `data-testid` drift (Pitfall 2) | LOW–MEDIUM | Diff the component's attributes against the specific spec file's `getByTestId`/`data-*` calls; usually a rename, occasionally a missing state (e.g. adding a `data-selected` toggle) |
| Chart library breaking static export (Pitfall 4) | LOW | Wrap the chart import in `next/dynamic({ ssr: false })` or move instantiation into `useEffect`; re-run `npm run build` locally before rebuilding Docker |
| Test order-dependency flake (Pitfall 7) | MEDIUM | Identify which spec's ticker assumption was violated (usually visible in the Playwright HTML report's trade/position state at time of failure) and either pick a different ticker for the new/changed test or reset the container (`docker compose ... down -v` then re-run) |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| Hardcoded absolute API/SSE origin | Frontend scaffold / SSE integration phase | `06-sse-reconnect.spec.ts` passes against the Docker-built container, not just local `next dev` |
| `data-testid` contract drift | Every frontend-building phase (per-feature) | Run the relevant spec file after building each panel, not only at the end |
| Re-render storm from SSE ticks | SSE integration phase (first time `EventSource` is wired to React state) | React DevTools profiler shows only the affected ticker's row re-rendering on a single price update |
| Canvas chart + static export SSR crash | Chart integration phase (main chart, sparklines, P&L chart) | `npm run build` succeeds locally before every Docker rebuild |
| Next.js multi-page routing vs. SPA fallback | Frontend scaffold phase | Confirm the app has exactly one route/page; if a second route is ever added, `trailingSlash` and `SPAStaticFiles` are updated together |
| `LLM_MOCK` regex contract violations | AI chat panel phase | `05-chat.spec.ts` passes with the send button disabled during `chat-loading`, and with raw (untrimmed/unmodified) message text sent to `/api/chat` |
| Shared E2E state / test order dependency | Docker/E2E hardening phase (but document the ticker allocation as soon as it exists) | Full suite passes both in file order and when a single spec is run in isolation |
| Trade/watchlist error text swallowed by generic UI | Trading UI phase | `trade-result` renders the backend's literal `detail` string on a 400 response |

## Sources

- This repository: `Dockerfile`, `backend/app/main.py`, `backend/app/market/stream.py`, `backend/app/market/cache.py`, `backend/app/portfolio.py`, `backend/app/api.py`, `backend/app/chat/llm.py`, `backend/app/chat/service.py`, `test/docker-compose.test.yml`, `test/playwright.config.ts`, `test/e2e/*.spec.ts`, `test/e2e/helpers.ts` — HIGH confidence, read directly.
- `.planning/codebase/CONCERNS.md` (2026-09-25 codebase map) — HIGH confidence, prior mapping of this same codebase.
- `.planning/PROJECT.md`, `planning/PLAN.md` — HIGH confidence, project's own spec.
- [Next.js: Understanding "API Routes in Static Export" Warning](https://nextjs.org/docs/messages/api-routes-static-export) — MEDIUM confidence, official docs.
- [Next.js: Guides — Static Exports](https://nextjs.org/docs/pages/guides/static-exports) — MEDIUM confidence, official docs.
- [Next.js: `trailingSlash` config reference](https://nextjs.org/docs/app/api-reference/config/next-config-js/trailingSlash) — MEDIUM confidence, official docs.
- [How to Configure Server-Sent Events Through Nginx](https://oneuptime.com/blog/post/2025-12-16-server-sent-events-nginx/view) — MEDIUM confidence, community/vendor blog on SSE proxy buffering and idle-timeout keepalive behavior.
- [Setting up nginx to work with EventSource](https://technicallyshane.com/2020/10/24/nginx-eventsource.html) — MEDIUM confidence, corroborates `X-Accel-Buffering`/`proxy_buffering` requirement.

---
*Pitfalls research for: FinAlly — AI Trading Workstation (Next.js static-export frontend + FastAPI SSE backend build-out)*
*Researched: 2026-09-25*
