# Feature Research

**Domain:** AI-copilot trading workstation frontend (Bloomberg-terminal style, single-user, brownfield — backend exists, frontend does not)
**Researched:** 2026-09-25
**Confidence:** HIGH — derived directly from the project's own authoritative sources: `planning/PLAN.md`, `.planning/PROJECT.md`, the six Playwright E2E specs in `test/e2e/*.spec.ts` (the frontend contract per PROJECT.md), and the existing backend implementation (`backend/app/api.py`, `backend/app/market/*.py`, `backend/app/portfolio.py`, `backend/app/actions.py`, `backend/app/chat/*.py`). No external ecosystem search was needed for feature scope; general trading-terminal UI conventions (treemap heatmaps, sparklines, flash-on-tick) are well-established, common-knowledge patterns.

## Feature Landscape

### Table Stakes (Users Expect These)

Every row below is required by PLAN.md and/or directly asserted by an E2E spec. Missing any of these fails the "definition of done" (Docker build + all 6 E2E specs green).

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Live-streaming watchlist grid (10 default tickers) | Core value prop: prices must be moving on first paint | LOW-MED | `EventSource` to `/api/stream/prices`; render exactly `DEFAULT_TICKERS.length` rows, each `watchlist-row-{TICKER}` |
| Price flash animation (green up / red down, ~500ms fade) | PLAN.md visual spec section 2 & 10; the terminal's signature "alive" feel | LOW | Pure CSS transition on the `direction` field already computed server-side (`up`/`down`/`flat`) — no client math needed. Not directly asserted by an E2E testid, but is an explicit PLAN requirement |
| Client-accumulated sparkline per watchlist row | PLAN.md: "accumulated on the frontend from the SSE stream since page load" — no backend history endpoint exists for this | MED | Requires a shared per-ticker ring buffer (see Feature Dependencies) — not directly asserted by an E2E testid, but is explicit PLAN scope |
| Ticker selection → main chart | Clicking a row is the only way to pick the detail chart's ticker | LOW | `watchlist-row-{TICKER}` needs `data-selected="true"` when active; selecting also fills `trade-ticker` |
| Main detail chart | PLAN.md section 10 "larger chart ... price over time"; E2E checks `price-chart` renders points and price tracks the watchlist price | MED | `main-chart` wrapper needs `data-ticker` attribute + visible ticker text; nested `price-chart` needs a `data-points` attribute that increases over time and a `chart-price` value within ~1% of the watchlist price. **No backend history endpoint exists** — this chart is fed by the same client-side SSE accumulator as sparklines, so it starts empty on selection and fills in live |
| Trade bar (market buy/sell) | Core "trade a simulated portfolio" UX; PLAN section 10 | LOW-MED | `trade-ticker`, `trade-quantity`, `trade-buy`, `trade-sell` inputs; must work with a **manually typed ticker**, not only one selected from the watchlist (rejected-trade test types `NFLX`/`JPM` directly) |
| Trade result / error surface | Backend returns `400` with a message on invalid trades (insufficient cash/shares) — the UI must show it | LOW | `trade-result` element must literally contain the backend's error text (case-insensitive `insufficient cash` / `insufficient shares`); on success no state pollution (cash unchanged on rejected trades) |
| Positions table | PLAN section 10; lists every open position with live P&L | LOW | `position-row-{TICKER}`, `position-qty-{TICKER}` (plain numeric text, e.g. matches `\b5(\.0+)?\b`); `positions-empty` placeholder must exist when empty and disappear once any position exists |
| Portfolio heatmap (treemap) | PLAN section 10; core visualization requirement | MED-HIGH | `heatmap` container + one `heatmap-cell-{TICKER}` per position with non-zero bounding box; each cell needs `data-pnl="up"/"down"/"flat"` **and** the actual rendered `background-color` must be greener (G>R) for up, redder (R>G) for down — color and data attribute must agree |
| P&L line chart | PLAN section 10; tracks `portfolio_snapshots` over time | MED | `pnl-chart` needs `data-points` > 0 and a real `<canvas>` child — backed by `GET /api/portfolio/history` (already populated: snapshot every 30s + one after every trade) |
| AI chat panel | PLAN sections 2, 9, 10 — the product's headline feature | MED-HIGH | `chat-input`, `chat-send`, repeated `chat-message` nodes with `data-role="user"/"assistant"`, `chat-loading` indicator that appears then disappears, inline `chat-action` nodes with `data-kind="trade"/"watchlist"` showing the executed action (e.g. "Bought 2 NVDA"), and message text is the LLM's literal `message` field (verbatim, including the `LLM_MOCK` "Mock response to: ..." echo and inline error text for failed trades) |
| Chat history persistence across reload | E2E explicitly reloads and re-asserts the same messages | LOW | Backend already stores `chat_messages`; frontend must fetch `GET /api/chat` on mount and render in order |
| Watchlist add/remove (manual UI) | PLAN section 2 & 10 | LOW-MED | `watchlist-add-input` + `watchlist-add-button`; input accepts lowercase (test types `pypl`) and the resulting row must render as uppercase `PYPL` — normalization can be done client-side or simply rely on server response; `watchlist-remove-{TICKER}` is **only visible on row hover** |
| Watchlist persists across reload | E2E explicitly reloads mid-test | LOW | Backend is already the source of truth (SQLite) — just refetch `GET /api/watchlist` on mount, don't rely on client-only state |
| Header: cash balance | Always-visible per PLAN section 2 | LOW | `cash-balance` formatted as currency text parroted by `parseNumber` (`$10,000.00` style — commas and `$` are stripped by the test, so any reasonable currency format works) |
| Header: live total value | PLAN section 10 "portfolio total value (updating live)" | LOW-MED | `total-value` must reflect `cash + positions_value`, refreshed on every price tick and every trade |
| Connection status indicator | PLAN section 2 & 10; explicit 3-state dot | LOW-MED | `connection-status` element with a `data-status` attribute; **E2E asserts exactly two states**: `"connected"` and *anything else* (not necessarily `"reconnecting"` specifically) — but PLAN specifies green/yellow/red, so implement all three (`connected`/`reconnecting`/`disconnected`) for spec fidelity even though only the binary distinction is machine-checked |
| SSE reconnection resilience | E2E cuts the raw TCP connection and expects auto-recovery within 20s, prices resuming within 15s after that | MED | Native `EventSource` auto-retries (server sends `retry: 1000`); the frontend only needs to correctly reflect `onopen`/`onerror` transitions in `connection-status` — do not build custom reconnect logic on top of EventSource, it already retries |
| Numeric/currency text formatting compatible with test parsing | Every numeric assertion goes through `parseNumber`, which strips everything except digits, `.`, `-`, and treats `−` (U+2212) as a minus sign | LOW | Avoid rendering numbers as non-numeric strings (e.g. no scientific notation); negative P&L can use either a plain hyphen or a proper minus glyph |

