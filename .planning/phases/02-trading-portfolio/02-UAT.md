---
status: complete
phase: 02-trading-portfolio
source: [02-VERIFICATION.md]
started: 2026-09-26T08:21:31Z
updated: 2026-09-26T14:10:37Z
---

## Current Test

[testing complete]

## Tests

### 1. Heatmap legibility
expected: At 1600x1000 with 3-6 positions, every tile holding at least 10% of invested value shows a readable ticker and P&L %.
result: issue
reported: "i could not buy any ticker with the trade bar, as the trade bar is not available in UI"
severity: major

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
passed: 4
issues: 3
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-02-1
  truth: "At 1600x1000 with 3-6 positions, every heatmap tile holding at least 10% of invested value shows a readable ticker and P&L %."
  status: failed
  reason: "User reported: i could not buy any ticker with the trade bar, as the trade bar is not available in UI"
  severity: major
  test: 1
  artifacts: []
  missing: []

- gap_id: G-02-3
  truth: "Buy is green, Sell is red, and the trade-result line stays on one line."
  status: failed
  reason: "User reported: Sell message shown in green color (SOLD 1 FIG @ 54.00)"
  severity: cosmetic
  test: 3
  artifacts: []
  missing: []

- gap_id: G-02-5
  truth: "Header total does not depend on the order positions are summed, proven by a unit test that holds state fixed and sums positions in different orders."
  status: failed
  reason: "User reported: request a unit test instead"
  severity: minor
  test: 5
  artifacts: []
  missing: []
