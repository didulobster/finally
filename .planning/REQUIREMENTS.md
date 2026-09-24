# Requirements: FinAlly — AI Trading Workstation

**Defined:** 2026-09-25
**Core Value:** One `docker run` opens `http://localhost:8000` to a live, data-dense trading terminal. Prices stream, trades fill instantly, and the AI assistant can trade by natural language. The whole flow is proven by the E2E suite passing in Docker.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases. The six specs in `test/e2e/` are the binding frontend contract (exact `data-testid` names and attributes).

### Backend

- [ ] **BACK-01**: Backend behavior is verified against `planning/PLAN.md` end to end (market data, SSE, DB init/seed, portfolio, watchlist, chat, health), keeping the existing code
- [ ] **BACK-02**: Any gap or bug that breaks PLAN.md behavior or an E2E spec is fixed, and existing pytest tests still pass

### Frontend Foundation

- [ ] **FND-01**: `frontend/` is a Next.js + TypeScript project that builds as a static export (`output: 'export'`) with a Tailwind dark theme using the PLAN.md colors
- [ ] **FND-02**: All API and SSE calls use same-origin relative paths (`/api/...`)

### Header & Connection

- [ ] **HDR-01**: User sees their cash balance (`cash-balance`) in the header
- [ ] **HDR-02**: User sees total portfolio value (`total-value` = cash + live positions value), updating on every price tick and after every trade
- [ ] **HDR-03**: User sees a connection status dot (`connection-status`, `data-status`) that is green/connected, yellow/reconnecting, or red/disconnected
- [ ] **HDR-04**: When the SSE connection drops and returns, the status goes back to connected and prices resume without a page reload

### Watchlist

- [ ] **WTCH-01**: On a fresh start, user sees exactly the 10 default tickers (`watchlist-row-{TICKER}`) with live-changing prices (`watchlist-price-{TICKER}`)
- [ ] **WTCH-02**: User can add a ticker by typing it (any case) into `watchlist-add-input` and clicking `watchlist-add-button`; it appears uppercased with a live price
- [ ] **WTCH-03**: User can remove a ticker with `watchlist-remove-{TICKER}`, which appears on row hover
- [ ] **WTCH-04**: Watchlist changes persist across page reload (fetched from the server on mount)
- [ ] **WTCH-05**: Clicking a row selects it (`data-selected="true"`), fills the trade bar ticker, and switches the main chart

### Main Chart

- [ ] **CHRT-01**: User sees a canvas price chart (`main-chart` with `data-ticker`, `price-chart` with growing `data-points`) for the selected ticker, filled from SSE ticks since selection
- [ ] **CHRT-02**: The chart shows the current price (`chart-price`) matching the watchlist price within 1%

### Trading

- [ ] **TRAD-01**: User can buy or sell any typed ticker and quantity via `trade-ticker`, `trade-quantity`, `trade-buy`, `trade-sell` (market order, instant fill)
- [ ] **TRAD-02**: A rejected trade shows the backend error text verbatim in `trade-result` (e.g. "insufficient cash", "insufficient shares") and leaves cash and positions unchanged

### Portfolio

- [ ] **PORT-01**: User sees a positions table (`position-row-{TICKER}`, `position-qty-{TICKER}`) with ticker, quantity, avg cost, current price, unrealized P&L, and % change; a position sold to zero disappears
- [ ] **PORT-02**: User sees `positions-empty` when they hold no positions
- [ ] **PORT-03**: User sees a treemap heatmap (`heatmap`, `heatmap-cell-{TICKER}`) sized by portfolio weight, where `data-pnl` is up/down/flat and the rendered background color agrees (green for up, red for down)
- [ ] **PORT-04**: User sees a canvas P&L line chart (`pnl-chart`, `data-points`) of total portfolio value from `/api/portfolio/history`

### AI Chat

- [ ] **CHAT-01**: User can send a message (`chat-input`, `chat-send`) and see their message and the assistant reply (`chat-message` with `data-role`), with a `chat-loading` indicator while waiting
- [ ] **CHAT-02**: Trades and watchlist changes executed by the AI appear inline as `chat-action` (`data-kind="trade"|"watchlist"`), and the portfolio, positions, and watchlist update to match
- [ ] **CHAT-03**: Failed AI trades are explained in the assistant message text (e.g. "insufficient shares")
- [ ] **CHAT-04**: Chat history persists across page reload (fetched from `GET /api/chat` on mount)

### Delivery

- [ ] **DLVR-01**: The Docker image builds, and the container serves the app and API on port 8000 with the SQLite DB on a persistent volume
- [ ] **DLVR-02**: All 6 Playwright E2E specs pass in Docker via `test/docker-compose.test.yml` with `LLM_MOCK=true`

## v2 Requirements

Deferred to a future release. Tracked but not in the current roadmap.

### Polish

- **PLSH-01**: Watchlist prices flash green/red on each tick, fading over ~500ms
- **PLSH-02**: Each watchlist row shows a sparkline built from SSE ticks since page load

### Testing

- **TEST-01**: Frontend unit tests (Vitest + React Testing Library) for rendering, calculations, and chat

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Authentication / multi-user | Single-user by design (`user_id="default"`) |
| Limit orders, order book, fees, partial fills | Market orders only keep portfolio math simple |
| WebSockets | SSE is enough for one-way push |
| Token-by-token LLM streaming | Cerebras is fast; a loading indicator is enough |
| Trade confirmation dialogs | PLAN.md: fake money, fluid agentic demo |
| Backend price-history endpoint | Charts accumulate SSE ticks client-side, per PLAN.md |
| Cloud deployment (Terraform/App Runner) | PLAN.md stretch goal, not part of "done" |
| Broad backend hardening from CONCERNS.md | Only fix issues that break PLAN.md behavior or tests |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BACK-01 | Phase 1 | Pending |
| BACK-02 | Phase 1 | Pending |
| FND-01 | Phase 1 | Pending |
| FND-02 | Phase 1 | Pending |
| HDR-01 | Phase 1 | Pending |
| HDR-02 | Phase 2 | Pending |
| HDR-03 | Phase 1 | Pending |
| HDR-04 | Phase 1 | Pending |
| WTCH-01 | Phase 1 | Pending |
| WTCH-02 | Phase 3 | Pending |
| WTCH-03 | Phase 3 | Pending |
| WTCH-04 | Phase 3 | Pending |
| WTCH-05 | Phase 3 | Pending |
| CHRT-01 | Phase 3 | Pending |
| CHRT-02 | Phase 3 | Pending |
| TRAD-01 | Phase 2 | Pending |
| TRAD-02 | Phase 2 | Pending |
| PORT-01 | Phase 2 | Pending |
| PORT-02 | Phase 2 | Pending |
| PORT-03 | Phase 2 | Pending |
| PORT-04 | Phase 2 | Pending |
| CHAT-01 | Phase 4 | Pending |
| CHAT-02 | Phase 4 | Pending |
| CHAT-03 | Phase 4 | Pending |
| CHAT-04 | Phase 4 | Pending |
| DLVR-01 | Phase 1 | Pending |
| DLVR-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0

---
*Requirements defined: 2026-09-25*
*Last updated: 2026-09-25 after roadmap creation*
