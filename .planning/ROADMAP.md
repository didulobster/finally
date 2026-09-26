# Roadmap: FinAlly — AI Trading Workstation

## Overview

The backend, Docker setup, scripts, and E2E suite already exist. The missing piece is the frontend, and without it the Docker build fails. This roadmap builds the app as four vertical slices, each one usable end to end in the browser at `http://localhost:8000`. Phase 1 verifies the backend and gets a live terminal shell running in Docker (streaming watchlist, cash, connection status). Phase 2 adds manual trading and the portfolio views. Phase 3 adds watchlist management and the selected-ticker chart. Phase 4 adds the AI chat copilot and finishes with all six Playwright specs passing in Docker. The six specs in `test/e2e/` are the binding frontend contract throughout.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Live Terminal in Docker** - Verified backend plus a Next.js shell served from the container, streaming the default watchlist with cash and connection status
- [ ] **Phase 2: Trading & Portfolio** - Buy/sell from the trade bar and see positions, heatmap, P&L chart, and live total value
- [ ] **Phase 3: Watchlist Management & Ticker Chart** - Add/remove tickers that persist, and click a ticker to see its live chart
- [ ] **Phase 4: AI Copilot & Definition of Done** - Chat with the AI to analyze, trade, and manage the watchlist; all 6 E2E specs green in Docker

## Phase Details

### Phase 1: Live Terminal in Docker

**Goal**: One `docker run` opens a dark trading terminal on :8000 that shows the 10 default tickers with streaming prices, $10k cash, and a connection status dot that survives a network drop
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: BACK-01, BACK-02, FND-01, FND-02, HDR-01, HDR-03, HDR-04, WTCH-01, DLVR-01
**Success Criteria** (what must be TRUE):

  1. The Docker image builds, and the running container serves the frontend and `/api/health` on port 8000, with the SQLite DB on a persistent volume
  2. On a fresh start, the user sees exactly the 10 default tickers with prices that change live, a $10,000 cash balance, and a total value of $10,000
  3. The header status dot shows connected (green) while streaming, changes to reconnecting/disconnected when the stream drops, and returns to connected with prices resuming, without a page reload
  4. The backend has been checked against PLAN.md (market data, SSE, DB init/seed, portfolio, watchlist, chat, health), any gaps that break PLAN.md behavior are fixed, and the existing pytest suite passes
  5. The E2E specs `01-fresh-start` (health and fresh-start tests) and `06-sse-reconnect` pass against the container

**Plans**: 4/6 plans executed (01-04..01-06 are UAT gap closure)

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Verify the backend against PLAN.md §5-§9 on a live fresh-DB server; fix only breaking gaps test-first (BACK-01, BACK-02)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Walking skeleton: Next.js static export built and served by the Docker container, then one Zustand store + one EventSource driving header, status and 10 live rows (local E2E green)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — Full D-01 terminal grid (panels, collapsible chat drawer, 100vh), then the Docker E2E phase gate for 01-fresh-start + 06-sse-reconnect

**Wave 4** *(gap closure: G-01-1)*

- [x] 01-04-PLAN.md — Restore the canonical Phase 1 frontend build (tsconfig alias, zustand, lockfile from 9745561^), remove frontend/src and vitest, anchor .gitignore Python rules (WR-02), restore local-run docs

**Wave 5** *(gap closure: G-01-2; blocked on Wave 4 completion)*

- [ ] 01-05-PLAN.md — Reopen the price stream after the browser closes it on a non-200 reconnect (WR-01), proven by a committed 502 probe (red before, green after) with one live EventSource

**Wave 6** *(gap closure: G-01-1, G-01-2; blocked on Wave 5 completion)*

- [ ] 01-06-PLAN.md — Phase gate at HEAD: rebuild the `finally` image tag, prove the grid and 502 recovery in a container, rerun 01-fresh-start + 06-sse-reconnect on the compose path, pytest

**UI hint**: yes

### Phase 2: Trading & Portfolio

**Goal**: The user can trade from the trade bar and see the result across the portfolio: cash, positions table, heatmap, P&L chart, and live total value
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: TRAD-01, TRAD-02, HDR-02, PORT-01, PORT-02, PORT-03, PORT-04
**Success Criteria** (what must be TRUE):

  1. The user can buy or sell any ticker by typing a ticker and quantity; cash changes immediately and the position appears, updates, or disappears (when sold to zero) in the positions table
  2. A rejected trade (insufficient cash or insufficient shares) shows the backend error text in the trade result area and leaves cash and positions unchanged
  3. The header total value equals cash plus live positions value, and it updates on every price tick and after every trade
  4. With positions held, the user sees a treemap heatmap sized by weight, with tiles colored green for profit and red for loss, and a canvas P&L line chart of portfolio value from snapshots; with no positions, an empty-positions message is shown
  5. The E2E specs `03-trading` and `04-portfolio-viz` pass against the container

**Plans**: TBD
**UI hint**: yes

### Phase 3: Watchlist Management & Ticker Chart

**Goal**: The user can curate their watchlist and drill into any ticker's live price chart
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: WTCH-02, WTCH-03, WTCH-04, WTCH-05, CHRT-01, CHRT-02
**Success Criteria** (what must be TRUE):

  1. The user can add a ticker by typing it in any case; it appears uppercased with a live price, and a remove control appears on row hover and removes it
  2. Watchlist additions and removals are still there after a page reload
  3. Clicking a watchlist row marks it selected, fills the trade bar ticker, and switches the main chart to that ticker
  4. The main chart is a canvas price chart that fills in from live ticks since selection and shows a current price that matches the watchlist price (within 1%)
  5. The E2E spec `02-watchlist` and the `01-fresh-start` ticker-selection test pass against the container

**Plans**: TBD
**UI hint**: yes

### Phase 4: AI Copilot & Definition of Done

**Goal**: The user can talk to the AI assistant, which analyzes the portfolio and executes trades and watchlist changes inline, and the whole app is proven by the full E2E suite in Docker
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04, DLVR-02
**Success Criteria** (what must be TRUE):

  1. The user can send a chat message, sees a loading indicator while waiting, and then sees both their message and the assistant reply
  2. When the AI executes a trade or watchlist change, it appears inline as a confirmation, and the cash, positions, and watchlist update to match without a reload
  3. When an AI trade fails (for example, insufficient shares), the assistant reply explains why and the portfolio is unchanged
  4. Chat history is still there after a page reload
  5. All 6 Playwright E2E specs pass in Docker via `test/docker-compose.test.yml` with `LLM_MOCK=true`

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Live Terminal in Docker | 4/6 | In Progress|  |
| 2. Trading & Portfolio | 0/TBD | Not started | - |
| 3. Watchlist Management & Ticker Chart | 0/TBD | Not started | - |
| 4. AI Copilot & Definition of Done | 0/TBD | Not started | - |
