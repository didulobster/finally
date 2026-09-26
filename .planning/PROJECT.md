# FinAlly — AI Trading Workstation

## What This Is

FinAlly (Finance Ally) is a single-container, Bloomberg-style trading workstation. It streams live (simulated or real) market data, lets the user trade a $10k virtual portfolio, and includes an AI chat copilot that analyzes positions and executes trades and watchlist changes on the user's behalf. It is the capstone project for an agentic AI coding course, built entirely by coding agents. The full spec is `planning/PLAN.md`.

## Core Value

One `docker run` opens `http://localhost:8000` to a live, data-dense trading terminal. Prices stream, trades fill instantly, and the AI assistant can trade by natural language. The whole flow is proven by the E2E suite passing in Docker.

## Requirements

### Validated

<!-- Backend items were inferred from existing code, then verified against PLAN.md in Phase 1 (01-BACKEND-VERIFICATION.md, 75 pytest passing). -->

- ✓ Market data abstraction with a GBM simulator (correlated moves, random events) and a Massive REST poller, selected by `MASSIVE_API_KEY` — existing
- ✓ In-memory price cache (price, previous price, timestamp) fed by one background task — existing
- ✓ SSE endpoint `GET /api/stream/prices` pushing price updates — existing
- ✓ SQLite with lazy schema init and seed (default user with $10k, 10 default tickers) — existing
- ✓ Portfolio endpoints: `GET /api/portfolio`, `POST /api/portfolio/trade`, `GET /api/portfolio/history` — existing
- ✓ Watchlist endpoints: `GET/POST /api/watchlist`, `DELETE /api/watchlist/{ticker}` — existing
- ✓ Chat endpoint `POST /api/chat` using LiteLLM → OpenRouter (Cerebras) with structured output, auto-execution of trades and watchlist changes, and `LLM_MOCK` mode — existing
- ✓ Portfolio snapshots recorded in the background and after trades — existing
- ✓ `GET /api/health` — existing
- ✓ FastAPI static serving of the SPA export — existing
- ✓ Multi-stage Dockerfile, docker-compose, and start/stop scripts (mac and Windows) — existing; image builds and serves on :8000 — Phase 1
- ✓ Playwright E2E suite (6 specs) and `test/docker-compose.test.yml` — existing (01-fresh-start and 06-sse-reconnect pass in Docker — Phase 1)
- ✓ Backend verified against PLAN.md end to end, no breaking gaps (BACK-01/02) — Phase 1
- ✓ Next.js + TypeScript static-export frontend in `frontend/`, Tailwind dark theme, same-origin `/api` calls (FND-01/02) — Phase 1
- ✓ Header with cash balance and connection status dot; stream recovers without reload, including after a non-200 reconnect (HDR-01/03/04) — Phase 1
- ✓ Watchlist panel with the 10 default tickers, live price and change % (WTCH-01) — Phase 1
- ✓ Docker image builds; container serves the app on :8000 with a persistent volume (DLVR-01) — Phase 1

### Active

- [ ] Main chart for the selected ticker (click in the watchlist to select)
- [ ] Portfolio heatmap (treemap sized by weight, colored by P&L)
- [ ] P&L line chart from portfolio snapshots
- [ ] Positions table (ticker, qty, avg cost, price, unrealized P&L, % change)
- [ ] Trade bar (ticker, quantity, buy/sell market orders)
- [ ] AI chat panel (history, loading state, inline trade and watchlist confirmations)
- [ ] Header total value updating live on every tick and after trades (HDR-02)
- [ ] Watchlist add/remove from the UI
- [ ] All 6 existing Playwright E2E specs pass in Docker with `LLM_MOCK=true`

### Out of Scope

- Authentication and multi-user support — single-user by design (`user_id="default"`)
- Limit orders, order book, fees, partial fills — market orders only, for simple portfolio math
- WebSockets — SSE is enough for one-way push
- Token-by-token LLM streaming — Cerebras is fast enough; a loading indicator is enough
- Cloud deployment (Terraform/App Runner in `deploy/`) — stretch goal, not part of "done"
- Price flash animation, sparklines, frontend unit tests — deferred to v2 (not checked by E2E; user choice)
- Broad backend hardening from CONCERNS.md (indexes, logging config, graceful shutdown, etc.) — only fix issues that break PLAN.md behavior or tests

## Context

- Brownfield: the backend (`backend/app/`), Docker setup, scripts, and E2E specs already existed. Phase 1 added the `frontend/` shell (app/, components/, store/) with the full D-01 panel grid; unbuilt panels show only an "arrives in Phase N" note. The codebase map is in `.planning/codebase/`.
- The Docker build works; `scripts/start_mac.sh` reuses an existing `finally` image unless passed `--build`, so rebuild after frontend changes.
- The E2E specs in `test/e2e/` define `data-testid` hooks and flows and **are the frontend contract**. Change a spec only if it contradicts PLAN.md.
- Market data design docs: `planning/MARKET_DATA_SUMMARY.md` and `planning/archive/`.
- LLM calls use the project's `cerebras` skill: LiteLLM → OpenRouter, model `openrouter/openai/gpt-oss-120b`, Cerebras provider, structured outputs.
- In the sandbox, uv needs `UV_CACHE_DIR=$TMPDIR/uvcache` to run.

## Constraints

- **Tech stack**: FastAPI + uv (Python 3.12), Next.js TypeScript static export, Tailwind, SQLite, SSE — fixed by PLAN.md
- **Deployment**: single container, single port 8000; the frontend is served by FastAPI from the same origin (no CORS)
- **Charts**: canvas-based library preferred (Lightweight Charts or Recharts)
- **Visual**: dark theme (~`#0d1117`/`#1a1a2e`), accent `#ecad0a`, blue `#209dd7`, purple `#753991` for submit buttons
- **Code style**: simple, incremental, no overengineering, no defensive programming, latest APIs; `uv run`/`uv add` only
- **Testing**: E2E runs with `LLM_MOCK=true` via `test/docker-compose.test.yml`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep and verify the existing backend, don't rebuild | Most of PLAN.md is already implemented and tested (75 passing) | ✓ Good — Phase 1 found no breaking gaps; no backend changes needed |
| Definition of done = Docker build + all 6 E2E specs green | An objective, end-to-end proof of the full spec | — Pending |
| Existing E2E specs are the frontend contract | They already encode the expected UI hooks and flows | ✓ Good — binding specs kept unchanged; Phase 1 specs pass |
| Cloud deploy excluded from v1 | PLAN.md marks it as a stretch goal | — Pending |
| Phase 1 frontend tree (app/, components/, store/) is canonical; `frontend/src` and vitest removed | A second app tree broke the build (G-01-1) | ✓ Good — build restored (01-04) |
| Reopen the EventSource 3 s after readyState CLOSED (amends D-10) | Browser stops retrying after a non-200 reconnect (WR-01, UAT "fix it now") | ✓ Good — 502 probe passes, one live stream at a time (01-05) |
| Zustand single store + one EventSource via `connect()` | Simple shared state for header, watchlist, later panels | — Pending (validate as panels land) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-26 after Phase 1*
