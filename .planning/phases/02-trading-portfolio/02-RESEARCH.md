# Phase 2: Trading & Portfolio - Research

**Researched:** 2026-09-26
**Domain:** Next.js 16 static-export frontend: trade bar, derived live portfolio math in the Zustand store, a treemap heatmap on divs, and a Lightweight Charts v5 area chart. No backend changes are expected.
**Confidence:** HIGH for the E2E contract, backend shapes and library APIs (read or probed this session). MEDIUM for layout details that only a real build and run will confirm.

## Summary

The backend already returns what Phase 2 needs. `POST /api/portfolio/trade` returns `{trade, portfolio}` on success and `HTTPException(400, str(e))` on business errors. The error texts start with `Insufficient cash:` and `Insufficient shares:`, which match the spec regexes `/insufficient cash/i` and `/insufficient shares/i`. `GET /api/portfolio/history` returns `[{total_value, recorded_at}]` ordered by time. A snapshot is recorded at startup, after every trade, and every 30 s, so history is never empty on a running server. The SSE stream carries every tracked ticker (watchlist ∪ held), so live prices exist for positions outside the watchlist. All Phase 2 work is frontend.

The work splits into two parts. **(1) Store and trade flow:** extend `useTerminal` with `positions` and `history`. Replace the stored `totalValue` with a derived selector (cash + Σ qty × live price). Add a `placeTrade()` that writes the response `portfolio` into the store (D-06), and build the TradeBar and PositionsTable. That part makes `03-trading` pass and keeps `01-fresh-start` green. **(2) Visualisations:** a Heatmap made of absolutely positioned divs laid out by `d3-hierarchy`'s `treemapSquarify`, and a P&L chart from `lightweight-charts` 5.2.1 `AreaSeries`. That part makes `04-portfolio-viz` pass.

Probes this session turned up four traps that would otherwise fail the specs or the lint gate:
1. **Tailwind opacity modifiers break the heatmap color assertion.** In Chromium, `color-mix(in oklab, …)` computes to `oklab(0.695076 -0.149288 0.102169 / 0.6)`. The spec's `rgb()` parser then reads the wrong channels, so "up" tiles would fail `g > r`. Use inline `rgb()`/`rgba()` or a hex theme var instead.
2. **Lightweight Charts needs strictly ascending, unique times.** The dev build asserts this. Snapshot `recorded_at` values often share a second (several trades in quick succession), so dedupe by whole second.
3. **`react-hooks/set-state-in-effect` is a lint error.** It is on in the repo's eslint config, so derive `data-points` in render and never `setState` synchronously in an effect.
4. **Zustand v5 selectors must return stable references.** Otherwise React throws "Maximum update depth exceeded".

**Primary recommendation:** Build it in two sequential plans. Plan A covers the store, TradeBar, PositionsTable and the Header total, gated by `03-trading` plus `01-fresh-start`. Plan B covers the Heatmap (`d3-hierarchy`) and the P&L chart (`lightweight-charts`), gated by `04-portfolio-viz`. After that, run the full Phase 2 Docker gate. Gate every plan with `npm run lint` and `npm run build` before E2E.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Trade bar
- **D-01:** After a successful trade, keep both the ticker and quantity inputs filled, so a trade is easy to repeat or reverse. The E2E `placeTrade` helper uses `fill()`, which overwrites.
- **D-02:** `trade-result` stays visible until the next trade, with no fade timer. On success it shows a green fill line (e.g. "Bought 5 AAPL @ $190.12"). On rejection it shows the backend `detail` text verbatim in red (TRAD-02: "insufficient cash" / "insufficient shares").
- **D-03:** The ticker is typed only. Clicking a watchlist row does not prefill the trade bar in this phase.
- **D-04:** Buy and Sell stay enabled while a request is in flight. Nothing is disabled.

#### Live portfolio math
- **D-05:** Cash and positions (`ticker`, `quantity`, `avg_cost`) are stored in the single `useTerminal` Zustand store. The client recomputes total value (cash + Σ qty × live SSE price), market value, unrealized P&L and % from the live `prices` map on every tick. There is no periodic refetch of `/api/portfolio`. If a live price is missing, use the API's `current_price`. — **Reversibility:** costly — the header, positions table and heatmap all read these derived values.
- **D-06:** After a trade, write the `portfolio` object from the `POST /api/portfolio/trade` response straight into the store (cash plus positions), with no second fetch. On initial load, keep seeding from `GET /api/portfolio`, as Phase 1 already does.
- **D-07:** In the positions table, current price, unrealized P&L and % change are live from SSE. Quantity and avg cost change only on a trade. A position sold to zero disappears because it is absent from the returned portfolio.
- **D-08:** Positions rows are sorted alphabetically by ticker, matching the backend's `ORDER BY ticker`. Rows never reorder on ticks.

#### P&L chart
- **D-09:** Fetch `/api/portfolio/history` on load, after each successful trade, and every 30 s (matching the backend `SNAPSHOT_INTERVAL`).
- **D-10:** Plot stored snapshots only, with no appended live point. The header already shows the live total.
- **D-11:** Use a Lightweight Charts area series. It is green when the latest value is at or above the first snapshot and red when below. Show all snapshots and call `fitContent()` after each update. The container carries `data-testid="pnl-chart"` and `data-points={count}` and must render a `<canvas>`. The chart must be client-only so the static export still builds. `lightweight-charts` is not installed yet, so add it via npm and commit the updated lockfile.

