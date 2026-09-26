---
phase: 02-trading-portfolio
reviewed: 2026-09-26T08:15:17Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - frontend/app/page.tsx
  - frontend/components/Header.tsx
  - frontend/components/Heatmap.tsx
  - frontend/components/PnlChart.tsx
  - frontend/components/Positions.tsx
  - frontend/components/TradeBar.tsx
  - frontend/package.json
  - frontend/store/format.ts
  - frontend/store/portfolio.ts
  - frontend/store/terminal.ts
  - test/README.md
  - test/portfolio-probe.mjs
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-09-26T08:15:17Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

This review covers the Phase 2 trading and portfolio frontend: the trade bar, positions table, heatmap, P&L chart, the live header total, the store additions (`placeTrade`, `loadHistory`, `applyPortfolio`, `selectTotalValue`), and the portfolio probe. I checked the store against the backend contracts in `backend/app/api.py`, `backend/app/portfolio.py`, `backend/app/actions.py`, and `backend/app/market/stream.py`.

The happy path is correct. Response shapes match the store types. Live valuation uses a primitive, stable Zustand selector, and the chart's per-second dedupe gives Lightweight Charts strictly ascending times. I found no blocking correctness or security defect.

The main weaknesses are in how the trade path handles failure and concurrency:
- An order can be submitted twice.
- A non-JSON error response leaves an earlier success message on screen.
- If the initial portfolio load fails, the page stays in "Loading…" with no recovery while the status dot shows LIVE.
- The P&L chart's time axis shows UTC instead of local time.

## Warnings

### WR-01: Trade bar has no in-flight guard, so a double click places two orders

**File:** `frontend/components/TradeBar.tsx:17`, `frontend/components/TradeBar.tsx:43-48`, `frontend/store/terminal.ts:79`
**Issue:** `trade()` fires `placeTrade` on every click, and nothing disables Buy or Sell while a request is pending. PLAN.md specifies instant fills with no confirmation dialog, so a double click (or an impatient second click on a slow response) executes two market orders. Concurrent requests also resolve independently: each one calls `applyPortfolio(body.portfolio)` and `setResult(...)`. If responses arrive out of order, an older portfolio snapshot overwrites a newer one. Cash and positions then stay stale until the next trade, and the result line describes the wrong fill.
**Fix:** Track a pending flag and disable the buttons while a trade is in flight.
```tsx
const [pending, setPending] = useState(false);
const trade = async (side: "buy" | "sell") => {
  setPending(true);
  setResult(await placeTrade(ticker, Number(qty), side));
  setPending(false);
};
// <button disabled={pending} ... className={`${BUTTON} bg-up disabled:opacity-50`}>
```

### WR-02: A non-JSON error response throws out of `placeTrade` and leaves the previous result on screen

**File:** `frontend/store/terminal.ts:77-78`, `frontend/components/TradeBar.tsx:17`
**Issue:** The `try` block only covers `fetch`, not `await r.json()`. Some error responses have a non-JSON body:
- FastAPI's unhandled-exception path returns `text/plain` "Internal Server Error" (for example, a `sqlite3.OperationalError` from `execute_trade`, or a failure in `record_snapshot` after the trade already committed).
- A proxy 502 returns HTML. The repo's own `sse-502-probe` puts such a proxy in front of the app.

In these cases `r.json()` rejects, so `placeTrade` rejects. The `onClick` promise becomes an unhandled rejection, and `setResult` never runs. The result line keeps its previous text. If that text was a green "Bought 2 NVDA @ $…", the user sees a success message for a request that failed, and may retry into a duplicate order when the first trade actually committed.
**Fix:** Read the body only after checking the status, and fall back to the status text for non-JSON errors.
```ts
if (!r.ok) {
  const body = await r.json().catch(() => null);
  const detail = body?.detail;
  return { ok: false, text: typeof detail === "string" ? detail : detail?.[0]?.msg ?? `Trade failed (${r.status})` };
}
const body = await r.json();
```

### WR-03: If the initial portfolio fetch fails, the header and panels never recover while the dot shows LIVE

