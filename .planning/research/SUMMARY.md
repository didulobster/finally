# Research Summary: FinAlly Frontend

**Project:** FinAlly — AI Trading Workstation (Frontend)  
**Domain:** Real-time trading terminal frontend (Next.js static export + FastAPI backend, single-user)  
**Researched:** 2026-09-25  
**Confidence:** HIGH

## Executive Summary

FinAlly's frontend is a single-page application (static Next.js export) integrating with an existing FastAPI backend to create a Bloomberg-terminal-style trading workstation. The app streams live prices via Server-Sent Events (SSE), manages a virtual portfolio through REST calls, and provides an AI chat copilot that auto-executes trades and watchlist changes. Success is measured by passing six Playwright E2E specs and building/running cleanly in Docker.

Experts build this by maintaining a strict separation of concerns: one EventSource provider at the app root handles all live prices and feeds them to consumers via React context subscriptions (per-ticker, not one monolithic state blob), REST calls provide durable portfolio/watchlist state that is fetched once and refetched only after actions, and client-side derivations (live P&L, total portfolio value, price history) are computed from the combination of these two sources. This architecture avoids re-render storms (the #1 performance trap identified in research) and keeps the frontend simple: no caching library, no polling intervals, no state drift between browser and backend.

The three highest-risk areas are: (1) **data-testid contract drift** — E2E specs enforce exact attribute names and value formats that are easy to misremember; (2) **hardcoded absolute API/SSE URLs** — breaks the reconnection test which redirects through a local TCP proxy; (3) **canvas-based chart libraries with SSR side effects** — can fail Next.js static export unless guarded by `next/dynamic` or `useEffect`. Mitigation is straightforward (grep for literal `http://`, treat `test/e2e/*.spec.ts` as the API contract, use `{ ssr: false }` for chart imports), and should be baked into the first frontend increment.

## Key Findings

### Recommended Stack

The frontend stack is heavily constrained by (1) the existing Dockerfile's `npm ci` requirement, (2) the E2E specs' assertion of `<canvas>` elements and CSS `backgroundColor` properties, and (3) Next.js static export's build-time rendering. These constraints eliminate many common options and narrow the recommendation to a specific set.

**Core Technologies:**

- **Next.js 16.3.x** (React framework, static export) — Current stable major; `output: 'export'` is documented and first-class. App Router is the default and has no complexity overhead here (single route).
- **React 19.x** — Next.js 16 ships with React 19; required by current `@testing-library/react` 16.x.
- **TypeScript 5.9.x** (not 7.0.2) — TS7 GA'd in July 2026 without its JS/programmatic API (planned for 7.1). The toolchain (ESLint type-aware rules, Vitest, editor plugins) has not confirmed support; staying on 5.9.x avoids two months of bleeding-edge risk on a course capstone.
- **Tailwind CSS 4.x** (with `@tailwindcss/postcss`) — CSS-first config (no `tailwind.config.js` file needed); simpler setup than v3. Matches "no overengineering" principle.
- **Lightweight Charts 5.2.x** (canvas-native charting) — **Hard requirement per E2E contract** (`04-portfolio-viz.spec.ts` asserts `chart.locator("canvas").first()`); Recharts (SVG-only) would fail outright. Built by TradingView, ~45KB, no React wrapper needed.
- **d3-hierarchy 3.1.x** (treemap layout only, not full d3) — E2E spec asserts `getComputedStyle(el).backgroundColor` on heatmap tiles, which only works on real DOM elements with CSS, not SVG `<rect fill>`. Use d3 for squarified layout math only; render tiles as plain `<div>` with Tailwind.
- **Zustand 5.0.x** (state management) — SSE ticks ~500ms across 10 tickers; only affected rows should re-render. Zustand's selector API prevents re-render storms better than React Context alone (which re-renders all consumers on any value change unless manually split).

**Supporting Libraries:**

- **Native `fetch`** (all REST calls) — Only 4-5 endpoints plus one SSE stream; no caching/retry library justified at this scale.
- **Native `EventSource`** (SSE, `/api/stream/prices`) — Built-in auto-reconnect with server-side `retry: 1000`; no custom SSE client needed.
- **Hand-rolled inline SVG sparklines** (~20 lines per component) — Don't instantiate 10 Lightweight Charts instances for decorative elements; one `<svg><polyline>` reused is simpler.

**Development Tools:**

- **Vitest 5.0.x** (unit testing) — Official Next.js path; replaces Jest for new projects. `vitest.config.mts` with `test.environment: 'jsdom'`.
- **React Testing Library 16.3.x** + `@testing-library/jest-dom` 7.x — Peer-compatible with React 19.
- **ESLint 10.x** (flat config, `eslint.config.mjs`) — Latest major; matches `create-next-app` scaffolding.
- **Playwright 1.63.x** (E2E testing) — Already pinned in `test/package.json`; don't change.

See STACK.md for full installation commands, version compatibility matrix, and alternatives-considered rationale.

### Expected Features

The feature landscape is derived directly from PLAN.md, PROJECT.md, and the binding contract of six Playwright E2E specs (`test/e2e/01-06.spec.ts`). Every feature below is required to pass the definition of done: Docker build + all 6 E2E specs green.

**Table Stakes (required, users expect these):**

1. Live-streaming watchlist grid (10 default tickers) with price flash animation (green up / red down, ~500ms fade)
2. Client-accumulated sparklines (one per watchlist row, from SSE ticks since page load)
3. Ticker selection → main detail chart (larger price over time, same data source as sparklines)
4. Trade bar (market buy/sell, any ticker, instant fill, error surfacing)
5. Positions table (ticker, quantity, average cost, current price, unrealized P&L, % change)
6. Portfolio heatmap (treemap visualization, positioned by portfolio weight, colored by P&L — green = profit, red = loss)
7. P&L line chart (portfolio value over time, from `GET /api/portfolio/history` snapshots)
8. AI chat panel (message history, loading indicator, inline execution confirmations for trades/watchlist changes)
9. Chat history persistence (survives page reload via `GET /api/chat`)
10. Watchlist manual add/remove (UI inputs, persistent via SQLite)
11. Header: cash balance + total portfolio value (live, computed from prices every SSE tick) + 3-state connection dot (green/yellow/red)
12. SSE reconnection resilience (native `EventSource` auto-retry; frontend only needs to track state correctly)
13. Numeric text formatting compatible with E2E parsing (no scientific notation; handles currency symbols and negative numbers)

**Differentiators (competitive advantage):**

1. **AI chat that auto-executes trades/watchlist changes** — Demonstrates agentic AI with zero friction; already implemented server-side, frontend renders inline confirmations.
2. **Treemap heatmap colored by live P&L** — Professional terminal visualization; instantly communicates portfolio risk concentration.
3. **Dense, Bloomberg-style dark multi-panel layout** — Visual differentiation; custom dark theme (`#0d1117`, `#1a1a2e` backgrounds; accent yellow `#ecad0a`, blue `#209dd7`, purple `#753991`).
4. **Correlated, event-driven price simulator** — Shows liveliness (flash + sparkline); backend already built, frontend just renders it.

See FEATURES.md for feature dependencies, MVP definition, and E2E contract specs in detail.

### Architecture Approach

The frontend is organized around two independent state sources: **PriceStream** (live, ephemeral, SSE-backed) and **PortfolioStore** (durable, REST-backed). Components combine them at render time to derive live figures (current price, unrealized P&L, total portfolio value). This mirrors the backend's split between `PriceCache` (in-memory) and SQLite (durable) and avoids the common pitfall of polling `/api/portfolio` on a timer for "liveness."

The single most important architectural decision is **per-ticker subscriptions via Zustand selectors**, not one monolithic price object in React state. With SSE ticking ~500ms across 10 tickers, a naive implementation (one `useState` holding all prices) re-renders the entire tree, the watchlist grid, the chart, and the heatmap simultaneously every 500ms — noticeable input lag results. Zustand's selector API ensures only the affected row/chart re-renders.

**Major components (grouped by panel, matching E2E spec structure):**

1. **PriceStream provider** — Owns the single `EventSource('/api/stream/prices')`, exposes `latestPrices`, `priceHistory[ticker]` (capped buffer), and `connectionStatus`.
2. **PortfolioStore provider** — Fetches `GET /api/portfolio` and `GET /api/watchlist` once on mount; exposes `refetch()`, `cash`, `positions`, `watchlist`.
3. **Header** — Total value (computed client-side), cash balance, connection-status dot.
4. **Watchlist panel** — Grid of rows; each reads `PriceStream.latestPrices` and history for sparklines.
5. **Main chart** — Selected ticker's full price history (same data source as sparklines).
6. **Trade bar** — Buy/sell buttons; calls `POST /api/portfolio/trade` and applies response directly.
7. **Positions table** — One row per position; quantity from `PortfolioStore`, live P&L computed from `PriceStream`.
8. **Heatmap** — Treemap of positions using d3-hierarchy for layout; `<div>` tiles with `background-color`.
9. **P&L chart** — Renders `GET /api/portfolio/history` snapshots.
10. **Chat panel** — Message list + input; on response with actions, refetches `PortfolioStore`.

See ARCHITECTURE.md for detailed component responsibilities, data flow, and build-order rationale.

### Critical Pitfalls & Prevention

**1. Hardcoded absolute API/SSE origin** — Breaks `06-sse-reconnect.spec.ts` which uses a TCP proxy. Always use relative paths (`/api/...`).

**2. `data-testid` attribute drift** — E2E specs enforce exact strings. Treat `test/e2e/*.spec.ts` as the API contract; grep for `getByTestId()` calls before building each component.

**3. Re-render storm from SSE ticks** — One shared price blob in React state causes entire tree to re-render every 500ms. Use Zustand selectors or per-ticker subscriptions.

**4. Canvas chart breaks static export** — Lightweight Charts touches `window` at module load. Guard with `next/dynamic({ ssr: false })` or instantiate in `useEffect`.

**5. Multi-page routing collides with SPA fallback** — Keep entire app as one route (`app/page.tsx`); all navigation is client-side state.

**6. `LLM_MOCK` regex contract violations** — Backend recognizes specific patterns. Send raw, unmodified message text; guard send button against double-submit.

**7. E2E specs share portfolio and run order-dependently** — Document ticker allocation per spec; restart container between test runs.

**8. Trade/watchlist error details swallowed** — Parse backend's `detail` field and render verbatim, not generic "Trade failed" message.

See PITFALLS.md for full recovery strategies and warning signs.

## Implications for Roadmap

Based on the research, the frontend is built in **8 sequential phases**, each unblocking the next through strict dependency management:

### Phase 1: Frontend Scaffold & Docker Integration

**Rationale:** Critical blocker — no `frontend/` means Docker build fails before E2E harness can run.

**Deliverables:**
- Next.js project with `output: 'export'` configured
- Tailwind CSS 4.x integration with custom dark theme
- Placeholder `app/page.tsx` 
- `package-lock.json` committed (Dockerfile runs `npm ci`)
- Docker multi-stage build validates static export is produced correctly

**Pitfalls to avoid:** TypeScript 7 bleeding-edge, canvas charts at top-level, hardcoded API origins, non-npm package manager.

**Research flags:** None — established patterns.

---

### Phase 2: PriceStream Provider & Connection Status

**Rationale:** Everything depends on live prices and connection status (E2E `openApp()` blocks on this).

**Deliverables:**
- `lib/priceStream.ts` — Single `EventSource` instance, per-ticker price history buffer (capped ~300 points), connection status derivation
- `components/ConnectionStatus.tsx` — `data-testid="connection-status"`, `data-status` attribute, 3-state dot
- `components/Header.tsx` — Placeholder; cash balance, total-value display, connection-status child
- Zustand store ensuring per-ticker subscriptions

**Pitfalls to avoid:** Hardcoded URLs, monolithic price state, EventSource in remounting component.

**Research flags:** None — SSE and EventSource patterns well-documented.

---

### Phase 3: Watchlist Panel & Sparklines

**Rationale:** First visible feature; depends only on PriceStream and simple REST calls. Unblocks spec `01-fresh-start.spec.ts`.

**Deliverables:**
- `components/watchlist/WatchlistPanel.tsx`, `WatchlistRow.tsx` (`data-testid="watchlist-row-{TICKER}"`, `data-selected`)
- `components/watchlist/Sparkline.tsx` — Inline SVG polyline from `priceHistory[ticker]`
- Price flash animation (CSS transition on green/red background)
- Watchlist add/remove UI
- Ticker selection state (click → fills `trade-ticker`, updates `main-chart` `data-ticker`)

**Pitfalls to avoid:** `data-testid` drift, unmanaged `setTimeout` flash timers, one chart per row.

**Research flags:**
- Price flash CSS animation triggers and prevents "sticking"
- Sparkline normalization edge cases (all same price, single point)

---

### Phase 4: PortfolioStore & Trade Bar & Positions Table

**Rationale:** Introduces durable REST state; enables manual trading and refetch pattern for chat actions.

**Deliverables:**
- `lib/portfolioStore.ts` — Context providing cash, positions, watchlist, `refetch()`, `trade()`
- `components/trade/TradeBar.tsx` — `trade-ticker`, `trade-quantity`, `trade-buy`/`trade-sell` buttons, `trade-result` (renders backend error text verbatim)
- `components/portfolio/PositionsTable.tsx` — `position-row-{TICKER}`, `position-qty-{TICKER}`, live P&L from `PriceStream`
- `positions-empty` placeholder
- Header: live total value (`cash + Σ qty·price`)

**Pitfalls to avoid:** `data-testid` drift, swallowed errors, unsaved trades, trade button not disabled during request, polling for "liveness".

**Research flags:**
- Live P&L calculation math and sign convention
- Trade error display coverage (cash vs. shares cases)

---

### Phase 5: Main Chart & Ticker Selection

**Rationale:** Adds detail view for selected ticker. Reuses `priceHistory[ticker]` from PriceStream (no new data source).

**Deliverables:**
- `components/chart/MainChart.tsx` — `main-chart` wrapper with `data-ticker="{TICKER}"`, visible ticker text
- `price-chart` — Lightweight Charts instance (guarded with `next/dynamic({ ssr: false })` or `useEffect`)
- `chart-price` display — Current price (within 1% of watchlist price)
- Selection → state update wired from watchlist row click

**Pitfalls to avoid:** Chart breaks static export, chart data diverges from watchlist, `data-points` attribute drift.

**Research flags:**
- Lightweight Charts v5 API (series creation syntax)
- Chart performance with live SSE updates

---

### Phase 6: Portfolio Heatmap & P&L Chart

**Rationale:** Visualization tier; depends on trade execution (Phase 4) and price history (Phase 2).

**Deliverables:**
- `components/portfolio/Heatmap.tsx` — d3-hierarchy treemap layout (`d3.treemapSquarify`)
- `heatmap-cell-{TICKER}` tiles — Plain `<div>` elements with `background-color` CSS
- `data-pnl="up"|"down"|"flat"` with rendered color agreement
- `components/portfolio/PnlChart.tsx` — Lightweight Charts rendering `GET /api/portfolio/history` snapshots
- `pnl-chart` with `data-points` attribute

**Pitfalls to avoid:** Packaged treemap components (render SVG, fail color test), `data-pnl` drift, canvas not guarded.

**Research flags:**
- Treemap relayout smoothness as watchlist grows
- P&L chart performance with 100+ snapshots

---

### Phase 7: AI Chat Panel

**Rationale:** Depends on PortfolioStore refetch pattern (Phase 4) being proven. Demonstrates agentic AI.

**Deliverables:**
- `components/chat/ChatPanel.tsx` — Message list, input box, loading state
- `components/chat/ChatMessage.tsx` — `chat-message` with `data-role="user"|"assistant"` (text, not HTML)
- `components/chat/ChatAction.tsx` — `chat-action` with `data-kind="trade"|"watchlist"` (inline confirmations)
- Send button disabled while `chat-loading` present (prevents double-submit)
- `GET /api/chat` on mount (restore history across reloads)
- `POST /api/chat` flow with refetch of PortfolioStore after trades/watchlist changes

**Pitfalls to avoid:** `LLM_MOCK` regex contract violations, double-submit, not refetching PortfolioStore, `data-testid` drift.

**Research flags:**
- Chat action rendering on failed trades
- History reload persistence with special characters

---

### Phase 8: Frontend Unit Tests & Docker/E2E Hardening

**Rationale:** Integration testing and full Docker + Playwright validation. All 6 E2E specs pass consistently.

**Deliverables:**
- Component unit tests (Vitest + React Testing Library) for each major component
- Full `docker compose -f test/docker-compose.test.yml` pass
- All 6 E2E specs green (`01-06`)
- `test/README.md` documenting ticker allocation per spec (prevent test order flakiness)
- CI/CD scripting

**Pitfalls to avoid:** Spec-order dependencies, stale container state assumptions, "looks done but isn't" checklist items.

**Research flags:**
- Full Docker build with clean static export
- E2E flakiness sources (shared state assumptions)

---

### Phase Ordering Rationale

- **Scaffold first** (Phase 1) → unblocks Docker/E2E harness immediately
- **PriceStream & connection status second** (Phase 2) → gates all visual features
- **Watchlist third** (Phase 3) → first observable feature; no REST complexity
- **Portfolio state & trades fourth** (Phase 4) → introduces refetch pattern
- **Charts fifth** (Phase 5) → reuses price history; depends on selection
- **Heatmap & P&L sixth** (Phase 6) → visualization-only; no new data flow
- **Chat seventh** (Phase 7) → depends on refetch pattern from Phase 4
- **Tests & hardening last** (Phase 8) → integration/validation pass

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 2 (PriceStream):** SSE reconnection edge cases; confirm `onerror` + `readyState` derivation works in practice (CONNECTING vs. CLOSED).
- **Phase 5 (Main Chart):** Canvas chart behavior with static export; test `next/dynamic({ ssr: false })` locally with `npm run build` before Docker.
- **Phase 7 (Chat):** PortfolioStore refetch timing and `/api/chat` response shape interplay; test once chat service exists.

Phases with standard patterns (skip research-phase):

- **Phase 1, 3, 4, 6, 8:** Well-documented patterns (Next.js, React, Docker, d3-hierarchy, Vitest).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | HIGH | Verified against npm registry, official Next.js/Tailwind/Lightweight Charts docs. TypeScript 7 deliberately avoided based on GA date and ecosystem maturity. |
| **Features** | HIGH | Derived directly from PLAN.md, .planning/PROJECT.md, and 6 E2E specs. Feature scope entirely constrained by existing backend and test contract. |
| **Architecture** | HIGH | Read directly from backend source code, Dockerfile, docker-compose files, and E2E specs. Patterns confirmed by reading backend's own structure. |
| **Pitfalls** | HIGH | Grounded in this repo's exact codebase. All 8 pitfalls are replicable, not speculative; recovery strategies based on reading code and test assumptions. |
| **Overall** | HIGH | All primary sources (code, official docs, specs) or well-corroborated secondary sources. No single-source inferences. |

### Gaps to Address During Planning

1. **TypeScript 7 ecosystem maturity** — Revisit in 3-4 months when Vitest, ESLint, editor plugins confirm TS7 support.
2. **Frontend not yet started** — Architectural decisions are theoretical; Phase 2-3 should validate per-ticker subscriptions prevent re-render storms (use React DevTools profiler).
3. **Playwright E2E ticker allocation** — Document during Phase 8, but establish convention as soon as second trading spec is written.
4. **Performance at scale** — 50+ ticker watchlist, GBM simulator performance, CSS animation overhead not tested; out of scope for this milestone.
5. **Cloud deployment scenarios** — Single Docker + tmpfs SQLite design; if multi-container/persistent DB emerges, shared-state model needs rethinking.
6. **`next/image` strategy** — Few/no raster images expected for trading terminal; document convention if images discovered.

## Sources

### Primary (HIGH confidence)

- `/Users/wilsonsmacmini/Documents/Code/finally/planning/PLAN.md` — Product/architecture spec
- `/Users/wilsonsmacmini/Documents/Code/finally/.planning/PROJECT.md` — Milestone scope
- `/Users/wilsonsmacmini/Documents/Code/finally/test/e2e/01-06.spec.ts`, `helpers.ts` — Binding frontend contract
- `/Users/wilsonsmacmini/Documents/Code/finally/backend/app/*.py` — Backend implementation details
- `/Users/wilsonsmacmini/Documents/Code/finally/Dockerfile`, `docker-compose*.yml` — Build/deployment expectations
- `/Users/wilsonsmacmini/Documents/Code/finally/.planning/codebase/ARCHITECTURE.md`, `CONCERNS.md` — Backend architecture

### Secondary (MEDIUM-HIGH confidence)

- npm registry — Current versions, peerDependencies, engines (2026-09-25 snapshot)
- Official docs — Next.js (static export, static export, App Router), Tailwind CSS (v4 CSS-first), Lightweight Charts (v5 API), Vitest setup

### Tertiary (Sources from Research Files)

- STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md — All based on primary sources above

---

**Research completed:** 2026-09-25  
**Ready for roadmap:** Yes

*This summary synthesizes STACK.md, FEATURES.md, ARCHITECTURE.md, and PITFALLS.md research outputs. Consult those files for detailed rationale, alternatives considered, and implementation examples.*