### Claude's Discretion
- **Heatmap:** whether to hand-roll the treemap (a simple squarified or slice-and-dice layout on divs) or use a small library, the tile content (ticker plus P&L %), and the color scale. Hard constraints come from spec 04: `heatmap` container and `heatmap-cell-{TICKER}` tiles with area > 0, `data-pnl` = `up`/`down`/`flat`, and a computed background with green > red for up and red > green for down. Size is by market value weight, and tiles update live with prices (D-05).
- Trade bar layout inside the existing `md:h-24` Trade panel, and the input validation UX (the backend returns 400/422 with the text; show it).
- Empty states: `positions-empty` (PORT-02) plus matching muted notes in the heatmap and P&L panels.
- Number formatting follows Phase 1 (`store/format.ts`), and quantities render so `/\b5(\.0+)?\b/` matches.

### Deferred Ideas (OUT OF SCOPE)
- Clicking a watchlist row prefills the trade bar ticker. This belongs in Phase 3, once the selected ticker exists in the store.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TRAD-01 | Buy/sell any typed ticker and quantity via `trade-ticker`, `trade-quantity`, `trade-buy`, `trade-sell` | Pattern 2 (`placeTrade` store action), Code Example "TradeBar"; backend normalizes ticker case (`actions.py:16-21`) |
| TRAD-02 | Rejected trade shows backend error text verbatim in `trade-result`; cash/positions unchanged | Backend texts `portfolio.py:30,36`; 400 vs 422 `detail` shapes (Pitfall 5); store is only written on `r.ok` |
| HDR-02 | `total-value` = cash + live positions value, updating every tick and after every trade | Pattern 1 (derived `selectTotalValue` primitive selector); remove stored `totalValue` |
| PORT-01 | Positions table with `position-row-{T}`, `position-qty-{T}`, ticker/qty/avg cost/current/P&L/%; sold-to-zero disappears | Pattern 1 + per-row live price selector; backend deletes row at qty ≤ EPSILON (`portfolio.py:42-43`) |
| PORT-02 | `positions-empty` when no positions | Empty state branch in PositionsTable |
| PORT-03 | Treemap `heatmap`, `heatmap-cell-{T}` sized by weight, `data-pnl` up/down/flat with agreeing computed color | Pattern 3 (d3-hierarchy squarify, percent positioning), Pitfall 1 (color serialization, probed) |
| PORT-04 | Canvas P&L chart `pnl-chart` with `data-points` from `/api/portfolio/history` | Pattern 4 (LWC v5 AreaSeries in `useEffect`), Pitfall 2 (unique ascending times), Pitfall 3 (lint) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Keep it simple and incremental, and validate each increment. Do not overengineer, do not program defensively, and use try/except or try/catch only where needed.
- Use the latest library APIs. Use `uv run` / `uv add` for Python (not needed this phase: no backend changes).
- Prefer short modules and functions with clear names and concise docstrings. Use few comments outside docstrings.
- Stack is fixed: Next.js TypeScript static export (`output: 'export'`), Tailwind, FastAPI, SQLite, SSE. The app is single-origin, so use only relative `/api/...` URLs (FND-02, Phase 1 D-12).
- Charts must be canvas-based (Lightweight Charts or Recharts). CONTEXT D-11 locks Lightweight Charts.
- Visual: dark theme (~`#0d1117`/`#1a1a2e`), accent `#ecad0a`, blue `#209dd7`, purple `#753991` for submit buttons.
- E2E runs with `LLM_MOCK=true` via `test/docker-compose.test.yml`. Specs share one portfolio and run in file order.
- Phase 1 conventions: one Zustand store (`useTerminal`) with narrow selectors, and state code under `store/` (never `lib/`, which the root `.gitignore` swallows). Components go under `components/`, and the page is a `"use client"` page.
- `frontend/AGENTS.md`: "This is NOT the Next.js you know… Read the relevant guide in `node_modules/next/dist/docs/` before writing any code." Next is 16.3.6.
- GSD workflow: edits happen inside `/gsd-execute-phase`.
- Backend stays unchanged unless a spec exposes a bug (Phase 1 D-14).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Trade validation and fill (cash/shares checks, price) | API / Backend | Database | Already implemented in `portfolio.execute_trade` under `BEGIN IMMEDIATE`; the browser must never pre-validate business rules |
| Ticker normalization (case, 1-5 letters) | API / Backend | — | `actions.normalize_ticker`; frontend sends raw input |
| Cash + positions state after trade | Browser (Zustand) | API (response `portfolio`) | D-06: response is source of truth, written straight into the store |
| Live total value, market value, P&L, % | Browser (derived from store) | — | D-05: recomputed from SSE `prices` on every tick; no refetch |
| Snapshot recording (history) | API / Backend | Database | Startup + every 30 s + after each trade (`main.py`, `actions.py`) |
| P&L chart rendering | Browser (canvas, client-only effect) | — | Lightweight Charts in `useEffect`; static export never runs it |
| Treemap layout | Browser | — | Pure function of positions × prices; recomputed each render |

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.3.6 | Static export app | Locked by Phase 1 [VERIFIED: `npm ls` in frontend] |
| react / react-dom | 19.2.8 | UI | [VERIFIED: `npm ls`] |
| zustand | 5.0.15 | Single store `useTerminal` | Phase 1 D-09 [VERIFIED: `npm ls`; registry latest is 5.0.15] |
| tailwindcss | ^4 | Styling, theme tokens in `app/globals.css` | Phase 1 [VERIFIED: frontend/package.json] |