### Differentiators (Competitive Advantage)

Not required to pass tests on their own merits, but they're what make this a "capstone" product rather than a plain paper-trading app — and several are already implied by PLAN.md as the product's identity.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI chat that **auto-executes** trades/watchlist changes with inline confirmations | Demonstrates agentic AI end-to-end, zero friction — the course's core theme | MED | Already fully implemented server-side (`chat/service.py` executes actions and returns `trades`/`watchlist_changes`/`errors`); frontend differentiator is rendering these as first-class inline chat bubbles (`chat-action`), not just text |
| Treemap heatmap colored by live P&L | Professional-terminal visualization rarely seen in toy trading-sim apps; instantly communicates portfolio risk concentration | MED-HIGH | Needs a real treemap layout (squarified algorithm) sized by `market_value` weight, not just a colored table |
| Dense, Bloomberg-style dark multi-panel layout | Visual differentiation vs. generic dashboard templates; PLAN.md is explicit about this aesthetic | MED | Custom dark theme (`#0d1117`/`#1a1a2e`, accent `#ecad0a`, blue `#209dd7`, purple `#753991`) — "every pixel earns its place" |
| Correlated, event-driven price simulator surfaced live in the UI | The simulator (backend, already built) generates correlated tech-stock moves and occasional 2-5% "event" jumps — showing this liveliness (flash + sparkline) is what sells the demo | LOW (frontend side; simulator itself is backend, already done) | Pure rendering differentiator — no new frontend logic beyond flash/sparkline already listed as table stakes |
| Swappable market data source (simulator ↔ Massive real data) invisible to the UI | Lets instructors/users flip to real data with just an env var, no frontend change | N/A (backend-only, already implemented) | Frontend must simply be agnostic to price source — it already is, since it only ever talks to `PriceCache`-backed endpoints |

