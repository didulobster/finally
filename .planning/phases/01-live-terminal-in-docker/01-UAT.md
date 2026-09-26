---
status: complete
phase: 01-live-terminal-in-docker
source: [01-VERIFICATION.md]
started: 2026-09-25T04:45:00Z
updated: 2026-09-26T02:55:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Visual check of the terminal at 1600x1000
expected: A dense dark terminal with the D-01 layout (header top; watchlist left; chart over trade in the center; AI drawer right; heatmap, P&L, and positions along the bottom); no pure black; monospace numbers; dot colors green/yellow/red.
result: pass
auto_check: "2026-09-26 Playwright 1600x1000 vs image ca44884f: header (FinAlly, Total value, Cash, green LIVE dot), Watchlist left, Chart over Trade center, AI Assistant right, Heatmap/P&L/Positions bottom; body bg rgb(13,17,23); 0 pure-black backgrounds; no horizontal scroll. Layout PASS; aesthetic confirmation left to human."
note: "Re-test after gap closure 01-04..01-06. Run scripts/start_mac.sh (no --build needed; finally tag rebuilt in 01-06). Previous result: issue — only watchlist and header showed (G-01-1)."

### 2. Decide on code-review WR-01 (SSE never reopens after a non-200 reconnect)
expected: Either accept it for Phase 1 (local container never returns non-200; a real network drop or server kill recovers), or schedule the 01-REVIEW.md WR-01 fix (reopen the EventSource after CLOSED).
result: pass
source: automated
reported: "fix it now"
resolution: "Fixed by 01-05 (reopen 3s after readyState CLOSED); test/sse-502-probe.mjs PASS created=3 maxLive=1 502s=2; binding E2E 06-sse-reconnect still passes."

### 3. Decide on the header overflow at 390 px (deferred-items.md)
expected: Accept it (desktop-first; 768 px fits), or add flex-wrap to the Header row.
result: pass

### 4. Resolve the judgment-tier prohibitions
expected: Confirm that 01-01 has no PASS row unless it was exercised live or cited file:line, and that 01-03 placeholder panels show no invented data. Verifier's verdict (non-authoritative): both hold.
result: pass

### 5. MVP-mode goal format
expected: Accept the current goal wording, or run `/gsd-mvp-phase 1` to set a user-story goal.
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-01-1
  resolved_by: 01-04-PLAN.md, 01-06-PLAN.md
  resolved_at: 2026-09-26
  truth: "A dense dark terminal with the D-01 layout (header top; watchlist left; chart over trade in the center; AI drawer right; heatmap, P&L, and positions along the bottom)"
  status: resolved
  reason: "User reported: only watchlist on the left is showing and the header with status dot."
  severity: major
  test: 1
  root_cause: "(a) The running finally:latest image (a8ecec43) was built 2026-09-25T04:01Z from the 01-02 skeleton, before the grid commit 57b1ed1; start_mac.sh reuses an existing image without --build. (b) HEAD cannot rebuild: commit 9745561 added a second app tree frontend/src/, repointed tsconfig @/* to ./src/*, removed zustand (still imported by store/terminal.ts), and .gitignore 'lib/' hides frontend/src/lib/ — npm run build fails with 6 errors, so start_mac.sh --build aborts. USER DECISION: the Phase 1 tree (frontend/app, components, store) is canonical; frontend/src/ comes out of the build."
  artifacts:
    - path: "frontend/tsconfig.json"
      issue: "@/* points to ./src/* instead of ./*"
    - path: "frontend/package.json"
      issue: "zustand removed (and from package-lock.json) but store/terminal.ts imports it"
    - path: "frontend/src/"
      issue: "second, incomplete app tree conflicting with the Phase 1 tree (plus vitest.config.mts, vitest.setup.ts, src/__tests__)"
    - path: ".gitignore"
      issue: "unanchored lib/ (Python template) ignores frontend/**/lib/"
    - path: "scripts/start_mac.sh"
      issue: "silently reuses a stale finally image when not passed --build"
  missing:
    - "Restore tsconfig @/* to ./*"
    - "Restore zustand in package.json and package-lock.json"
    - "Remove frontend/src/ and its vitest config from the build (decide keep/delete of vitest setup)"
    - "Anchor Python-template lib/ etc. rules in .gitignore"
    - "Confirm docker build succeeds at HEAD and rebuild the finally tag; served / contains Heatmap and AI Assistant"
  debug_session: .planning/debug/g-01-1-only-watchlist-shows.md

- gap_id: G-01-2
  resolved_by: 01-05-PLAN.md, 01-06-PLAN.md
  resolved_at: 2026-09-26
  truth: "The live price stream recovers without a page reload even when a reconnect attempt gets a non-200 response (e.g. 502 from a proxy during redeploy)"
  status: resolved
  reason: "User reported: fix it now (code-review WR-01: EventSource closes permanently after a non-200 reconnect; dot stays OFFLINE until reload)"
  severity: major
  test: 2
  root_cause: "connect() in frontend/store/terminal.ts:54-59 opens one EventSource and relies only on browser auto-retry. A non-200 or non-event-stream reconnect response makes the browser fail the connection (readyState CLOSED, no further retries); onerror only sets 'disconnected' and nothing ever creates a new EventSource."
  artifacts:
    - path: "frontend/store/terminal.ts"
      issue: "single const EventSource; no path out of readyState CLOSED"
    - path: "test/e2e/06-sse-reconnect.spec.ts"
      issue: "proxy only drops TCP, so it cannot catch the CLOSED path (binding spec — must keep passing)"
  missing:
    - "On error with readyState CLOSED: set disconnected and reopen a new EventSource after a delay (~3s); when CONNECTING: set reconnecting and let the browser retry"
    - "Cleanup clears the retry timer and closes the current EventSource (never more than one live)"
    - "Regression check for a 502 outage (e.g. local probe) without modifying binding test files"
  debug_session: .planning/debug/g-01-2-sse-closed-no-reopen.md
