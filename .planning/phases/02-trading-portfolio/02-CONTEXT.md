# Phase 2: Trading & Portfolio - Context

**Gathered:** 2026-09-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Fill the Phase 1 placeholder panels for Trade, Heatmap, P&L and Positions so the user can buy and sell any typed ticker from the trade bar and see the result everywhere: header cash, header total value (live on every tick), positions table, treemap heatmap, and a canvas P&L chart from portfolio snapshots.

Done when: E2E specs `03-trading` and `04-portfolio-viz` pass against the container, and the Phase 1 specs (`01-fresh-start` health/fresh-start, `06-sse-reconnect`) stay green.

Requirements: TRAD-01, TRAD-02, HDR-02, PORT-01, PORT-02, PORT-03, PORT-04.

Not in this phase: watchlist add/remove, ticker selection, main ticker chart (Phase 3); chat (Phase 4); price flash and sparklines (v2).

</domain>

<decisions>
## Implementation Decisions

### Trade bar
- **D-01:** After a successful trade, keep both the ticker and quantity inputs filled, so a trade is easy to repeat or reverse. The E2E `placeTrade` helper uses `fill()`, which overwrites.
- **D-02:** `trade-result` stays visible until the next trade, with no fade timer. On a successful buy it shows a green fill line (e.g. "Bought 5 AAPL @ $190.12"); on a successful sell the fill line uses the neutral text color (e.g. "Sold 1 MSFT @ $415.30"). Amended 2026-09-26 by user decision (UAT G-02-3). On rejection it shows the backend `detail` text verbatim in red (TRAD-02: "insufficient cash" / "insufficient shares").
- **D-03:** The ticker is typed only. Clicking a watchlist row does not prefill the trade bar in this phase.
- **D-04:** Buy and Sell stay enabled while a request is in flight. Nothing is disabled.

### Live portfolio math
- **D-05:** Cash and positions (`ticker`, `quantity`, `avg_cost`) are stored in the single `useTerminal` Zustand store. The client recomputes total value (cash + Σ qty × live SSE price), market value, unrealized P&L and % from the live `prices` map on every tick. There is no periodic refetch of `/api/portfolio`. If a live price is missing, use the API's `current_price`. — **Reversibility:** costly — the header, positions table and heatmap all read these derived values.
- **D-06:** After a trade, write the `portfolio` object from the `POST /api/portfolio/trade` response straight into the store (cash plus positions), with no second fetch. On initial load, keep seeding from `GET /api/portfolio`, as Phase 1 already does.
- **D-07:** In the positions table, current price, unrealized P&L and % change are live from SSE. Quantity and avg cost change only on a trade. A position sold to zero disappears because it is absent from the returned portfolio.
- **D-08:** Positions rows are sorted alphabetically by ticker, matching the backend's `ORDER BY ticker`. Rows never reorder on ticks.

### P&L chart
- **D-09:** Fetch `/api/portfolio/history` on load, after each successful trade, and every 30 s (matching the backend `SNAPSHOT_INTERVAL`).
- **D-10:** Plot stored snapshots only, with no appended live point. The header already shows the live total.
- **D-11:** Use a Lightweight Charts area series. It is green when the latest value is at or above the first snapshot and red when below. Show all snapshots and call `fitContent()` after each update. The container carries `data-testid="pnl-chart"` and `data-points={count}` and must render a `<canvas>`. The chart must be client-only so the static export still builds. `lightweight-charts` is not installed yet, so add it via npm and commit the updated lockfile.