### Anti-Features (Commonly Requested, Often Problematic)

Explicitly out of scope per PLAN.md and `.planning/PROJECT.md`. Building any of these would be scope creep against the stated spec.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Authentication / multi-user accounts | "Feels more real," lets multiple people use one deployment | No auth = no session complexity, no DB user isolation logic; every table already has a hardcoded `user_id="default"` — adding auth now would touch the whole schema and API surface for zero course value | Single implicit user; leave the `user_id` column as future-proofing only |
| Limit orders / order book / partial fills / fees | "Real brokers have these" | Explodes portfolio math (queued orders, partial execution, matching logic) for a simulator whose whole point is simplicity | Market orders only, instant fill at current cached price (already the backend contract) |
| WebSockets for price streaming | "More real-time," bidirectional | One-way push is all that's needed; WS adds handshake/heartbeat/reconnect complexity SSE gets for free via native `EventSource` retry | SSE (`/api/stream/prices`), already implemented |
| Token-by-token LLM response streaming | Feels more "alive" while the LLM answers | Structured-output JSON (trades/watchlist_changes) can't be safely rendered as a partial stream; Cerebras inference is already fast enough that a loading spinner is imperceptible | `chat-loading` indicator + one complete JSON response per message (already the backend contract) |
| Trade confirmation dialogs ("Are you sure you want to buy...?") | Standard finance-app UX pattern to prevent fat-finger errors | Explicitly rejected in PLAN.md section 9 — fake money, zero stakes, and confirmation dialogs would break the fluid agentic-AI demo (the AI can't click "confirm") | Instant fill, errors surfaced after the fact via `trade-result` / chat error text |
| Historical intraday price data fetched from the backend for charts | "Charts should show real history, not just what loaded since I opened the tab" | No such endpoint exists in the API surface (`api.py` has no `/api/prices/history`); building one is unscoped backend work this milestone explicitly avoids ("only fix issues that break PLAN.md behavior or tests") | Client-side accumulation of SSE ticks since page load, exactly as PLAN.md specifies for sparklines — apply the same pattern to the main chart |
| Client-side caching/offline layer, optimistic local state divergence, or a heavy state-management library (Redux/MobX/etc.) | "Feels more robust," common in larger SPAs | This is a single-page, single-user app talking to one origin with no auth; a heavy state layer adds indirection with no payoff and risks drifting from the SQLite-backed server truth that the E2E reload tests rely on | Simple React state/context + refetch-on-mount + SSE-driven updates; server (SQLite) stays the single source of truth, confirmed by the two "survives a page reload" E2E tests |
| Cloud deployment tooling (Terraform/App Runner) | "Should be deployable to prod" | PLAN.md marks this an explicit stretch goal, not part of "done" this milestone | `deploy/` remains out of scope; focus is Docker build + E2E green |

## Feature Dependencies

```
Price History Accumulator (client-side, per-ticker ring buffer fed by SSE)
    ├──required by──> Sparklines (watchlist rows)
    └──required by──> Main Detail Chart (price-chart / chart-price)

SSE Connection Hook (EventSource lifecycle: open/message/error)
    ├──required by──> Watchlist live prices
    ├──required by──> Price History Accumulator
    └──required by──> Connection Status Indicator

Watchlist Row Selection ──enhances──> Trade Bar (auto-fills trade-ticker)
    (Trade Bar itself has NO hard dependency on selection — manual ticker entry must work standalone)

Portfolio Fetch (GET /api/portfolio, refetched after every trade)
    ├──required by──> Positions Table
    ├──required by──> Portfolio Heatmap
    └──required by──> Header total-value / cash-balance

Portfolio History Fetch (GET /api/portfolio/history)
    └──required by──> P&L Line Chart

Trade Execution (Trade Bar OR Chat) ──triggers refresh of──> Positions Table, Heatmap, Header, P&L Chart
    (both paths hit the same backend action/portfolio state — the frontend must not maintain two divergent
     "trade happened" code paths; render both from one shared portfolio-refresh function)

Watchlist Mutation (manual add/remove OR Chat) ──triggers refresh of──> Watchlist Grid, Sparkline set
    (same single-source-of-truth requirement as trades)

Chat Panel ──depends on──> Portfolio Fetch + Watchlist Fetch (LLM context is built server-side, but
    inline chat-action confirmations must match the same position/watchlist state the rest of the UI shows)
```

### Dependency Notes

- **Price History Accumulator is the single most important shared piece of client state.** Both the sparklines and the main chart draw from it, and neither has a backend history endpoint to fall back on — the accumulator must exist before either feature can be built, and it should be one implementation (keyed by ticker) rather than two separate buffers.
- **SSE Connection Hook gates almost everything visual.** `openApp()` (the shared E2E setup helper) blocks on `connection-status` reading `"connected"` before any other assertion runs — if this hook is flaky or slow to report state, every other spec fails at setup, not at its own assertion.
- **Trade Bar does not require Watchlist Selection.** The rejected-trades E2E test types `NFLX` and `JPM` directly into `trade-ticker` without ever clicking a watchlist row. Selection is a convenience (auto-fill), not a precondition — do not gate the buy/sell buttons on "a ticker is selected."
- **Trade execution and Chat trade execution must converge on one state-refresh path.** The chat spec's trade test (`buy 2 NVDA`) asserts the exact same `position-row-NVDA` and `cash-balance` testids the manual trade spec uses — if the UI maintains separate render logic for "trades from the trade bar" vs. "trades from chat," they will drift and one path will fail intermittently.
- **Reload-survival (watchlist and chat) means no feature may rely on client-only in-memory state as its source of truth for persisted data.** Only the SSE-accumulated price history is legitimately client-only and *should* reset on reload (PLAN.md: "since page load").

## MVP Definition

This is a single-milestone frontend build-out against an already-frozen backend contract, so "MVP" here means the entire scope in `.planning/PROJECT.md`'s Active list — there is no meaningful smaller slice that still passes the definition of done (Docker build + all 6 E2E specs green).

### Launch With (v1) — required for this milestone's definition of done

- [ ] Header: cash balance, live total value, 3-state connection indicator — foundation every other panel depends on being visibly "connected"
- [ ] Watchlist grid with live SSE prices, flash animation, sparklines, add/remove — the first thing a user sees
- [ ] Ticker selection → main detail chart
- [ ] Trade bar with buy/sell and error surfacing
- [ ] Positions table with empty state
- [ ] Portfolio heatmap (treemap, P&L-colored)
- [ ] P&L line chart from snapshot history
- [ ] AI chat panel with history persistence, loading state, and inline trade/watchlist action confirmations
- [ ] SSE reconnection resilience (rely on native `EventSource` retry, just reflect state correctly)
- [ ] Frontend unit tests (component rendering, flash trigger, calculations, chat) — explicitly listed in PROJECT.md Active
- [ ] Docker multi-stage build producing a working static export served by FastAPI on :8000

### Add After Validation (v1.x)

Nothing is deferred within this milestone — PROJECT.md's Out of Scope items are the only deferrals, and they are deferred indefinitely, not "after validation":

- [ ] N/A for this milestone

### Future Consideration (v2+) — already marked Out of Scope in PROJECT.md, listed here only for roadmap awareness

- [ ] Cloud deployment (Terraform/App Runner in `deploy/`) — explicit stretch goal
- [ ] Broader backend hardening (indexes, logging config, graceful shutdown) — only touch if it breaks PLAN.md behavior or a test
- [ ] Authentication/multi-user, limit orders, WebSockets, token-streamed chat — permanently out of scope per PLAN.md's architecture rationale, not just deferred

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| SSE price stream + connection status | HIGH | MEDIUM | P1 |
| Watchlist grid (rows, prices) | HIGH | LOW | P1 |
| Price flash animation | MEDIUM | LOW | P1 |
| Sparklines (price history accumulator) | MEDIUM | MEDIUM | P1 |
| Ticker selection + main chart | HIGH | MEDIUM | P1 |
| Trade bar (buy/sell + errors) | HIGH | LOW-MEDIUM | P1 |
| Positions table | HIGH | LOW | P1 |
| Portfolio heatmap (treemap) | MEDIUM | HIGH | P1 |
| P&L line chart | MEDIUM | MEDIUM | P1 |
| AI chat panel (full flow incl. inline actions) | HIGH | HIGH | P1 |
| Watchlist add/remove UI | MEDIUM | LOW-MEDIUM | P1 |
| Header cash/total-value | HIGH | LOW | P1 |
| Frontend unit tests | MEDIUM | MEDIUM | P1 |
| Docker build/serving | HIGH | LOW-MEDIUM | P1 |
| Cloud deployment (Terraform) | LOW | HIGH | P3 (explicitly deferred) |

**Priority key:**
- P1: Must have for launch (this milestone's definition of done — Docker + all 6 E2E specs green)
- P2: none identified — this milestone has no "should have, add later" tier
- P3: Nice to have, future consideration (explicitly out of scope per PROJECT.md)

## E2E Contract

The six spec files in `test/e2e/` are the authoritative frontend contract per `.planning/PROJECT.md`. Every `data-testid`, attribute, and flow below must exist exactly as named — Playwright locators are exact-match on `data-testid`.

### `helpers.ts` (shared setup used by every spec)

- `openApp(page)`: navigates to `/`, then asserts `connection-status` has `data-status="connected"` before any test proceeds. **This gate blocks every other spec's setup — it must resolve quickly and reliably.**
- `waitForPrice(page, ticker)`: waits for `watchlist-price-{TICKER}` to contain a digit, returns it parsed as a number.
- `removeFromWatchlist(page, ticker)`: hovers `watchlist-row-{TICKER}`, then clicks `watchlist-remove-{TICKER}` — **the remove button must only be interactable/visible after hover**, not always-visible.
- `placeTrade(page, ticker, qty, side)`: fills `trade-ticker` and `trade-quantity`, clicks `trade-buy` or `trade-sell`.
- `parseNumber` / `readNumber`: strip `$`, commas, and any non-digit/`.`/`-` characters; treat `−` (U+2212) as a minus sign. All numeric testids must render text these regexes can parse (plain formatted currency/numbers, no scientific notation).

### `01-fresh-start.spec.ts`

- `GET /api/health` returns 2xx (already true, backend-only).
- On fresh load: all `DEFAULT_TICKERS` (`AAPL GOOGL MSFT AMZN TSLA NVDA META JPM V NFLX`) render as `watchlist-row-{TICKER}`, and the **count of `[data-testid^="watchlist-row-"]` equals exactly 10** (no extra rows, no duplicates).
- `cash-balance` reads exactly `10000`; `total-value` is `~10000` (`toBeCloseTo(10000, 0)`).
- `watchlist-price-AAPL` is `> 0`.
- Polling all 10 `watchlist-price-{TICKER}` values joined as a string must **change** within 15s (proves live streaming, not a static snapshot).
- Clicking `watchlist-row-MSFT` sets `data-selected="true"` on that row, sets `trade-ticker` value to `MSFT`, sets `main-chart`'s `data-ticker="MSFT"` and visible text contains `MSFT`.
- `price-chart` is visible and its `data-points` attribute becomes `> 0` (polled — chart fills in after selection, doesn't need to be pre-populated).
- `chart-price` value must be within 1% of `watchlist-price-MSFT` (both reflect the same live price).

### `02-watchlist.spec.ts`

- Typing lowercase `pypl` into `watchlist-add-input` and clicking `watchlist-add-button` produces `watchlist-row-PYPL` (uppercased) with a price `> 0`, and `GET /api/watchlist` confirms `PYPL` is present server-side.
- `removeFromWatchlist` makes `watchlist-row-PYPL` have **count 0**, and `GET /api/watchlist` confirms it's gone server-side.
- Adding `DIS`, then `page.reload()`, must still show `watchlist-row-DIS` — **watchlist state must be fetched from the server on mount, not held only in client memory.**

### `03-trading.spec.ts`

- Buy 5 `AAPL` at the current live price: `position-row-AAPL` appears, `position-qty-AAPL` text matches `\b5(\.0+)?\b`, `cash-balance` decreases, and the cash delta is within 2% of `5 × price` (allows for price drift between quote and fill in a live-moving simulator).
- Buy 4 then sell 1 then sell 3 more of `MSFT`: quantity updates to `3` then the row (`position-row-MSFT`) disappears entirely at zero, with cash increasing after each sell.
- Rejected trades: buying `1,000,000 NFLX` shows `trade-result` containing `/insufficient cash/i`; selling `10 JPM` (unowned) shows `trade-result` containing `/insufficient shares/i`. **Cash must be unchanged and no `position-row-JPM` must appear** — failed trades must not leave partial state.

### `04-portfolio-viz.spec.ts`

- After buying `GOOGL`: `heatmap` is visible, `heatmap-cell-GOOGL` is visible with a non-zero bounding box (`width * height > 0`).
- For **every** `[data-testid^="heatmap-cell-"]`: its `data-pnl` attribute is `"up"`, `"down"`, or `"flat"`, and the rendered `background-color` must agree — `up` → green channel > red channel; `down` → red channel > green channel; anything else must literally be `"flat"` (no partial/ambiguous states allowed).
- `GET /api/portfolio/history` already has data (backend snapshots every 30s + after trades); `pnl-chart` must be visible, its `data-points` attribute becomes `> 0`, and it must contain a real `<canvas>` element.
- `positions-empty` must have **count 0** whenever `GET /api/portfolio`'s `positions` array is non-empty, and every position must have a corresponding `position-row-{TICKER}`.

### `05-chat.spec.ts`

- Sending a message renders it as the last `[data-testid="chat-message"][data-role="user"]`, and the assistant's reply (mock mode: `"Mock response to: {message}"`) as the last `[data-testid="chat-message"][data-role="assistant"]`. `chat-loading` must have **count 0** once the reply has rendered (it must appear during the wait and disappear after).
- Sending `"buy 2 NVDA"` (mock-mode regex trade parsing) renders a `[data-testid="chat-action"][data-kind="trade"]` containing `/Bought 2 NVDA/`, `position-row-NVDA` appears, and `cash-balance` decreases.
- Sending `"add PYPL"` renders `[data-testid="chat-action"][data-kind="watchlist"]` containing `PYPL`, and `watchlist-row-PYPL` appears; sending `"remove PYPL"` removes it.
- Sending `"sell 500 V"` (unowned/insufficient) makes the **assistant message itself** (not a separate error element) contain `/insufficient shares/i`, with no `position-row-V` created.
- Sending a message, then `page.reload()`, must still show both the user message and the exact same mock assistant reply as the last messages — **chat history must be fetched from `GET /api/chat` on mount**, not held only in client memory.

### `06-sse-reconnect.spec.ts`

- Uses a raw TCP proxy (not browser offline emulation) to actually sever the SSE connection — this proves `EventSource`'s native retry behavior is relied upon, not a custom offline-detection layer.
- Before the drop: `connection-status` reads `data-status="connected"` and prices are flowing (`waitForPrice`).
- After `proxy.drop()`: `connection-status` must **stop** reading `"connected"` (any other value is acceptable — no specific "reconnecting" string is enforced by this test, though PLAN.md's 3-state spec calls for one).
- After `proxy.restore()`: `connection-status` returns to `"connected"` within 20s, and `watchlist-price-TSLA` resumes changing within 15s after that — **the price accumulator/watchlist must resume normal updates automatically once the SSE connection re-establishes, no manual refresh.**

## Sources

- `/Users/wilsonsmacmini/Documents/Code/finally/planning/PLAN.md` — full product/architecture spec (primary/curated source, HIGH confidence)
- `/Users/wilsonsmacmini/Documents/Code/finally/.planning/PROJECT.md` — current milestone scope, Active/Out-of-Scope requirements (primary/curated source, HIGH confidence)
- `/Users/wilsonsmacmini/Documents/Code/finally/test/e2e/01-fresh-start.spec.ts` through `06-sse-reconnect.spec.ts` and `helpers.ts` — the binding frontend contract (primary/curated source, HIGH confidence)
- `/Users/wilsonsmacmini/Documents/Code/finally/backend/app/api.py`, `market/stream.py`, `market/cache.py`, `market/models.py`, `portfolio.py`, `actions.py`, `chat/service.py`, `chat/llm.py` — exact response shapes and business rules the frontend must consume (primary source code, HIGH confidence)
- General trading-terminal UI conventions (treemap P&L heatmaps, sparklines, flash-on-tick, SSE reconnection via native `EventSource` retry) — common, well-established frontend patterns, not sourced from a specific external reference this pass

---
*Feature research for: AI trading workstation frontend (FinAlly)*
*Researched: 2026-09-25*
