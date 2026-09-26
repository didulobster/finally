# Phase 2: Trading & Portfolio - Pattern Map

**Mapped:** 2026-09-26
**Files analyzed:** 10 (5 new, 5 modified)
**Analogs found:** 8 / 10 (Heatmap layout and the P&L chart have no in-repo analog for their core; both borrow the surrounding component/effect patterns)

All work is frontend. The backend is read-only reference (Phase 1 D-14). Every analog below is git-tracked (`git ls-files frontend` verified).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `frontend/store/terminal.ts` (modify) | store | request-response + event-driven (SSE) | itself: `connect()` lines 46-81 | exact |
| `frontend/store/portfolio.ts` (new) | utility (pure derived math + selector) | transform | `frontend/store/format.ts` (pure fn module) + `terminal.ts` types | role-match |
| `frontend/store/format.ts` (modify) | utility | transform | itself, lines 1-16 | exact |
| `frontend/components/TradeBar.tsx` (new) | component (form) | request-response | `frontend/components/ChatDrawer.tsx` (local `useState` + buttons) | role-match |
| `frontend/components/Positions.tsx` (new) | component (list) | live transform from store | `frontend/components/Watchlist.tsx` | exact |
| `frontend/components/Heatmap.tsx` (new) | component (collection) | live transform from store | `frontend/components/Watchlist.tsx` (selectors, testids) | partial (no treemap analog) |
| `frontend/components/PnlChart.tsx` (new) | component (canvas chart) | polling + effect-driven render | `frontend/app/page.tsx` line 14 + `connect()` cleanup | partial (no chart analog) |
| `frontend/components/Header.tsx` (modify) | component | live transform | itself, lines 13-22 | exact |
| `frontend/app/page.tsx` (modify) | route/page | composition | itself, lines 21-23 (Watchlist panel body) | exact |
| `frontend/package.json` + `package-lock.json` (modify) | config | n/a | itself | exact |

## Pattern Assignments

### `frontend/store/terminal.ts` (store, modify)

**Analog:** itself.

**Type pattern** (lines 3-26): every exported type has a one-line `/** */` docstring; state is one flat `TerminalState` type.
```ts
/** The whole client state: connection, live prices, watchlist order, and cash. */
export type TerminalState = {
  status: Status;
  prices: Record<string, Price>;
  watchlist: string[];
  cash: number | null;
  totalValue: number | null;   // <- REMOVE (HDR-02 anti-pattern); add positions: Position[]; history: Snapshot[]
};
```

**Store creation** (lines 30-37): `create<TerminalState>()(() => ({...}))` with no actions inside the store. Actions are module-level exported functions that call `useTerminal.setState`. Keep this: add `positions: []`, `history: []`, drop `totalValue: null`.
```ts
export const useTerminal = create<TerminalState>()(() => ({
  status: "reconnecting",
  prices: {},
  watchlist: [],
  cash: null,
  totalValue: null,
}));
```

**Fetch-then-setState pattern** (lines 47-58). New `applyPortfolio`, `loadHistory`, `placeTrade` copy this style: relative `/api/...` URL, `.then((r) => r.json())`, no try/catch, no status checks on seed fetches.
```ts
  fetch("/api/portfolio")
    .then((r) => r.json())
    .then((p) => useTerminal.setState({ cash: p.cash_balance, totalValue: p.total_value }));
```
Line 58 becomes `.then(applyPortfolio);` (D-06 initial seed).

**Module-level constant with "why" comment** (lines 39-40): `// A non-200 ... closes an EventSource for good` then `const REOPEN_DELAY_MS = 3000;`. Copy for `HISTORY_POLL_MS = 30_000` (backend `SNAPSHOT_INTERVAL = 30.0`, `backend/app/main.py:23`).

**Exported action with docstring** (lines 42-46): `/** multi-line docstring */ export function connect(): () => void {`. `placeTrade` follows this form; its body is in 02-RESEARCH "Store additions" (write store only on `r.ok`; 422 `detail` is an array: `typeof body.detail === "string" ? body.detail : body.detail[0].msg`). UI-SPEC adds a network-failure branch: if `fetch` itself rejects, return `{ ok: false, text: "Trade not sent: connection to the server failed. Try again." }` (the one place a `try/catch` is warranted).

