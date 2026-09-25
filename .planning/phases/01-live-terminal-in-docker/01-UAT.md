---
status: testing
phase: 01-live-terminal-in-docker
source: [01-VERIFICATION.md]
started: 2026-09-25T04:45:00Z
updated: 2026-09-25T04:45:00Z
---

## Current Test

number: 1
name: Visual check of the terminal at 1600x1000
expected: |
  Header (FinAlly, Total value, Cash, LIVE dot) on top; Watchlist on the left; Chart over Trade in the center; AI Assistant drawer on the right; Heatmap, P&L, and Positions across the bottom. Dark theme with no pure black, monospace numbers, and green/yellow/red LIVE/RECONNECTING/OFFLINE dot. Build with `scripts/start_mac.sh --build` (the existing `finally:latest` image predates the grid).
awaiting: user response

## Tests

### 1. Visual check of the terminal at 1600x1000
expected: A dense dark terminal with the D-01 layout (header top; watchlist left; chart over trade in the center; AI drawer right; heatmap, P&L, and positions along the bottom); no pure black; monospace numbers; dot colors green/yellow/red.
result: [pending]

### 2. Decide on code-review WR-01 (SSE never reopens after a non-200 reconnect)
expected: Either accept it for Phase 1 (local container never returns non-200; a real network drop or server kill recovers), or schedule the 01-REVIEW.md WR-01 fix (reopen the EventSource after CLOSED).
result: [pending]

### 3. Decide on the header overflow at 390 px (deferred-items.md)
expected: Accept it (desktop-first; 768 px fits), or add flex-wrap to the Header row.
result: [pending]

### 4. Resolve the judgment-tier prohibitions
expected: Confirm that 01-01 has no PASS row unless it was exercised live or cited file:line, and that 01-03 placeholder panels show no invented data. Verifier's verdict (non-authoritative): both hold.
result: [pending]

### 5. MVP-mode goal format
expected: Accept the current goal wording, or run `/gsd-mvp-phase 1` to set a user-story goal.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
