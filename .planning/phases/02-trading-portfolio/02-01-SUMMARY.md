---
phase: 02-trading-portfolio
plan: 01
subsystem: ui
tags: [nextjs, zustand, trade-bar, positions, sse, playwright]

requires:
  - phase: 01-live-terminal-in-docker
    provides: zustand store with connect(), one EventSource, Panel grid, format.ts, static export served by FastAPI
provides:
  - TradeBar (trade-ticker, trade-quantity, trade-buy, trade-sell, trade-result)
  - placeTrade and applyPortfolio store actions; positions in the store
  - store/portfolio.ts livePrice and selectTotalValue (derived live header total)
  - Positions table with live Price/P&L/% plus loading and positions-empty states
  - test/portfolio-probe.mjs edge probe
affects: [02-02 heatmap and P&L chart, 02-03 docker gate, 04 chat trades]

actuals:
  tokens: 4150
  tasks: 2
  commits: 2
plan_head_before: 66a8b246bd0920e18711cc18c7173834fb5e2a94

tech-stack:
  added: []
  patterns:
    - "Derived live values: store raw server portfolio, compute totals from SSE prices at read time via primitive selectors"
    - "Store action returns a result for local component state; store written only on r.ok"

key-files:
  created:
    - frontend/store/portfolio.ts
    - frontend/components/TradeBar.tsx
    - frontend/components/Positions.tsx
    - test/portfolio-probe.mjs
  modified:
    - frontend/store/terminal.ts
    - frontend/store/format.ts
    - frontend/components/Header.tsx
    - frontend/app/page.tsx

key-decisions:
  - "Header total is derived (selectTotalValue), the stored server total was removed (HDR-02, D-05)"
  - "PositionRow uses one primitive selector useTerminal((s) => livePrice(position, s.prices))"
  - "Phase 2 work runs on branch gsd/phase-02-trading-portfolio (main is protected for executor commits)"

patterns-established:
  - "livePrice(p, prices) is the single fallback rule (SSE price, else API current_price) for all portfolio views"
  - "Edge probes live in test/*.mjs, print PASS or FAIL {stage}: {detail}, exit 0/1"

requirements-completed: [TRAD-01, TRAD-02, HDR-02, PORT-01, PORT-02]

coverage:
  - id: D1
    description: "Buy/sell from the trade bar fills a market order; cash and positions rows update, sold-to-zero row disappears"
    requirement: TRAD-01
    verification:
      - kind: e2e
        ref: "test/e2e/03-trading.spec.ts#buy shares: cash decreases and position appears"
        status: pass
      - kind: e2e
        ref: "test/e2e/03-trading.spec.ts#sell shares: cash increases and position updates, then disappears"
        status: pass
    human_judgment: false
  - id: D2
    description: "Rejected trades show backend text verbatim in trade-result with cash unchanged; 422 and 400 empty-input texts shown"
    requirement: TRAD-02
    verification:
      - kind: e2e
        ref: "test/e2e/03-trading.spec.ts#rejected trades show an error and leave cash unchanged"
        status: pass
      - kind: other
        ref: "node test/portfolio-probe.mjs http://127.0.0.1:8010 (empty-inputs, lowercase)"
        status: pass
    human_judgment: false
  - id: D3
    description: "total-value equals cash plus live positions value on every tick and after every trade"
    requirement: HDR-02
    verification:
      - kind: other
        ref: "node test/portfolio-probe.mjs http://127.0.0.1:8010 (identity, ticking)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Positions table with live Price, P&L and % (colored), alphabetical rows"
    requirement: PORT-01
    verification:
      - kind: e2e
        ref: "test/e2e/03-trading.spec.ts#buy shares: cash decreases and position appears"
        status: pass
      - kind: other
        ref: "node test/portfolio-probe.mjs (identity: row P&L = (price - avg) x qty)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Positions loading note and positions-empty state; visual styling of trade bar and table"
    requirement: PORT-02
    verification:
      - kind: e2e
        ref: "test/e2e/01-fresh-start.spec.ts#fresh start shows default watchlist, $10k cash and streaming prices"
        status: pass
    human_judgment: true
    rationale: "No spec asserts positions-empty text or the visual layout/colors of the trade bar and table at 1600x1000; a human should glance at it"