### New for this phase
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lightweight-charts | 5.2.1 | P&L area chart (canvas) | Locked by D-11 [VERIFIED: npm registry `version = '5.2.1'`, modified 2026-08-12; Context7 `/tradingview/lightweight-charts` v5.2.0 docs] |
| d3-hierarchy | 3.1.2 | Squarified treemap layout math | Heatmap tile rectangles (Claude's discretion; recommended) [VERIFIED: npm registry `3.1.2`; API probed in Node this session] |
| @types/d3-hierarchy (dev) | 3.1.7 | Types. `d3-hierarchy` ships no `.d.ts` (its package dir has only `LICENSE README.md dist package.json src`) | Needed because TS strict build [VERIFIED: npm registry `3.1.7`; package listing probed] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| d3-hierarchy | Hand-rolled squarify | About 40 lines of fiddly aspect-ratio math that has to be tested. d3's version is the reference implementation, has 22M downloads a week and no dependencies. |
| d3-hierarchy | Flex "slice" layout (`flex-grow: weight` in one row) | Zero dependencies and about 10 lines, but tiles become thin slivers with 5+ positions. Acceptable only if the user rejects a new dependency. |
| d3-hierarchy | Recharts `<Treemap>` | Pulls in all of Recharts for one SVG widget. It would also be a second chart library next to LWC. |
| lightweight-charts | Recharts LineChart | Ruled out by D-11. |

**Installation (from `frontend/`):**
```bash
npm install lightweight-charts@5.2.1 d3-hierarchy@3.1.2
npm install -D @types/d3-hierarchy@3.1.7
```
Commit `package.json` and `package-lock.json`, since the Docker stage runs `npm ci`. In the agent sandbox, `~/.npm` has root-owned files (EPERM). Run npm with `npm_config_cache="$TMPDIR/npmcache"` and allow `registry.npmjs.org` [VERIFIED: probed this session].

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| lightweight-charts | npm | ~7 yrs (created 2019-05-28) | 975,780/wk | github.com/tradingview/lightweight-charts | SUS (seam: no observation) → manual OK | Approved. Locked by D-11 and documented in Context7 |
| d3-hierarchy | npm | ~11 yrs (created 2015-11-04) | 22,292,908/wk | github.com/d3/d3-hierarchy | SUS (seam: no observation) → manual OK | Approved |
| @types/d3-hierarchy | npm | DefinitelyTyped | (not fetched) | github.com/DefinitelyTyped/DefinitelyTyped | SUS (seam: no observation) | Approved; the standard DefinitelyTyped types package |

**Seam note:** `gsd-tools query package-legitimacy check` returned `SUS` for all three, with every signal `null` (`exists: null, publishedAt: null, weeklyDownloads: null`). That is a failed lookup, probably because the sandbox blocked the tool's network access. It is **no observation**, not a negative finding. Manual checks this session: `npm view` returned the versions and the repository URLs above, and `api.npmjs.org/downloads` returned the download counts. `npm view … scripts.postinstall` printed nothing for any of the three, so there is no postinstall script. `lightweight-charts`' only dependency is `fancy-canvas: 2.1.0`, and `@types/d3-hierarchy` has `dependencies = {}`.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** all three were flagged by the seam's failed lookup only. The planner can either accept the manual verification above or add a single `checkpoint:human-verify` before `npm install`.

## Architecture Patterns

### System Architecture Diagram

```
 Trade bar (ticker, qty, Buy/Sell)
        │ placeTrade()
        ▼
 POST /api/portfolio/trade ──400/422──► trade-result (red, detail verbatim)   store untouched
        │ 200 {trade, portfolio}
        ├──► applyPortfolio(portfolio) ─► store.cash, store.positions
        ├──► trade-result (green "Bought 5 AAPL @ $190.12")
        └──► loadHistory() ─► GET /api/portfolio/history ─► store.history
                                                            ▲
                         mount + every 30 s ────────────────┘

 GET /api/portfolio (mount) ─► applyPortfolio ─► store.cash, store.positions
 EventSource /api/stream/prices (Phase 1) ─► store.prices  (every ~500 ms)

 store {cash, positions, prices, history}
   ├─ selectTotalValue (number) ─► Header total-value (live)
   ├─ positions + prices[t].price ─► PositionsTable rows (live price/P&L/%)
   ├─ positions + prices ─► treemap layout ─► Heatmap tiles (size=value, color=P&L sign)
   └─ history ─► dedupe by second ─► LWC AreaSeries.setData + fitContent ─► pnl-chart canvas
```

### Recommended Project Structure (additions only)
```
frontend/
├── store/
│   ├── terminal.ts      # + positions, history, applyPortfolio, loadHistory, placeTrade; drop totalValue
│   └── portfolio.ts     # pure derived math: livePrice, marketValue, pnl, selectTotalValue
├── components/
│   ├── TradeBar.tsx     # inputs, Buy/Sell, trade-result
│   ├── Positions.tsx    # table + positions-empty
│   ├── Heatmap.tsx      # d3-hierarchy squarify → absolutely positioned divs
│   └── PnlChart.tsx     # lightweight-charts area series
└── app/page.tsx         # swap four PanelNote bodies for the components
```

### Pattern 1: Derived live values, stored raw inputs
**What:** Store only what the server gave (`cash`, `positions[]` with `ticker, quantity, avg_cost, current_price`). Compute value, P&L and total at read time from `prices`.
**When:** Header total, positions rows, heatmap.
- The Header uses a selector that returns a **number** (a primitive, so it is stable under `Object.is`): `useTerminal(selectTotalValue)`.
- Each position row subscribes to its own price: `useTerminal((s) => s.prices[ticker]?.price)`.
- The Heatmap reads `positions` and `prices` with two separate selectors and computes the layout in render. That re-renders it every tick, which is cheap for a handful of tiles.
- Never write a selector that returns a fresh array or object (e.g. `s => s.positions.map(...)`) without `useShallow`. The simplest rule is not to do it at all.

### Pattern 2: Trade action returns a result; the store is written only on success
`placeTrade(ticker, quantity, side)` lives in `store/terminal.ts`, next to `connect()`. It POSTs, and on `r.ok` it calls `applyPortfolio(body.portfolio)` and `loadHistory()`. It returns `{ ok, text }` for the TradeBar's local `useState`. The result state belongs to the TradeBar alone, so it stays local component state. Only portfolio data goes in the store.

### Pattern 3: Treemap as percent-positioned divs
Lay out in a unit square with `treemap().size([1, 1]).tile(treemapSquarify)`. Render each leaf as `position:absolute` with `left/top/width/height` set as percentages. That needs no measuring, no ResizeObserver and no effect, and the tiles are visible on first paint. The trade-off is that the squarify algorithm optimizes aspect ratios for a square, while the panel is about 1.6:1 wide, so tiles come out a bit wider. That is cosmetic. The container must have a definite height: `relative h-full min-h-40` inside the Panel body.

### Pattern 4: Lightweight Charts in a client component
- Create the chart once in `useEffect(() => {...; return () => chart.remove()}, [])`, and keep the chart and series in refs.
- A second effect keyed on the deduped points calls `series.setData`, `series.applyOptions({colors})` and `chart.timeScale().fitContent()`.
- `autoSize: true` puts a ResizeObserver on the container.
- The mount `div` must have **no React children**, because LWC appends its own DOM. Put `data-testid="pnl-chart"` and `data-points` on a wrapper that contains the mount div.
- Importing `lightweight-charts` at module top is safe during the static-export prerender. It was imported in plain Node this session with no `window` error (`lwc import ok function object 5.2.1`). Constructing the chart only inside `useEffect` keeps it client-only, so `next/dynamic` is not needed.

### Anti-Patterns to Avoid
- **Keeping `totalValue` in the store:** it goes stale on the next tick, which fails HDR-02. Derive it.
- **Refetching `/api/portfolio` after a trade or on a timer:** violates D-05/D-06 and adds a race window.
- **Tailwind `bg-up/60`-style opacity modifiers on heatmap tiles:** Chromium computes them to `oklab(...)`, which breaks the spec's parser (Pitfall 1).
- **`setState` synchronously inside `useEffect`:** it is an eslint error (Pitfall 3).
- **React children inside the LWC mount node:** React reconciliation and LWC's DOM then conflict.
- **Disabling Buy/Sell while in flight:** violates D-04.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Squarified treemap layout | Custom squarify recursion | `d3-hierarchy` `treemap` + `treemapSquarify` | Edge cases: zero values, ordering, rounding, padding |
| Canvas time-series chart | Custom `<canvas>` drawing | `lightweight-charts` `AreaSeries` | Axes, scaling, HiDPI, resize, crosshair |
| Currency/percent formatting | Manual string building | Existing `store/format.ts` (`Intl.NumberFormat("en-US")`) | Phase 1 pinned `en-US`, and the spec parser relies on it |
| Ticker normalization/validation | Client regex | Backend `normalize_ticker` + show `detail` | Single source of truth, and the error text is verbatim |

## Common Pitfalls

### Pitfall 1: Heatmap computed color is not `rgb()` → spec color assertion fails
**What goes wrong:** Spec 04 parses `getComputedStyle(el).backgroundColor` with `/\d+(\.\d+)?/g` and takes the first 3 numbers as r, g, b.
**Evidence (Chromium 1243 via Playwright 1.63, probed this session):**
```
a rgb(63, 185, 80)                                   ← background-color: var(--up) with --up:#3fb950
b oklab(0.695076 -0.149288 0.102169 / 0.6)           ← color-mix(in oklab, var(--up) 60%, transparent)  (Tailwind `bg-up/60`)
c rgba(63, 185, 80, 0.5)                             ← inline rgba
d oklch(0.627 0.194 149.214)                         ← Tailwind default palette color, e.g. bg-green-600
e color(srgb 0.18902 0.476078 0.260392)              ← color-mix(in srgb, …)
```
Cases b and d fail "up ⇒ g > r" (in b, 0.149 < 0.695 and the regex drops the minus sign).
**How to avoid:** Set the tile background with an inline `style={{ backgroundColor: \`rgba(63, 185, 80, ${a})\` }}` (and `rgba(248, 81, 73, a)` for down), or use the plain hex theme class `bg-up`/`bg-down` with no `/opacity` modifier. Derive `data-pnl` and the color from the **same** number: `pnl > 0 ? "up" : pnl < 0 ? "down" : "flat"`.
**Warning signs:** The heatmap spec fails on `expect(g).toBeGreaterThan(r)` even though the tile looks green.

### Pitfall 2: Duplicate or unsorted chart times
**What goes wrong:** `recorded_at` is `datetime.now(UTC).isoformat()` (microsecond precision). Rapid trades, such as the `03-trading` sell sequence, write several snapshots in the same second. LWC `setData` runs `checkItemsAreOrdered`, which asserts `prevTime < currentTime` in the **development** build ("data must be asc ordered by time"). It is a no-op in production, but duplicate times still corrupt the series there [CITED: Context7 `src/model/data-validators.ts`, `src/api/series-api.ts`]. The LWC package `exports` map resolves `"development"` to `lightweight-charts.development.mjs` under `next dev` [VERIFIED: package.json exports, probed].
**How to avoid:** Map to `time = Math.floor(Date.parse(recorded_at) / 1000)` and keep the last value per second with a `Map`. The input is already sorted (`ORDER BY recorded_at`). `Date.parse("2026-09-26T03:08:35.123456+00:00")` works in V8 (returned `1790392115123`, probed). Set `data-points` to the deduped count.

### Pitfall 3: `react-hooks/set-state-in-effect` fails `npm run lint`
**What goes wrong:** `eslint-plugin-react-hooks` 7.1.1 (through `eslint-config-next` 16.3.6) reports `setN(1)` directly in an effect body as an error: "Calling setState synchronously within an effect can trigger cascading renders". It does not report setState inside `fetch().then(...)` or `setInterval` callbacks [VERIFIED: eslint probe this session].
**How to avoid:** Compute `points` and `data-points` in render from `history` (store). Effects only push data into LWC. The 30 s poll effect calls the store's `loadHistory()`, which is async and writes the store, not React state. Phase 1 gates on `npm --prefix frontend run lint` exiting 0.

### Pitfall 4: Zustand v5 unstable selector → "Maximum update depth exceeded"
**What goes wrong:** A selector returning a new array or object on every call re-subscribes in a loop [CITED: Context7 `/pmndrs/zustand` docs/reference/migrations/migrating-to-v5.md].
**How to avoid:** Use primitive selectors (`selectTotalValue` returns `number | null`, and per-row `s.prices[t]?.price`), or select stable references (`s.positions`, `s.prices`, `s.history`) and derive in render.

### Pitfall 5: 422 `detail` is an array, not a string
**What goes wrong:** `TradeRequest.quantity = Field(gt=0)` and `side: Literal[...]` make FastAPI return 422 with `detail: [{msg, loc, ...}]` for an empty, zero or negative quantity. Rendering `body.detail` directly prints `[object Object]`.
**How to avoid:** `const text = typeof body.detail === "string" ? body.detail : body.detail[0].msg;` A 400 business error gives a plain string, such as `Insufficient cash: need $…, have $…` [VERIFIED: `backend/app/portfolio.py:30,36`]. The E2E only exercises the 400 path.

### Pitfall 6: Chart or heatmap container has zero height
**What goes wrong:** The Panel body is `min-h-0 flex-1 overflow-auto`. An absolutely positioned child needs a positioned ancestor with real height. Below `md` the panels only have `min-h-48`, so `h-full` can resolve to auto. Tiles or the canvas then end up 0 px tall, and `toBeVisible` or `area > 0` fails.
**How to avoid:** Give the Heatmap and P&L containers `relative h-full min-h-40`. The E2E viewport is 1600×1000, i.e. the desktop grid (`md:h-[32%]`).

### Pitfall 7: Shared-portfolio spec ordering
**What goes wrong:** `03-trading` expects `position-qty-AAPL` to be exactly 5, and `04` "positions table" expects positions left over from earlier specs. Re-running against the same DB fails.
**How to avoid:** Use a fresh DB for every gate run (`rm -f "$TMPDIR/p2-e2e.db"`, or the compose tmpfs plus `down -v`). Run the files in order: 01, 03, 04, 06. Exclude the Phase 3 test "clicking a ticker" with `--grep-invert`, and do not run `02-watchlist`/`05-chat` yet.

### Pitfall 8: Sandbox obstacles during execution (from Phase 1 research)
`next build` needs local port binding. npm needs a writable cache (`npm_config_cache="$TMPDIR/npmcache"`). Docker, and launching Chromium for local Playwright, need the sandbox off: a Chromium launch inside the sandbox failed with `bootstrap_check_in … Permission denied (1100)` [VERIFIED: probed this session].

## Code Examples

The in-repo values used below are quoted verbatim in the "Verified in-repo values" subsection.

### Store additions (`store/terminal.ts`)
```ts
/** A held position as returned by /api/portfolio. */
export type Position = { ticker: string; quantity: number; avg_cost: number; current_price: number };
export type Snapshot = { total_value: number; recorded_at: string };
type Portfolio = { cash_balance: number; positions: Position[] };

// TerminalState: replace `totalValue` with `positions: Position[]` and `history: Snapshot[]`.

/** Write a server portfolio (GET /api/portfolio or trade response) into the store. */
export function applyPortfolio(p: Portfolio): void {
  useTerminal.setState({ cash: p.cash_balance, positions: p.positions });
}

/** Refresh P&L snapshots. */
export function loadHistory(): void {
  fetch("/api/portfolio/history")
    .then((r) => r.json())
    .then((history: Snapshot[]) => useTerminal.setState({ history }));
}

/** Place a market order; returns the text for trade-result. */
export async function placeTrade(ticker: string, quantity: number, side: "buy" | "sell") {
  const r = await fetch("/api/portfolio/trade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticker, quantity, side }),
  });
  const body = await r.json();
  if (!r.ok) return { ok: false, text: typeof body.detail === "string" ? body.detail : body.detail[0].msg };
  applyPortfolio(body.portfolio);
  loadHistory();
  const t = body.trade;
  return { ok: true, text: `${side === "buy" ? "Bought" : "Sold"} ${formatQty(t.quantity)} ${t.ticker} @ ${formatPrice(t.price)}` };
}
// In connect(): replace the existing portfolio seed with `.then(applyPortfolio)`.
```

### Derived math (`store/portfolio.ts`)
```ts
import type { Position, TerminalState } from "./terminal";

/** Live price for a position, falling back to the API's current_price. */
export function livePrice(p: Position, prices: TerminalState["prices"]): number {
  return prices[p.ticker]?.price ?? p.current_price;
}

/** Header total: cash + Σ qty × live price. A primitive, so it is a stable Zustand selector. */
export function selectTotalValue(s: TerminalState): number | null {
  if (s.cash === null) return null;
  return s.positions.reduce((sum, p) => sum + p.quantity * livePrice(p, s.prices), s.cash);
}
```
The quantity formatter goes in `store/format.ts`: `new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 })` renders `5` as "5", which matches `/\b5(\.0+)?\b/` [ASSUMED formatting choice; the regex is VERIFIED from the spec].

### Heatmap layout (`components/Heatmap.tsx`, core)
```ts
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";

type Tile = { ticker: string; value: number; pnl: number; pct: number };

/** Squarified layout in a unit square; the caller renders percentages. */
function layout(tiles: Tile[]) {
  const root = hierarchy<{ children?: Tile[] } | Tile>({ children: tiles })
    .sum((d) => ("value" in d ? d.value : 0))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  treemap<{ children?: Tile[] } | Tile>().size([1, 1]).tile(treemapSquarify)(root);
  return root.leaves();
}
// Each leaf is rendered as: <div data-testid={`heatmap-cell-${t.ticker}`} data-pnl={dir}
//   style={{ position:"absolute", left:`${l.x0*100}%`, top:`${l.y0*100}%`,
//            width:`${(l.x1-l.x0)*100}%`, height:`${(l.y1-l.y0)*100}%`, backgroundColor: color }} />
// color: dir==="up" ? `rgba(63, 185, 80, ${a})` : dir==="down" ? `rgba(248, 81, 73, ${a})` : "rgb(48, 54, 61)"
// with a = Math.min(1, 0.35 + Math.abs(pct) / 5)
```
The d3 API was probed in Node this session. `hierarchy({children}).sum().sort()` followed by `treemap().size([480,290]).tile(treemapSquarify).padding(1)` produced non-overlapping rectangles (A 1.0,1.0→319.3,289.0; B 320.3,1.0→479.0,192.7; C 320.3,193.7→479.0,289.0). The exact TS generic spelling above is [ASSUMED]. Adjust it to whatever `@types/d3-hierarchy` requires, or type the datum as `{ ticker?: string; value?: number; children?: Tile[] }`.

### P&L chart (`components/PnlChart.tsx`)
```tsx
"use client";
import { useEffect, useRef } from "react";
import { AreaSeries, ColorType, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { useTerminal, loadHistory } from "@/store/terminal";

const HISTORY_POLL_MS = 30_000; // backend SNAPSHOT_INTERVAL = 30.0

/** One point per second (last wins): LWC needs strictly ascending unique times. */
function toPoints(history: { total_value: number; recorded_at: string }[]) {
  const bySecond = new Map<number, number>();
  for (const s of history) bySecond.set(Math.floor(Date.parse(s.recorded_at) / 1000), s.total_value);
  return [...bySecond].map(([time, value]) => ({ time: time as UTCTimestamp, value }));
}

export function PnlChart() {
  const history = useTerminal((s) => s.history);
  const points = toPoints(history); // derived in render; no setState in effects
  const mount = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    loadHistory();
    const id = setInterval(loadHistory, HISTORY_POLL_MS);
    const c = createChart(mount.current!, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8b949e" },
      grid: { vertLines: { color: "#30363d" }, horzLines: { color: "#30363d" } },
      timeScale: { timeVisible: true },
    });
    chart.current = c;
    series.current = c.addSeries(AreaSeries);
    return () => { clearInterval(id); c.remove(); };
  }, []);

  useEffect(() => {
    if (!points.length) return;
    const up = points[points.length - 1].value >= points[0].value;
    const rgb = up ? "63, 185, 80" : "248, 81, 73";
    series.current!.applyOptions({ lineColor: `rgb(${rgb})`, topColor: `rgba(${rgb}, 0.4)`, bottomColor: `rgba(${rgb}, 0)` });
    series.current!.setData(points);
    chart.current!.timeScale().fitContent();
  }, [history]); // eslint-disable-line react-hooks/exhaustive-deps  (or memoize points with useMemo([history]))

  return (
    <div data-testid="pnl-chart" data-points={points.length} className="relative h-full min-h-40">
      <div ref={mount} className="absolute inset-0" />
    </div>
  );
}
```
Option names were verified in `lightweight-charts` 5.2.1 `dist/typings.d.ts`: `createChart(container, options)`, `autoSize: boolean`, `topColor`/`bottomColor`/`lineColor: string`, `fitContent(): void`, `timeVisible: boolean`, `enum ColorType`, `UTCTimestamp = Nominal<number, "UTCTimestamp">`, and `layout.attributionLogo: boolean` (default shows a TradingView logo; set `false` if unwanted). `addSeries(AreaSeries, options)` is [CITED: Context7 `/tradingview/lightweight-charts` tutorials]. The default layout background is white [CITED: typings `@defaultValue { type: ColorType.Solid, color: '#FFFFFF' }`], so set it explicitly. Use `useMemo(() => toPoints(history), [history])` rather than the eslint-disable. It is cleaner, and it keeps the dependency array honest.

### Verified in-repo values (verbatim quotes)

- **E2E testids and assertions** [VERIFIED: `test/e2e/03-trading.spec.ts:1-49`, `test/e2e/04-portfolio-viz.spec.ts:1-49`, `test/e2e/helpers.ts:44-49`]:
  - `page.getByTestId("trade-ticker").fill(ticker)`, `page.getByTestId("trade-quantity").fill(String(quantity))`, ``page.getByTestId(`trade-${side}`).click()``
  - `getByTestId("position-row-AAPL")`, `getByTestId("position-qty-AAPL")).toHaveText(/\b5(\.0+)?\b/)`
  - `getByTestId("trade-result")).toContainText(/insufficient cash/i)` / `/insufficient shares/i`
  - `expect(Math.abs(spent - 5 * price) / (5 * price)).toBeLessThan(0.02)`
  - `getByTestId("heatmap")`, `getByTestId("heatmap-cell-GOOGL")`, `'[data-testid^="heatmap-cell-"]'`, `getAttribute("data-pnl")`, `if (pnl === "up") expect(g).toBeGreaterThan(r); else if (pnl === "down") expect(r).toBeGreaterThan(g); else expect(pnl).toBe("flat");`
  - `getByTestId("pnl-chart")`, `chart.getAttribute("data-points")`, `chart.locator("canvas").first()).toBeVisible()`
  - `getByTestId("positions-empty")).toHaveCount(0)`
- **Portfolio shape** [VERIFIED: `backend/app/portfolio.py:82-99`]: `"ticker"`, `"quantity"`, `"avg_cost": round(row["avg_cost"], 4)`, `"current_price": current`, `"market_value"`, `"unrealized_pnl"`, `"pnl_percent"`; the top level has `"cash_balance": round(cash, 2)`, `"positions": positions`, `"positions_value"`, `"total_value"`, `"unrealized_pnl"`.
- **Trade errors** [VERIFIED: `backend/app/portfolio.py:30,36`]: `f"Insufficient cash: need ${amount:,.2f}, have ${cash:,.2f}"`, `f"Insufficient shares: trying to sell {quantity:g} {ticker}, hold {held:g}"`.
- **Trade route** [VERIFIED: `backend/app/api.py:15-18,44-51`]: `quantity: float = Field(gt=0)`, `side: Literal["buy", "sell"]`, `raise HTTPException(400, str(e))`, `return {"trade": result, "portfolio": portfolio.get_portfolio(cache)}`.
- **Trade record** [VERIFIED: `backend/app/portfolio.py:53-54`]: `{"id": new_id(), "ticker": ticker, "side": side, "quantity": quantity, "price": price, "executed_at": now()}`.
- **History** [VERIFIED: `backend/app/portfolio.py:113-117`]: `"SELECT total_value, recorded_at FROM portfolio_snapshots WHERE user_id = ? ORDER BY recorded_at"`; `now()` is `datetime.now(UTC).isoformat()` [VERIFIED: `backend/app/db/database.py:22-23`].
- **Snapshot cadence** [VERIFIED: `backend/app/main.py:23,63`, `backend/app/actions.py:48`]: `SNAPSHOT_INTERVAL = 30.0`; `portfolio.record_snapshot(cache)` at startup and after each trade.
- **Sold-to-zero** [VERIFIED: `backend/app/portfolio.py:42-43`]: `if new_quantity <= EPSILON: conn.execute("DELETE FROM positions ...`.
- **Theme colors** [VERIFIED: `frontend/app/globals.css:4-13`]: `--color-bg: #0d1117;` `--color-panel: #1a1a2e;` `--color-border: #30363d;` `--color-muted: #8b949e;` `--color-up: #3fb950;` `--color-down: #f85149;` (#3fb950 = rgb(63, 185, 80), #f85149 = rgb(248, 81, 73), #30363d = rgb(48, 54, 61)).
- **Current store** [VERIFIED: `frontend/store/terminal.ts:20-26,56-58`]: `cash: number | null; totalValue: number | null;` and `.then((p) => useTerminal.setState({ cash: p.cash_balance, totalValue: p.total_value }));`
- **Header** [VERIFIED: `frontend/components/Header.tsx:14-22`]: `const totalValue = useTerminal((s) => s.totalValue);` renders `<span data-testid="total-value">`, and `cash !== null && <span data-testid="cash-balance">`.
- **Panels to fill** [VERIFIED: `frontend/app/page.tsx:28-43`]: `<Panel title="Trade" className={`${STACKED} md:h-24 md:shrink-0`}>`, `<Panel title="Heatmap" ...>`, `<Panel title="P&L" ...>`, `<Panel title="Positions" ...>`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| LWC `chart.addAreaSeries(opts)` | `chart.addSeries(AreaSeries, opts)` | lightweight-charts v5 | Use v5 syntax. v4 examples in training data are stale [CITED: Context7 LWC docs] |
| Zustand v4 selectors returning arrays/objects | Stable outputs or `useShallow` | zustand v5 | Otherwise an infinite render loop [CITED: Context7 zustand migration guide] |
| `react-hooks` v4/v5 lint | v7 compiler-backed rules (`set-state-in-effect`, `refs`, `immutability`) | eslint-plugin-react-hooks 7 (with Next 16) | Effects cannot setState synchronously [VERIFIED: probe] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Percent-based treemap in a unit square is visually acceptable (tiles slightly stretched vs true squarify) | Pattern 3 | Low. Swap in a ResizeObserver-measured `size([w,h])` if the UI review objects |
| A2 | Exact `@types/d3-hierarchy` generic spelling in the Heatmap example | Code Examples | Low. A type error at `npm run build`, fixed by typing the datum loosely |
| A3 | Heatmap intensity `a = min(1, 0.35 + |pct|/5)` and flat color `rgb(48, 54, 61)` | Code Examples | Cosmetic only. The spec checks only the channel ordering |
| A4 | Quantity formatter `maximumFractionDigits: 4` | Code Examples | Low. The regex tolerates `5` and `5.00` |
| A5 | LWC autoSize inside `absolute inset-0` in the Panel body sizes correctly with no scroll feedback loop | Pattern 4 / Pitfall 6 | Medium. Verify with the E2E `canvas` visibility and a screenshot |
| A6 | P&L panel always shows the chart when history exists (history is never empty on a running server), with a muted note only while `history` is empty | Empty states | Low. A discretion area in CONTEXT |

## Open Questions

1. **Should `connect()` re-seed the portfolio when the stream reopens?** (Phase 1 review IN-05)
   - What we know: cash can go stale only if the backend restarts with a new DB while the page is open.
   - Recommendation: out of scope. No spec covers it, and D-05 forbids periodic refetch.
2. **Should the TradeBar uppercase the ticker input as the user types?**
   - What we know: the backend normalizes the ticker, and the success text uses `trade.ticker` (already uppercase).
   - Recommendation: add a CSS `uppercase` class for display only and send the raw value.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | frontend build, Playwright | ✓ | v24.16.0 | — |
| npm | install new deps | ✓ (cache EPERM) | 11.13.0 | `npm_config_cache="$TMPDIR/npmcache"` |
| npm registry | `npm install` | ✓ with `registry.npmjs.org` allowed | — | — |
| uv | local backend for E2E | ✓ | 0.12.5 | — |
| Docker | phase gate | ✓ (sandbox off) | 29.7.2 | local uvicorn + Playwright gate |
| Playwright Chromium | local E2E | ✓ (sandbox off) | chromium-1243 | compose Playwright container |

**Missing dependencies with no fallback:** none.

## Validation Architecture

`workflow.nyquist_validation` is `false` in `.planning/config.json`, so this section is skipped. The phase gate is the E2E suite:

- **Per plan (local):** `npm --prefix frontend run lint && npm --prefix frontend run build`, then
  `rm -f "$TMPDIR/p2-e2e.db"; DB_PATH="$TMPDIR/p2-e2e.db" STATIC_DIR="$PWD/frontend/out" LLM_MOCK=true MASSIVE_API_KEY= uv run --directory backend uvicorn app.main:app --port 8010 & …; (cd test && BASE_URL=http://localhost:8010 npx playwright test e2e/01-fresh-start.spec.ts e2e/03-trading.spec.ts e2e/04-portfolio-viz.spec.ts e2e/06-sse-reconnect.spec.ts --grep-invert "clicking a ticker")`
  (Plan A can drop `04`; this is the Phase 1 pattern with port 8010.)
- **Phase gate (Docker):** `docker compose -f test/docker-compose.test.yml build finally && docker compose -f test/docker-compose.test.yml run --rm playwright sh -c "npm ci && npx playwright test e2e/01-fresh-start.spec.ts e2e/03-trading.spec.ts e2e/04-portfolio-viz.spec.ts e2e/06-sse-reconnect.spec.ts --grep-invert 'clicking a ticker'"; docker compose -f test/docker-compose.test.yml down -v`
- **Backend regression:** `uv run --directory backend pytest -q` (unchanged backend; this is a sanity check only).

## Security Domain

`security_enforcement: true`, ASVS level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single-user by design (out of scope) |
| V3 Session Management | no | No sessions or cookies |
| V4 Access Control | no | Single user `"default"` |
| V5 Input Validation | yes | Backend Pydantic (`Field(gt=0)`, `Literal`) + `normalize_ticker`; frontend renders `detail` as React text (auto-escaped) |
| V6 Cryptography | no | None |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Reflected XSS via echoed ticker in error (`Invalid ticker: '<img …>'`) | Tampering | Render `detail` as a JSX text node. Never use `dangerouslySetInnerHTML` |
| Client-side tampering with price/cash | Tampering | Price is taken server-side from `PriceCache`; the client only sends ticker/qty/side |
| Duplicate submits (D-04 keeps buttons enabled) | Repudiation/DoS (low) | Accepted by design. Each POST is an independent serialized transaction (`BEGIN IMMEDIATE`) |
| CSRF | Spoofing | N/A: no auth or cookies, and same-origin JSON POST |

## Sources

### Primary (HIGH confidence)
- Repo files read this session: `test/e2e/03-trading.spec.ts`, `test/e2e/04-portfolio-viz.spec.ts`, `test/e2e/helpers.ts`, `test/e2e/01-fresh-start.spec.ts`, `test/playwright.config.ts`, `test/docker-compose.test.yml`, `backend/app/{api,portfolio,actions,main}.py`, `backend/app/db/database.py`, `backend/app/market/{stream,models,cache}.py`, `frontend/{store,components,app}/*`, `frontend/package.json`, `frontend/eslint.config.mjs`
- Probes: Chromium computed-color serialization (Playwright 1.63), `lightweight-charts` Node import plus typings, `d3-hierarchy` treemap run, eslint `set-state-in-effect`, `Date.parse` of the backend ISO timestamp, npm registry `npm view` / `api.npmjs.org` downloads

### Secondary (MEDIUM confidence, classify-confidence: context7 = MEDIUM)
- Context7 `/tradingview/lightweight-charts` (v5.2.0): `addSeries(AreaSeries)`, `autoSize` ResizeObserver, `checkItemsAreOrdered`, `UTCTimestamp`, `remove()`
- Context7 `/pmndrs/zustand`: v5 stable selector requirement, `useShallow`

### Tertiary (LOW confidence)
- None used.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Versions come from the registry, and the APIs were probed on the installed packages.
- Architecture: HIGH. Follows the locked D-05/D-06/D-09/D-11 decisions and the existing store pattern.
- Pitfalls: HIGH for 1-5 (probed or read). MEDIUM for 6 (layout sizing, confirmed only by a real run).

**Research date:** 2026-09-26
**Valid until:** 2026-10-26 (stable libraries; the E2E contract is fixed)
