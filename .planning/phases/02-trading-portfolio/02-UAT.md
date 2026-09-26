---
status: testing
phase: 02-trading-portfolio
source: [02-VERIFICATION.md]
started: 2026-09-26T08:21:31Z
updated: 2026-09-26T08:21:31Z
---

## Current Test

number: 1
name: Heatmap legibility
expected: |
  At 1600x1000 with 3-6 positions, every heatmap tile holding at least 10% of invested value shows a readable ticker and P&L %.
awaiting: user response

## Tests

### 1. Heatmap legibility
expected: At 1600x1000 with 3-6 positions, every tile holding at least 10% of invested value shows a readable ticker and P&L %.
result: [pending]

### 2. P&L chart sizing
expected: The P&L chart canvas fills its panel with no scrollbar and does not keep growing or jittering.
result: [pending]

### 3. Trade bar look
expected: Buy is green, Sell is red, and the trade-result line stays on one line.
result: [pending]

### 4. History timing
expected: A trade placed right before a 30 s history refresh still appears on the P&L chart.
result: [pending]

### 5. Total order independence
expected: Header total does not depend on the order positions are summed (accept as low risk or request a unit test).
result: [pending]

### 6. Success-line price
expected: The price in the trade success line comes only from the server's trade response (frontend/store/terminal.ts:81-83).
result: [pending]

### 7. Package approval
expected: The three packages (lightweight-charts, d3-hierarchy, @types/d3-hierarchy) were approved before commit 9485445. Note: the user replied "approved" at the 02-02 checkpoint in the execution session before the continuation executor ran.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