**Backend contract to match** (`backend/app/api.py:44-56`):
```py
@router.post("/portfolio/trade")
async def trade(req: TradeRequest, request: Request) -> dict:
    ...
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"trade": result, "portfolio": portfolio.get_portfolio(cache)}

@router.get("/portfolio/history")
async def history() -> list[dict]:
```
Position shape: `backend/app/portfolio.py` (get_portfolio) `ticker, quantity, avg_cost, current_price, market_value, unrealized_pnl, pnl_percent`; top level `cash_balance, positions, positions_value, total_value, unrealized_pnl`. Trade record: `{id, ticker, side, quantity, price, executed_at}`. History rows: `{total_value, recorded_at}` ordered by `recorded_at`.

---

### `frontend/store/portfolio.ts` (utility, new)

**Analog:** `frontend/store/format.ts` (a module of small pure exported functions, each with a one-line docstring, no React) plus the type-import style of `components/Header.tsx:4` (`import { useTerminal, type Status } from "@/store/terminal";`).

Pattern to copy (format.ts lines 8-11):
```ts
/** Format a dollar amount as en-US USD, e.g. "$10,000.00". */
export function formatPrice(v: number): string {
  return usd.format(v);
}
```
Contents: `livePrice(p, prices)` (`prices[p.ticker]?.price ?? p.current_price`, D-05) and `selectTotalValue(s): number | null` (returns a primitive, so it is a stable Zustand v5 selector; Pitfall 4). Full bodies are in 02-RESEARCH "Derived math". Import types with `import type { Position, TerminalState } from "./terminal";`. Stays under `store/` (never `lib/`, root `.gitignore` swallows it).

---

### `frontend/store/format.ts` (utility, modify)

**Analog:** itself (lines 1-16). Formatters are module-level `Intl.NumberFormat("en-US", ...)` instances (lines 1-6), wrapped by tiny exported functions.
```ts
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const pct = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});
```
Add, same shape:
- `const qty = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });` + `/** ... */ export function formatQty(v: number): string` (must satisfy `/\b5(\.0+)?\b/`).
- `const signedUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", signDisplay: "exceptZero" });` + `formatSignedPrice`.

---

### `frontend/components/TradeBar.tsx` (component/form, new)

**Analog:** `frontend/components/ChatDrawer.tsx` (the only component with local `useState` and `<button type="button">`).

**Header + imports** (ChatDrawer lines 1-4):
```tsx
"use client";

import { useState } from "react";
import { PanelNote } from "@/components/Panel";
```
TradeBar imports: `useState` from react, `placeTrade` from `@/store/terminal`. `@/` alias is used for all cross-dir imports.

**Button pattern** (ChatDrawer line 14): `type="button"`, `aria-label`, inline `onClick`, class string constant at module top (line 6 `const TOGGLE = "px-2 text-muted hover:text-accent";`).
```tsx
<button type="button" aria-label="Expand chat" aria-expanded={false} onClick={() => setOpen(true)} className={TOGGLE}>
```
Copy: a module-level `const BUTTON = "h-8 w-16 text-sm font-semibold text-bg hover:brightness-110 ..."` and an `INPUT` constant shared by both inputs. No `<form>` (UI-SPEC: Enter does not submit). Buttons never disabled (D-04).

**Local state rule:** trade-result `{ ok, text } | null` lives in component `useState` (only the TradeBar reads it); the result is set from inside the async click handler (not an effect, so `react-hooks/set-state-in-effect` does not fire). Inputs are controlled `useState` strings, never cleared (D-01). Send `Number(qty)` and the raw ticker.

**Testids / copy:** `trade-ticker`, `trade-quantity`, `trade-buy`, `trade-sell`, `trade-result` (`<p role="status" aria-live="polite">`, always rendered; idle copy `Market order · fills instantly at the live price` in `text-muted`, success `text-up`, rejection `text-down`). Exact classes in 02-UI-SPEC "Trade bar".

---

### `frontend/components/Positions.tsx` (component/list, new)

**Analog:** `frontend/components/Watchlist.tsx` (exact: list from store + per-row live price selector + testids + up/down/muted color).

**Imports** (lines 1-4):
```tsx
"use client";

import { formatPercent, formatPrice } from "@/store/format";
import { useTerminal } from "@/store/terminal";
```

**Parent selects a stable reference, maps to row components keyed by ticker** (lines 7-16):
```tsx
export function Watchlist() {
  const watchlist = useTerminal((s) => s.watchlist);
  return (
    <div>
      {watchlist.map((ticker) => (
        <WatchlistRow key={ticker} ticker={ticker} />
      ))}
    </div>
  );
}
```
Copy: `const positions = useTerminal((s) => s.positions);` and `const cash = useTerminal((s) => s.cash);`. Branches: `cash === null` -> `<PanelNote>Loading positions…</PanelNote>`; `positions.length === 0` -> empty note carrying `data-testid="positions-empty"` (PanelNote has no testid prop, so either render `<p data-testid="positions-empty" className="p-3 text-xs text-muted">` matching `Panel.tsx:17` classes, or extend `PanelNote` with an optional testid). Rows use the server order (already `ORDER BY ticker`, D-08); pass the `Position` object to the row.

