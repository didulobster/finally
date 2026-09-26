---
phase: 02-trading-portfolio
plan: 04
subsystem: ui
tags: [nextjs, tailwind, zustand, playwright, trade-bar, gap-closure]

requires:
  - phase: 02-trading-portfolio (02-01..02-03)
    provides: TradeBar, placeTrade, the 03-trading E2E spec and the Phase 2 grid
provides:
  - TradeResult carries the trade side; placeTrade sets it on every return
  - resultColor() in TradeBar (muted idle, red rejection, green buy fill, neutral sell fill)
  - Content-sized Trade panel (no fixed md height); TradeBar root min-h-16
  - E2E guards for result-line colors and for Buy/Sell visibility at 768x600 with chat open
affects: [03-chat-and-charts, trade-bar, 02-UI-SPEC, 02-CONTEXT D-02]

actuals:
  tokens: 4292
  tasks: 2
  commits: 2
plan_head_before: a169c53741f4997ebb80c6c5eeabd9862f60c52e

tech-stack:
  added: []
  patterns:
    - "Result color derived by a small module-level pure function (resultColor) from the store's TradeResult"
    - "Panels that hold wrapping content size to it (no fixed md height); Panel.tsx stays shared and untouched"

key-files:
  created: []
  modified:
    - frontend/store/terminal.ts
    - frontend/components/TradeBar.tsx
    - frontend/app/page.tsx
    - test/e2e/03-trading.spec.ts
    - .planning/phases/02-trading-portfolio/02-UI-SPEC.md
    - .planning/phases/02-trading-portfolio/02-CONTEXT.md

key-decisions:
  - "02-04: successful sell trade-result uses text-text (neutral); buy stays text-up, rejections text-down (user decision 2026-09-26 amends D-02, G-02-3)"
  - "02-04: Trade panel has no fixed md height and the bar is min-h-16, so a wrapped bar grows the panel instead of being clipped (G-02-1)"
  - "02-04: a sandboxed next build poisons .next/cache/turbopack with a cached EPERM; always run next build with the sandbox off"

patterns-established:
  - "Test-first gap closure: each new E2E assertion is shown failing on the pre-fix build, then passing after the fix"

requirements-completed: [TRAD-01, TRAD-02]

coverage:
  - id: D1
    description: "Successful sell trade-result renders in neutral text rgb(230, 237, 243); buy stays green rgb(63, 185, 80); rejection stays red rgb(248, 81, 73)"
    requirement: "TRAD-02"
    verification:
      - kind: e2e
        ref: "test/e2e/03-trading.spec.ts#buy shares / sell shares / rejected trades (toHaveCSS color)"
        status: pass
    human_judgment: false
  - id: D2
    description: "At 768x600 with the chat drawer open, Buy and Sell are fully in the viewport (Trade panel grows with the wrapped bar)"
    requirement: "TRAD-01"
    verification:
      - kind: e2e
        ref: "test/e2e/03-trading.spec.ts#Buy and Sell stay visible at a narrow desktop width"
        status: pass
    human_judgment: false
  - id: D3
    description: "At 1600x1000 the trade bar stays on one row and the full local suite (01 health + fresh start, 03, 04, 06) is green with the portfolio probe passing"
    requirement: "TRAD-01"
    verification:
      - kind: e2e
        ref: "cd test && npx playwright test e2e/01-fresh-start.spec.ts e2e/03-trading.spec.ts e2e/04-portfolio-viz.spec.ts e2e/06-sse-reconnect.spec.ts --grep-invert 'clicking a ticker' (10 passed)"
        status: pass
      - kind: integration
        ref: "node test/portfolio-probe.mjs http://127.0.0.1:8010 (PASS totals=19 samples=20)"
        status: pass
    human_judgment: false
  - id: D4
    description: "02-UI-SPEC.md and 02-CONTEXT.md describe the neutral sell line and the content-sized Trade panel"
    verification:
      - kind: other
        ref: "tone-gates-ok and layout-gates-ok grep gates from 02-04-PLAN.md"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-09-27
status: complete
---

# Phase 2 Plan 04: Trade bar gap closure (G-02-3, G-02-1) Summary