duration: 3min
completed: 2026-09-26
status: complete
---

# Phase 2 Plan 01: Trade Bar, Positions and Live Total Summary

**The trade bar POSTs market orders and writes the returned portfolio into the zustand store only on 200. The header total and each positions row's Price, P&L and % are now worked out from SSE prices through livePrice and selectTotalValue.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-09-26T06:52:12Z
- **Completed:** 2026-09-26T06:55:19Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- TradeBar: controlled inputs that keep their values, Buy and Sell always enabled, no form element, and a trade-result line (idle muted, success green, rejection red) with a title for truncated text.
- `placeTrade` reports a failed fetch, a 400 string detail and a 422 `detail[0].msg`. It builds the success text only from the response trade object.
- Stored server total removed. The header `total-value` comes from `useTerminal(selectTotalValue)` and updates on every tick.
- Positions table with per-row live price, P&L and %. It shows a loading note while cash is null and `positions-empty` when there are zero positions.
- Local fresh-DB run: 01-fresh-start, 03-trading and 06-sse-reconnect gave 6 passed. The portfolio probe printed PASS (18 distinct totals in 20 samples), and the source gates printed gates-ok.

## Task Commits

1. **Task 1 (tracer): Trade bar to store to positions row and cash** - `74e353a` (feat)
2. **Task 2: Live portfolio math, positions states, portfolio probe** - `667257e` (feat)

## Files Created/Modified
- `frontend/store/portfolio.ts` - livePrice and the primitive selectTotalValue
- `frontend/store/terminal.ts` - Position/TradeResult types, positions state, applyPortfolio, placeTrade; the stored total is removed
- `frontend/store/format.ts` - formatQty, formatSignedPrice
- `frontend/components/TradeBar.tsx` - trade entry and result line
- `frontend/components/Positions.tsx` - positions table with loading and empty states
- `frontend/components/Header.tsx` - total from selectTotalValue
- `frontend/app/page.tsx` - Trade and Positions panels render the new components
- `test/portfolio-probe.mjs` - empty-inputs, lowercase, identity, ticking probe

## Decisions Made
- PositionRow selects `livePrice(position, s.prices)`. This is a single primitive selector, so it satisfies both "per-row primitive selector" and "uses livePrice for its fallback".
- The success verb comes from `trade.side` in the response, not from the clicked button, so the line reflects only what the server executed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created branch gsd/phase-02-trading-portfolio before committing**
- **Found during:** Setup, before Task 1
- **Issue:** HEAD was `main`, which `git.base-branch --is-protected` reports as protected. The executor commit guard refuses to commit there, and `git.allow_default_branch_commits` is not set.
- **Fix:** Ran `git checkout -b gsd/phase-02-trading-portfolio` from 66a8b24. This matches the Phase 1 branch pattern (`gsd/phase-01-live-terminal-in-docker`). It did not change any files, and the uncommitted .planning files moved over unchanged.
- **Verification:** Both task commits are on the new branch. `main` is still at 66a8b24.

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No code impact. The orchestrator and later plans in this phase continue on `gsd/phase-02-trading-portfolio`. Merging to main (PR) is left to the user.

## Issues Encountered
- `uv run` for an ad-hoc edit script failed in the sandbox because `~/.cache/uv` is not writable. I used the Write tool instead. The uvicorn verify runs used the sandbox off, as the plan says.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 02-02 (heatmap, P&L chart) can build on `positions`, `livePrice` and `applyPortfolio`. It still needs to add `history`/`loadHistory` and call it from `placeTrade` after a fill.

---
*Phase: 02-trading-portfolio*
*Completed: 2026-09-26*

## Self-Check: PASSED