**Row: narrow per-ticker selector + sign color** (lines 18-23):
```tsx
function WatchlistRow({ ticker }: { ticker: string }) {
  const p = useTerminal((s) => s.prices[ticker]);
  ...
  const color = change > 0 ? "text-up" : change < 0 ? "text-down" : "text-muted";
```
Copy as `const live = useTerminal((s) => s.prices[pos.ticker]?.price) ?? pos.current_price;` (primitive selector; D-05 fallback), then the same ternary for P&L/% color.

**Testid template** (lines 26, 30): ``data-testid={`watchlist-row-${ticker}`}`` -> ``position-row-${ticker}`` on `<tr>`, ``position-qty-${ticker}`` on the Qty `<td>`. Mono numerals: `font-mono text-sm tabular-nums` (line 27). Do NOT copy `py-1.5` (UI-SPEC: use `py-1`). Table markup in 02-UI-SPEC "Positions table".

---

### `frontend/components/Heatmap.tsx` (component/collection, new)

**Analog (surroundings only):** `frontend/components/Watchlist.tsx` for `"use client"`, `@/store/...` imports, stable-reference selectors, testid template strings, and the up/down/flat ternary (line 23). Loading/empty notes use `PanelNote` from `@/components/Panel` (as ChatDrawer line 4/30 does).

Selectors: two separate stable references, `useTerminal((s) => s.positions)` and `useTerminal((s) => s.prices)`, plus `cash` for the loading branch. Compute the layout in render (no effect, no ResizeObserver). Use `livePrice` from `@/store/portfolio`.

