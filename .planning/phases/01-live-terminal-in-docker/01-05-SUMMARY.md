---
phase: 01-live-terminal-in-docker
plan: 05
subsystem: ui
tags: [sse, eventsource, zustand, playwright, reconnect]

requires:
  - phase: 01-live-terminal-in-docker (01-04)
    provides: canonical frontend build (frontend/store, @/* -> ./*), local E2E docs
provides:
  - connect() reopens its single EventSource 3 s after the browser closes it (non-200 reconnect)
  - test/sse-502-probe.mjs, a rerunnable 502 stream-recovery regression probe
  - test/README.md section on running the probe
affects: [01-06 docker re-verification, header status dot, price stream]

actuals:
  tokens: 1768
  tasks: 2
  commits: 3
plan_head_before: 9b34512257d82198dfb0f632a17f172e3fb85830

tech-stack:
  added: []
  patterns:
    - "Reopen an EventSource only on readyState CLOSED, after a fixed delay; CONNECTING stays on native retry"
    - "Standalone Node + Playwright probes live in test/ outside test/e2e so the binding runner never picks them up"

key-files:
  created:
    - test/sse-502-probe.mjs
  modified:
    - frontend/store/terminal.ts
    - test/README.md

key-decisions:
  - "D-10 ('no custom reconnect timers') is amended for the EventSource CLOSED state only, per the user's UAT Test 2 decision ('fix it now'): connect() reopens the stream REOPEN_DELAY_MS (3000) after readyState CLOSED, because the browser has stopped retrying. The CONNECTING path still uses native browser retry, and exactly one EventSource is live at a time."

patterns-established:
  - "CLOSED-only reopen: onerror reads the local instance's readyState; CLOSED -> disconnected + setTimeout(open, REOPEN_DELAY_MS); otherwise -> reconnecting and nothing else"

requirements-completed: [HDR-03, HDR-04, FND-02]

coverage:
  - id: D1
    description: "Price stream recovers without a reload after a reconnect answered with 502: status goes OFFLINE, returns to LIVE, prices move, maxLive = 1"
    requirement: HDR-04
    verification:
      - kind: automated_ui
        ref: "node test/sse-502-probe.mjs http://127.0.0.1:8012 (PASS created=3 maxLive=1 502s=2)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Network-level drop still recovers through native auto-retry, and fresh start still streams (binding subset)"
    requirement: HDR-03
    verification:
      - kind: e2e
        ref: "test/e2e/01-fresh-start.spec.ts + test/e2e/06-sse-reconnect.spec.ts --grep-invert 'clicking a ticker' (3 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Exactly one EventSource construction and only relative API/SSE URLs in frontend source; binding test files unchanged since d92088b"
    requirement: FND-02
    verification:
      - kind: other
        ref: "Task 2 regression gates command (regression-gates-ok)"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-09-26
status: complete
---

# Phase 1 Plan 05: Reopen the Price Stream After a Non-200 Reconnect Summary

**connect() now reopens its single EventSource 3 s after the browser closes it for good (502/non-event-stream), proven red-then-green by a new Node + Playwright 502 proxy probe, with the native TCP-drop retry path unchanged.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-09-26T02:14:57Z
- **Completed:** 2026-09-26T02:17:39Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Closed UAT gap G-01-2 (code-review WR-01): after a 502 on a stream reconnect, the header dot goes OFFLINE and returns to LIVE with moving prices once the server is reachable, with no page reload.
- Added `test/sse-502-probe.mjs`, which fails on the old store and passes on the fixed one:
  - Pre-fix: `sse-502-probe: FAIL stage=recover status=disconnected created=1 maxLive=1 502s=1`
  - Post-fix: `sse-502-probe: PASS created=3 maxLive=1 502s=2` (reproduced on the tracer gate re-run)
- The binding subset still passes locally: 01-fresh-start (without "clicking a ticker") + 06-sse-reconnect, `3 passed`.
- Regression gates print `regression-gates-ok`: one `new EventSource`, no absolute http(s) URL in frontend source, binding test files unchanged since d92088b.

## Task Commits

1. **Task 1 (tracer): 502 recovery end to end**
   - `0637c82` test(01-05): add 502 stream-recovery probe (fails on current store)
   - `7de6aa4` fix(01-05): reopen the price stream after the browser closes it (non-200 reconnect)
2. **Task 2: Regression + probe docs** - `4cf341c` docs(01-05): document the 502 recovery probe

## Files Created/Modified
- `test/sse-502-probe.mjs` - HTTP proxy that answers `/api/stream/prices` with 502 during an outage; Chromium page with an EventSource subclass that counts instances and max live; stages connect, outage, hold, recover, prices, single.
- `frontend/store/terminal.ts` - `REOPEN_DELAY_MS = 3000`; inner `open()` builds the one EventSource; onerror on CLOSED sets disconnected and schedules `setTimeout(open, REOPEN_DELAY_MS)`, otherwise sets reconnecting; cleanup does `clearTimeout(timer)` and `es.close()`. REST seeds, Status type, and store shape are unchanged.
- `test/README.md` - short "502 recovery probe" section after Local.

## Decisions Made
- **D-10 amended (CLOSED state only).** D-10 said to rely on native auto-retry with no custom reconnect timers. In UAT Test 2 the user chose "fix it now". So connect() now reopens the stream 3 s after readyState CLOSED, where the browser has already stopped retrying. The CONNECTING path still only sets "reconnecting" and leaves retrying to the browser, and at most one EventSource is ever live, because a replacement is only created after the previous one is CLOSED.

## Deviations from Plan

None - plan executed exactly as written.

Note: the commits land on `main`. The GSD branch-protection query reports `main` as protected, but the orchestrator explicitly directed sequential commits on `main` (branching_strategy none, same as 01-04).

## Issues Encountered
None. Build, uvicorn, Playwright, and the probe ran with the sandbox disabled (local port binding, Turbopack PostCSS worker), as the plan specified. Throwaway ports 8010/8012 and `$TMPDIR` DBs were used and cleaned up. The user's `finally` container and `finally-data` volume were not touched.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ready for 01-06, which reruns the probe and the binding specs against the Docker image.
- Only Chromium was exercised. Firefox and Safari follow the same WHATWG rule but were not run.

## Self-Check: PASSED
- FOUND: test/sse-502-probe.mjs, frontend/store/terminal.ts, test/README.md
- FOUND commits: 0637c82, 7de6aa4, 4cf341c (measured 3 commits since 9b34512)
- `test(01-05)` probe commit precedes the `fix(01-05)` store commit

---
*Phase: 01-live-terminal-in-docker*
*Completed: 2026-09-26*
