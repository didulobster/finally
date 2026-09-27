---
status: testing
phase: 02-trading-portfolio
source: [02-VERIFICATION.md]
started: 2026-09-27T02:36:50Z
updated: 2026-09-27T02:36:50Z
---

## Current Test

number: 1
name: Visual retest of the trade bar (G-02-1, G-02-3)
expected: |
  Run scripts/start_mac.sh first (the running finally container uses image 43e7664, built before 02-07). At about 1600x1000, buy 1 AAPL, sell 1 AAPL, then try to sell 1000 AAPL; narrow the window to about 800 px with the AI chat drawer open. The Bought line is green, the Sold line is the normal light text color, and the rejection is red. At about 800 px, Buy and Sell are visible with no scrolling inside the Trade panel. At full width the trade bar is one row.
awaiting: user response

## Tests

### 1. Visual retest of the trade bar (G-02-1, G-02-3)
expected: Run scripts/start_mac.sh first (the running finally container uses image 43e7664, built before 02-07). At about 1600x1000, buy 1 AAPL, sell 1 AAPL, then try to sell 1000 AAPL; narrow the window to about 800 px with the AI chat drawer open. The Bought line is green, the Sold line is the normal light text color, and the rejection is red. At about 800 px, Buy and Sell are visible with no scrolling inside the Trade panel. At full width the trade bar is one row.
result: [pending]

### 2. Package approval timing (02-05)
expected: You typed "approved" at the 02-05 package checkpoint (vitest 5.0.2, its vite 8.x peer, @types/node ^24) before commit fe894d3 installed them.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