**Core (no in-repo analog):** use 02-RESEARCH "Heatmap layout" (`hierarchy` + `treemap().size([1, 1]).tile(treemapSquarify)`, percent `left/top/width/height`). Binding color rule from 02-UI-SPEC "Color": inline `rgba(63, 185, 80, a)` / `rgba(248, 81, 73, a)` / `rgb(48, 54, 61)`, never Tailwind `bg-up/60` or palette classes (Pitfall 1: Chromium serializes those as `oklab`/`oklch` and the spec's `rgb()` parser breaks). `data-pnl` and color from the same number. Container `data-testid="heatmap" className="relative h-full min-h-40"`.

---

### `frontend/components/PnlChart.tsx` (component/canvas chart, new)

**Analog (effect lifecycle):** `frontend/app/page.tsx` line 14 and `store/terminal.ts` lines 76-80. The project's effect pattern is "start something, return a cleanup that stops it":
```ts
// page.tsx:14
useEffect(connect, []);
// terminal.ts:76-80
  open();
  return () => {
    clearTimeout(timer);
    es.close();
  };
```
Copy: one mount effect that calls `loadHistory()`, starts `setInterval(loadHistory, HISTORY_POLL_MS)`, creates the chart, and returns `() => { clearInterval(id); chart.remove(); }`. `loadHistory` writes the store (not React state), so the lint rule `react-hooks/set-state-in-effect` is not triggered.

**Core (no in-repo analog):** use 02-RESEARCH "P&L chart" with the option set from 02-UI-SPEC "P&L chart" (`addSeries(AreaSeries)` v5 syntax, `autoSize: true`, transparent background, `localization.priceFormatter: formatPrice`, `lineWidth: 2`). Derive points with `useMemo(() => toPoints(history), [history])` (dedupe by whole second; Pitfall 2). `data-testid="pnl-chart"` and `data-points` go on the wrapper; the LWC mount div has no React children. The empty overlay (`Waiting for the first portfolio snapshot…`) is a sibling of the mount div inside the wrapper, `absolute inset-0`.

---

### `frontend/components/Header.tsx` (component, modify)

**Analog:** itself. Only line 14 changes:
```tsx
const totalValue = useTerminal((s) => s.totalValue);
```
becomes `const totalValue = useTerminal(selectTotalValue);` with `import { selectTotalValue } from "@/store/portfolio";`. Lines 19-22 (`totalValue !== null && <span data-testid="total-value">`) stay as they are.

---

### `frontend/app/page.tsx` (page, modify)

**Analog:** itself. The Watchlist panel (lines 21-23) is the pattern for a filled panel: the component is the direct Panel child.
```tsx
<Panel title="Watchlist" className={`${STACKED} md:w-72 md:shrink-0`}>
  <Watchlist />
</Panel>
```
Replace the `PanelNote` bodies at lines 29 (Trade -> `<TradeBar />`), 36 (Heatmap -> `<Heatmap />`), 39 (P&L -> `<PnlChart />`), 42 (Positions -> `<Positions />`). Keep panel titles, `className`s and grid unchanged. Add imports in the existing alphabetical `@/components/...` block (lines 4-7). `PanelNote` stays imported for the Chart panel (line 26).

---

### `frontend/package.json` + `frontend/package-lock.json` (config, modify)

Add `lightweight-charts@5.2.1`, `d3-hierarchy@3.1.2` to `dependencies` and `@types/d3-hierarchy@3.1.7` to `devDependencies` via `npm install` (with `npm_config_cache="$TMPDIR/npmcache"`); commit both files (Docker runs `npm ci`). Existing deps pin exact for framework (`"next": "16.3.6"`) and caret for others (`"zustand": "^5.0.15"`); either is consistent.

## Shared Patterns

### Client component header and imports
**Source:** `frontend/components/Watchlist.tsx:1-4`, `Header.tsx:1-4`
**Apply to:** TradeBar, Positions, Heatmap, PnlChart
```tsx
"use client";

import { formatPercent, formatPrice } from "@/store/format";
import { useTerminal } from "@/store/terminal";
```
Named exports (`export function Watchlist()`), one-line `/** */` docstring above each exported component, small private sub-components below in the same file (`WatchlistRow`, `Stat`, `ConnectionStatus`).

### Narrow Zustand selectors
**Source:** `Watchlist.tsx:8,19-20`, `Header.tsx:14-15,40`
**Apply to:** all new components and Header
Select a primitive or an existing stable reference (`s.positions`, `s.prices`, `s.history`, `s.prices[t]?.price`). Never return a freshly built array/object from a selector (Zustand v5 infinite loop, Pitfall 4). Derive everything else in render.

### Sign-to-color
**Source:** `Watchlist.tsx:23`
**Apply to:** Positions P&L/% cells, Heatmap `data-pnl`, TradeBar result
```tsx
const color = change > 0 ? "text-up" : change < 0 ? "text-down" : "text-muted";
```
Heatmap uses the same ternary to produce `"up" | "down" | "flat"` but inline `rgba()` backgrounds, not classes.

### Panel notes (empty / loading)
**Source:** `frontend/components/Panel.tsx:15-18`
**Apply to:** Positions, Heatmap, PnlChart empty and loading states
```tsx
export function PanelNote({ children }: { children: ReactNode }) {
  return <p className="p-3 text-xs text-muted">{children}</p>;
}
```
Panel body is `min-h-0 flex-1 overflow-auto` (line 10), so absolutely positioned children (Heatmap, PnlChart) need their own `relative h-full min-h-40` container (Pitfall 6).

### Numbers
**Source:** `frontend/store/format.ts`, `Watchlist.tsx:27`
**Apply to:** every price, qty, P&L, % and input
`font-mono tabular-nums` plus `formatPrice` / `formatPercent` / new `formatQty` / `formatSignedPrice`. Never build currency strings by hand.

### Error handling
**Source:** `store/terminal.ts:47-58` (no try/catch on seed fetches), `backend/app/api.py:47-50` (400 with plain-text `detail`)
**Apply to:** `placeTrade`, `loadHistory`
No defensive wrapping. The only branches: `r.ok` vs not (400 string / 422 array `detail`) and the fetch-rejection copy in `placeTrade`. Render `detail` as a JSX text node (never `dangerouslySetInnerHTML`).

### Theme tokens
**Source:** `frontend/app/globals.css:3-14`
`bg-bg #0d1117`, `bg-panel #1a1a2e`, `border-border #30363d`, `text-muted #8b949e`, `text-text #e6edf3`, `primary #209dd7`, `up #3fb950` = rgb(63, 185, 80), `down #f85149` = rgb(248, 81, 73). No new tokens this phase.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `frontend/components/Heatmap.tsx` (layout core) | component | transform | No treemap or d3 usage exists; use 02-RESEARCH "Heatmap layout" + 02-UI-SPEC "Heatmap" |
| `frontend/components/PnlChart.tsx` (chart core) | component | effect-driven canvas | No chart library in the repo yet; use 02-RESEARCH "P&L chart" + 02-UI-SPEC "P&L chart" options |

## Metadata

**Analog search scope:** `frontend/` (all tracked files), `backend/app/api.py`, `backend/app/portfolio.py`, `test/e2e/{helpers,03-trading.spec,04-portfolio-viz.spec}.ts`
**Files scanned:** 17
**Pattern extraction date:** 2026-09-26
