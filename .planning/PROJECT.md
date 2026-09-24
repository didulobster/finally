# FinAlly — AI Trading Workstation

## What This Is

FinAlly (Finance Ally) is a single-container, Bloomberg-style trading workstation. It streams live (simulated or real) market data, lets the user trade a $10k virtual portfolio, and includes an AI chat copilot that analyzes positions and executes trades and watchlist changes on the user's behalf. It is the capstone project for an agentic AI coding course, built entirely by coding agents. The full spec is `planning/PLAN.md`.

## Core Value

One `docker run` opens `http://localhost:8000` to a live, data-dense trading terminal. Prices stream, trades fill instantly, and the AI assistant can trade by natural language. The whole flow is proven by the E2E suite passing in Docker.

## Requirements

### Validated

<!-- Inferred from existing backend code (75 pytest tests passing as of 2026-09-25). Still to be verified against PLAN.md during the backend verification phase. -->

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
- ✓ Multi-stage Dockerfile, docker-compose, and start/stop scripts (mac and Windows) — existing (untested: the build needs a frontend)
- ✓ Playwright E2E suite (6 specs) and `test/docker-compose.test.yml` — existing (cannot pass yet: no frontend)

### Active

- [ ] Verify the backend against PLAN.md end to end; fill any gaps and fix real bugs (keep the existing code, no rewrite)
- [ ] Next.js + TypeScript static-export frontend in `frontend/`, Tailwind dark theme
- [ ] Watchlist panel: ticker, live price with green/red flash, change %, sparkline accumulated from SSE
- [ ] Main chart for the selected ticker (click in the watchlist to select)
- [ ] Portfolio heatmap (treemap sized by weight, colored by P&L)
- [ ] P&L line chart from portfolio snapshots
- [ ] Positions table (ticker, qty, avg cost, price, unrealized P&L, % change)
- [ ] Trade bar (ticker, quantity, buy/sell market orders)
- [ ] AI chat panel (history, loading state, inline trade and watchlist confirmations)
- [ ] Header with live total value, cash balance, and connection status dot (green/yellow/red)
- [ ] Watchlist add/remove from the UI
- [ ] Frontend unit tests (component rendering, flash, calculations, chat)
- [ ] Docker image builds; the container serves the app on :8000 with a persistent volume
- [ ] All 6 existing Playwright E2E specs pass in Docker with `LLM_MOCK=true`

### Out of Scope

- Authentication and multi-user support — single-user by design (`user_id="default"`)
- Limit orders, order book, fees, partial fills — market orders only, for simple portfolio math
- WebSockets — SSE is enough for one-way push
- Token-by-token LLM streaming — Cerebras is fast enough; a loading indicator is enough
- Cloud deployment (Terraform/App Runner in `deploy/`) — stretch goal, not part of "done"
- Broad backend hardening from CONCERNS.md (indexes, logging config, graceful shutdown, etc.) — only fix issues that break PLAN.md behavior or tests

## Context

- Brownfield: the backend (`backend/app/`), Docker setup, scripts, and E2E specs already exist; `frontend/` does not. The codebase map is in `.planning/codebase/`.
- Because the frontend is missing, the Docker build fails and no E2E spec can run. That is the critical blocker.
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
| Keep and verify the existing backend, don't rebuild | Most of PLAN.md is already implemented and tested (75 passing) | — Pending |
| Definition of done = Docker build + all 6 E2E specs green | An objective, end-to-end proof of the full spec | — Pending |
| Existing E2E specs are the frontend contract | They already encode the expected UI hooks and flows | — Pending |
| Cloud deploy excluded from v1 | PLAN.md marks it as a stretch goal | — Pending |

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
*Last updated: 2026-09-25 after initialization*