**The sell fill line now uses neutral text (buy green, rejection red) because TradeResult carries the side. The Trade panel sizes to the wrapped trade bar, so Buy and Sell stay visible at 768 px with the chat open. Both fixes have test-first E2E guards.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-09-26T23:47:18Z
- **Completed:** 2026-09-26T23:52:02Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- G-02-3 closed. `TradeResult` gains `side`. `resultColor()` in TradeBar returns `text-muted` (idle), `text-down` (rejected), `text-up` (buy fill) or `text-text` (sell fill).
- G-02-1 closed. The Trade panel dropped `md:h-24`, and the TradeBar root uses `min-h-16` instead of `h-full`. A wrapped bar now grows the panel.
- 03-trading.spec.ts gains three color assertions and one narrow-width test. Only lines were added, and no other test file changed.
- 02-UI-SPEC.md (Color table, Layout, Trade bar contract, Copywriting, Interaction Summary) and 02-CONTEXT.md (D-02, Claude's Discretion) now match the code.

## Test-first evidence

**Task 1 pre-fix run** (03 spec, build of the old code): `1 failed`, `2 passed`. The failure is at the sell color assertion:

```
Locator:  getByTestId('trade-result')
Expected: "rgb(230, 237, 243)"
Received: "rgb(63, 185, 80)"
  ... class="ml-2 min-w-0 flex-1 truncate font-mono text-xs text-up">Sold 1 MSFT @ $419.92</p>
[chromium] › e2e/03-trading.spec.ts:21:5 › sell shares: cash increases and position updates, then disappears
```

**Task 1 post-fix:** `3 passed`.

**Task 2 pre-fix run** of the new test alone (Task 1 build): `1 failed`, not in viewport:

```
Error: expect(locator).toBeInViewport() failed
Locator:  getByTestId('trade-buy')
Expected: in viewport
Received: viewport ratio 0
```

**Task 2 post-fix full local run** (fresh DB, port 8010): `10 passed (5.3s)`, then `portfolio-probe: PASS totals=19 samples=20`.

**Scratch layout measurement** (not committed; chat drawer open). Trade panel height, and whether the panel body overflows:

| Viewport | Rows | Panel | Body scroll/client |
|----------|------|-------|--------------------|
| 1600x1000 | 1 (ticker, buy, sell at the same y) | 94 px | 64/64 |
| 900x700 | 2 | 102 px | 72/72 |
| 850x600 | 2 | 102 px | 72/72 |
| 800x600 | 3 | 166 px | 136/136 |
| 768x600 | 4 | 182 px | 152/152 |

The body never overflows, so Buy and Sell are never clipped. Before the fix the body was 66 px at 800 and 768, which clipped the bar.

## Task Commits

1. **Task 1 (tracer): neutral text for a successful sell trade-result (G-02-3)**: `0a1002f` (fix)
2. **Task 2: Trade panel sizes to the bar so Buy and Sell stay visible (G-02-1)**: `100d2dc` (fix)

## Files Created/Modified

- `frontend/store/terminal.ts`: `TradeResult = { ok; side; text }`. Both failure returns carry the requested side, and the success return carries `t.side`.
- `frontend/components/TradeBar.tsx`: `resultColor()`. The root div class is `flex min-h-16 flex-wrap items-center gap-2 px-3`.
- `frontend/app/page.tsx`: the Trade Panel class is `${STACKED} md:shrink-0`.
- `test/e2e/03-trading.spec.ts`: 12 added lines, 0 deleted (numstat vs d92088b).
- `.planning/phases/02-trading-portfolio/02-UI-SPEC.md`, `02-CONTEXT.md`: amended as the plan specified.

## Decisions Made

- The sell fill line uses `text-text`, per the user decision of 2026-09-26 that amends D-02.
- The Trade panel is content-sized at md and up. Panel.tsx is untouched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Turbopack persistent cache poisoned by a sandboxed build**
- **Found during:** Task 1, step 5 (rebuild after the fix)
- **Issue:** The rebuild first ran inside the sandbox, where Turbopack's PostCSS worker cannot bind a local port (`binding to a port - Operation not permitted`). Two later runs with the sandbox off failed with the same error. Node could bind ports fine outside the sandbox (127.0.0.1, ::1, 0.0.0.0), so the cause was the cached result of the failed task, not the environment.
- **Fix:** Moved `frontend/.next/cache/turbopack` aside (to `$TMPDIR/turbopack-cache-poisoned` outside the sandbox) and rebuilt with the sandbox off. The build passed on the first try. It is a gitignored build cache, and no source or config changed.
- **Verification:** `✓ Compiled successfully`. The later builds also passed.
- **Committed in:** n/a (no tracked files)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** None on the code. Always run `next build` with the sandbox off. If a build fails with a cached EPERM, move `.next/cache/turbopack` aside.

## Issues Encountered

- See the deviation above. uvicorn on port 8010, curl, Playwright and the probe ran with the sandbox off, as the plan says. The user's container on port 8000 was not touched.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- G-02-1 (layout part) and G-02-3 are closed, with E2E guards. Plans 02-05 and 02-06 remain in this phase.
- The environment part of G-02-1 (the stale user container on IPv6 `*:8000`) is outside this plan.

---
*Phase: 02-trading-portfolio*
*Completed: 2026-09-27*

## Self-Check: PASSED