### Claude's Discretion
- **Heatmap:** whether to hand-roll the treemap (a simple squarified or slice-and-dice layout on divs) or use a small library, the tile content (ticker plus P&L %), and the color scale. Hard constraints come from spec 04: `heatmap` container and `heatmap-cell-{TICKER}` tiles with area > 0, `data-pnl` = `up`/`down`/`flat`, and a computed background with green > red for up and red > green for down. Size is by market value weight, and tiles update live with prices (D-05).
- Trade bar layout inside the Trade panel (content-sized since UAT G-02-1), and the input validation UX (the backend returns 400/422 with the text; show it).
- Empty states: `positions-empty` (PORT-02) plus matching muted notes in the heatmap and P&L panels.
- Number formatting follows Phase 1 (`store/format.ts`), and quantities render so `/\b5(\.0+)?\b/` matches.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product spec
- `planning/PLAN.md` — §2 (UX, heatmap/P&L description, colors), §7 (portfolio_snapshots cadence), §8 (portfolio endpoints), §10 (frontend layout, charts)

### E2E contract (binding)
- `test/e2e/03-trading.spec.ts` — buy/sell/partial sell/sell-to-zero, rejected trades, and the cash assertions (spent within 2% of 5 × price)
- `test/e2e/04-portfolio-viz.spec.ts` — heatmap tile color vs `data-pnl`, `pnl-chart` `data-points` > 0 with a visible canvas, and positions rows for every held ticker
- `test/e2e/helpers.ts` — `placeTrade` (fill ticker, fill quantity, click `trade-{side}`), `readNumber`, `waitForPrice`, `openApp`
- `test/docker-compose.test.yml` — container E2E run (specs share one portfolio and run in order)

### Requirements & prior context
- `.planning/REQUIREMENTS.md` — TRAD-01/02, HDR-02, PORT-01..04 with exact testids
- `.planning/phases/01-live-terminal-in-docker/01-CONTEXT.md` — D-01/D-02 grid (panels to fill), D-09 single Zustand store, D-12 relative URLs
- `.planning/research/PITFALLS.md` — canvas SSR and testid drift pitfalls

### Backend
- `backend/app/api.py` — `POST /api/portfolio/trade` returns `{trade, portfolio}`, errors come back as `HTTPException(400, detail)`, `GET /api/portfolio/history`
- `backend/app/portfolio.py` — `get_portfolio()` shape (`cash_balance`, `positions[]` with `quantity`/`avg_cost`/`current_price`/`market_value`/`unrealized_pnl`/`pnl_percent`, `total_value`), error texts
- `backend/app/actions.py` — traded tickers get tracked, so held tickers appear in the SSE stream

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/store/terminal.ts`: `useTerminal` store (`prices`, `cash`, `totalValue`, `status`) and `connect()`. Extend it with positions and derived totals.
- `frontend/store/format.ts`: `formatPrice` and the other number formatters used by the header.
- `frontend/components/Panel.tsx`: `Panel` / `PanelNote`. Replace the Trade, Heatmap, P&L and Positions `PanelNote` bodies in `frontend/app/page.tsx`.
- `frontend/components/Header.tsx`: already renders `total-value` and `cash-balance` from the store, so it only needs the live-derived total.

### Established Patterns
- One Zustand store with narrow selectors; components under `components/`, state under `store/` (never `lib/`)
- Relative `/api/...` fetches; `"use client"` page; Tailwind 4 theme tokens (`bg-up`, `bg-down`, `text-accent`, `text-muted`, `border-border`, `bg-panel`)
- Backend unchanged unless a spec exposes a bug (Phase 1 D-14)

### Integration Points
- SSE `prices` map already includes held tickers (tracked set = watchlist ∪ positions)
- Trade response `portfolio` feeds the store (D-06); successful trades also trigger the P&L history refetch (D-09)

</code_context>

<specifics>
## Specific Ideas

- Trade result copy on success, e.g. "Bought 5 AAPL @ $190.12" / "Sold 1 MSFT @ $415.30".
- The P&L area turns green or red relative to the first snapshot (the $10k start on a fresh DB).

</specifics>

<deferred>
## Deferred Ideas

- Clicking a watchlist row prefills the trade bar ticker. This belongs in Phase 3, once the selected ticker exists in the store.

</deferred>

---

*Phase: 02-trading-portfolio*
*Context gathered: 2026-09-26*
