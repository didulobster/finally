---
status: diagnosed
phase: 02-trading-portfolio
source: [02-VERIFICATION.md]
started: 2026-09-26T08:21:31Z
updated: 2026-09-26T14:29:28Z
---

## Current Test

[testing complete]

## Tests

### 1. Heatmap legibility
expected: At 1600x1000 with 3-6 positions, every tile holding at least 10% of invested value shows a readable ticker and P&L %.
result: pass
note: "First attempt hit a stale pre-Phase-2 Docker container on [::1]:8000 (user reported: i could not buy any ticker with the trade bar, as the trade bar is not available in UI). Retest on the Phase 2 build at http://127.0.0.1:8000: user reported 'trade bar shows at 127.0.0.1, heatmap readable'."

### 2. P&L chart sizing
expected: The P&L chart canvas fills its panel with no scrollbar and does not keep growing or jittering.
result: pass

### 3. Trade bar look
expected: Buy is green, Sell is red, and the trade-result line stays on one line.
result: issue
reported: "Sell message shown in green color (SOLD 1 FIG @ 54.00)"
severity: cosmetic

### 4. History timing
expected: A trade placed right before a 30 s history refresh still appears on the P&L chart.
result: pass

### 5. Total order independence
expected: Header total does not depend on the order positions are summed (accept as low risk or request a unit test).
result: issue
reported: "request a unit test instead"
severity: minor

### 6. Success-line price
expected: The price in the trade success line comes only from the server's trade response (frontend/store/terminal.ts:81-83).
result: pass

### 7. Package approval
expected: The three packages (lightweight-charts, d3-hierarchy, @types/d3-hierarchy) were approved before commit 9485445. Note: the user replied "approved" at the 02-02 checkpoint in the execution session before the continuation executor ran.
result: pass

## Summary

total: 7
passed: 5
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-02-1
  truth: "The trade bar's Buy and Sell buttons stay visible at every desktop width, including 768-850 px with the chat drawer open."
  status: failed
  reason: "Found during diagnosis of test 1 (test 1 itself passed on retest; the original report was a stale Docker container on [::1]:8000)."
  severity: minor
  test: 1
  root_cause: "At md widths the Trade panel has a fixed md:h-24 height beside fixed-width Watchlist (md:w-72) and ChatDrawer (md:w-80) columns. At 768-850 px the middle column is 144-226 px wide, the flex-wrap TradeBar wraps to 3-4 rows, and Buy/Sell are clipped inside the panel (macOS hides the scrollbar)."
  artifacts:
    - path: "frontend/app/page.tsx"
      issue: "Trade panel fixed md:h-24 clips wrapped content"
    - path: "frontend/components/TradeBar.tsx"
      issue: "flex-wrap controls wrap to 3-4 rows in a narrow column"
  missing:
    - "Let the Trade panel grow to fit its content at md widths (or keep the bar on one row) so Buy/Sell stay visible from 768 to 850 px"
  debug_session: ".planning/debug/g-02-1-trade-bar-not-visible.md"

- gap_id: G-02-3
  truth: "Buy is green, Sell is red, and the trade-result line stays on one line."
  status: failed
  reason: "User reported: Sell message shown in green color (SOLD 1 FIG @ 54.00)"
  severity: cosmetic
  test: 3
  root_cause: "TradeBar.tsx:19 colors trade-result by ok only (text-up on any success); TradeResult in terminal.ts:26 carries no side. This matches 02-UI-SPEC.md lines 84, 118, 172 and CONTEXT D-02, which the user now rejects. User decision 2026-09-26: successful sell line uses neutral text; buy success stays green; rejections stay red."
  artifacts:
    - path: "frontend/components/TradeBar.tsx"
      issue: "line 19 colors by ok only"
    - path: "frontend/store/terminal.ts"
      issue: "TradeResult has no side/tone; placeTrade returns ok:true for buys and sells alike"
    - path: ".planning/phases/02-trading-portfolio/02-UI-SPEC.md"
      issue: "lines 84, 118, 172 require text-up for sell success"
  missing:
    - "Carry the side (or a tone) in TradeResult; color buy success text-up, sell success neutral text, rejection text-down"
    - "Amend UI-SPEC lines 84/118/172 and CONTEXT D-02 to match"
    - "Optionally assert the trade-result color in test/e2e/03-trading.spec.ts"
  debug_session: ".planning/debug/g-02-3-sell-message-green.md"

- gap_id: G-02-5
  truth: "Header total does not depend on the order positions are summed, proven by a unit test that holds state fixed and sums positions in different orders."
  status: failed
  reason: "User reported: request a unit test instead"
  severity: minor
  test: 5
  root_cause: "Test coverage gap: the frontend has no unit test runner, and selectTotalValue (frontend/store/portfolio.ts) has no test proving the total is independent of summation order."
  artifacts:
    - path: "frontend/store/portfolio.ts"
      issue: "selectTotalValue untested"
    - path: "frontend/package.json"
      issue: "no unit test runner or test script"
  missing:
    - "Add a minimal frontend unit test runner and a test script"
    - "Unit test: selectTotalValue gives the same total for the same positions in different orders"
  debug_session: ""