**File:** `frontend/store/terminal.ts:103-105`, `frontend/store/terminal.ts:112`
**Issue:** `connect()` fetches `/api/portfolio` once, with no error path and no retry. If that request fails (backend still starting, container restart, transient 5xx), `cash` stays `null` for the life of the page:
- The Header shows no total value or cash.
- Positions shows "Loading positions…" and Heatmap shows "Loading holdings…".

Meanwhile the EventSource reopens and the status dot turns green (LIVE), which is misleading. The portfolio is also never refetched after the stream reconnects from a backend restart. The only way out is a successful manual trade or a page reload. `loadHistory` (`terminal.ts:59-63`) has the same unguarded chain, and the 30 s poll logs an unhandled rejection whenever the backend is unreachable.
**Fix:** Load the portfolio when the stream opens. This covers first load and every reconnect in one place, without adding defensive branches.
```ts
current.onopen = () => {
  useTerminal.setState({ status: "connected" });
  fetch("/api/portfolio").then((r) => r.json()).then(applyPortfolio);
};
```
Then remove the separate `/api/portfolio` fetch at lines 103-105.

### WR-04: P&L chart time axis is in UTC, not the user's local time

**File:** `frontend/components/PnlChart.tsx:21`, `frontend/components/PnlChart.tsx:41`
**Issue:** `toPoints` passes raw epoch seconds as `UTCTimestamp`, and `timeVisible: true` shows clock times on the axis. Lightweight Charts formats these times in UTC and has no time-zone option, so a user in UTC−7 sees snapshot times seven hours off. The P&L chart is the only place the user sees when their portfolio value changed, so the axis labels are wrong for anyone outside UTC.
**Fix:** Supply local formatters. Do not shift the data.
```ts
const localTime = (t: UTCTimestamp) => new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
createChart(mount.current!, {
  ...,
  localization: { priceFormatter: formatPrice, timeFormatter: localTime },
  timeScale: { ..., tickMarkFormatter: localTime },
});
```

## Info

### IN-01: The treemap is squarified for a unit square, then stretched to a wide panel

**File:** `frontend/components/Heatmap.tsx:18`, `frontend/components/Heatmap.tsx:56-59`
**Issue:** `treemap().size([1, 1])` optimizes tile aspect ratios for a square. The result is then rendered as percentages of a panel that is roughly 2-3x wider than tall at `md` and up. Areas stay proportional, but tiles come out stretched horizontally, which undoes the purpose of `treemapSquarify`.
**Fix:** Lay out at the panel's real aspect ratio, for example by measuring the container once with a `ResizeObserver` and passing `size([width, height])`. Alternatively, use a fixed `size([2.5, 1])` and divide `x` by 2.5 when converting to percentages.

### IN-02: History fetches can resolve out of order and briefly show an older list

**File:** `frontend/store/terminal.ts:59-63`, `frontend/store/terminal.ts:80`, `frontend/components/PnlChart.tsx:34-35`
**Issue:** The 30 s poll and the post-trade `loadHistory()` both overwrite `history` with whichever response arrives last. If a poll response that started before a trade lands after the post-trade response, the snapshot recorded for that trade vanishes from the chart until the next poll. It fixes itself within 30 s.
**Fix:** Optionally ignore a response that is shorter than the current history: `useTerminal.setState((s) => (history.length >= s.history.length ? { history } : s))`.

### IN-03: Quantities below 0.0001 display as "0"

**File:** `frontend/store/format.ts:8`
**Issue:** `formatQty` caps output at 4 fraction digits, but the backend accepts any `quantity > 0` and keeps any position above `EPSILON = 1e-9`. For example, buying 0.00004 shares shows "Bought 0 AAPL @ $…", and a residual position after a partial sell appears as a "0" row in Positions.
**Fix:** Use `maximumSignificantDigits` for small values, or raise `maximumFractionDigits` (for example to 6).

### IN-04: Enter does not submit an order

**File:** `frontend/components/TradeBar.tsx:22-48`
**Issue:** The inputs are not inside a `<form>`, so pressing Enter after typing a quantity does nothing. Keyboard order entry is expected in a terminal-style trade bar.
**Fix:** Wrap the inputs in `<form onSubmit={(e) => { e.preventDefault(); trade("buy"); }}>` only if Buy is the intended default. Otherwise, leave this as is and document it.

---

_Reviewed: 2026-09-26T08:15:17Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
