---
phase: 02-trading-portfolio
plan: 06
subsystem: testing
tags: [docker, playwright, vitest, e2e, container-gate, gap-closure]

requires:
  - phase: 02-trading-portfolio (02-04, 02-05)
    provides: trade bar gap fixes (G-02-1, G-02-3), 03-trading spec additions, and the Vitest runner with the selectTotalValue order test (G-02-5)
provides:
  - "Rebuilt local `finally` image tag at HEAD 5fab1b4 (created 2026-09-27T00:20:35Z), holding the gap-closure code"
  - "Container proof: portfolio probe PASS on a throwaway container, and 10 passed on the test compose path"
affects: [03-chat-and-charts, scripts/start_mac.sh (serves the rebuilt tag), phase 02 verification]

actuals:
  tokens: 0
  tasks: 2
  commits: 0
plan_head_before: 5fab1b4bed80f0740cb7e6f636bc279c738f25f2

tech-stack:
  added: []
  patterns:
    - "Gap-closure phases end with a container re-gate: rebuild the user's tag, probe a throwaway container, then run the binding specs on the compose path"

key-files:
  created: []
  modified: []

key-decisions:
  - "02-06: the compose path ran (no fallback). Phase 2 binding set reports 10 passed in the container, including the 02-04 sell-color and narrow-width assertions"

patterns-established: []

requirements-completed: [TRAD-01, TRAD-02, HDR-02]

coverage:
  - id: D1
    description: "`docker build -t finally .` succeeds from a clean tree at HEAD. Stage 1 npm ci installs the vitest lockfile on Linux (390 packages), and next build type-checks store/portfolio.test.ts"
    verification:
      - kind: other
        ref: "docker build -t finally . (exit 0; image created 2026-09-27T00:20:35Z, after plan start 00:20:00Z)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A throwaway container (finally-phase2-check, :8011, LLM_MOCK=true, no volume) from the rebuilt tag serves 'Market order' and passes the portfolio probe; it is removed afterwards"
    requirement: "TRAD-01"
    verification:
      - kind: integration
        ref: "node test/portfolio-probe.mjs http://127.0.0.1:8011 (PASS totals=16 samples=20; tracer gate re-run PASS totals=14 samples=20)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Compose path (test/docker-compose.test.yml, fresh tmpfs DB): 01-fresh-start, 03-trading, 04-portfolio-viz and 06-sse-reconnect report 10 passed, including the sell-color and narrow-width Buy/Sell tests (G-02-1, G-02-3)"
    requirement: "TRAD-02"
    verification:
      - kind: e2e
        ref: "docker compose -f test/docker-compose.test.yml run --rm playwright ... --grep-invert 'clicking a ticker' (10 passed (5.3s))"
        status: pass
    human_judgment: false
  - id: D4
    description: "Frontend unit test for selectTotalValue order independence passes (G-02-5)"
    requirement: "HDR-02"
    verification:
      - kind: unit
        ref: "npm --prefix frontend test (Test Files 1 passed, Tests 2 passed)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Integrity: binding test files differ from d92088b only by 12 lines added to 03-trading.spec.ts, backend unchanged vs 0196ca8, no absolute URLs in frontend source, no key names or values in the image's static bundle"
    verification:
      - kind: other
        ref: "02-06-PLAN.md Task 2 integrity command (gate-ok)"
        status: pass
    human_judgment: false
  - id: D6
    description: "User's visual retest of G-02-1 and G-02-3 in their own container from the rebuilt tag (green Bought, neutral Sold, red rejection; Buy/Sell visible at ~800 px with chat open; one-row bar at full width)"
    verification: []
    human_judgment: true
    rationale: "End-of-phase human check from the plan: these are the user-reported visuals, retested by the user in their own container via scripts/start_mac.sh"

duration: 2min
completed: 2026-09-27
status: complete
---

# Phase 2 Plan 06: Container re-gate after the gap closure Summary

**The `finally` tag was rebuilt at HEAD 5fab1b4 and now holds the G-02-1, G-02-3 and G-02-5 fixes. A throwaway container from it passes the portfolio probe. The test compose path reports `10 passed (5.3s)`, the Vitest unit tests report 2 passed, and the integrity gate prints `gate-ok`.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-09-27T00:20:00Z
- **Completed:** 2026-09-27T00:21:51Z
- **Tasks:** 2 (both verification only)
- **Files modified:** 0 repo files (one rebuilt local image tag)

## Accomplishments

- **Task 1 (tracer).** `docker build -t finally .` succeeded from a clean tree. Stage 1 `npm ci` installed 390 packages, which includes vitest and vite from the 02-05 lockfile. `next build` compiled, finished TypeScript (so it type-checked `store/portfolio.test.ts`) and generated 4/4 static pages. The new image `sha256:d3423355…` was created at 00:20:35Z. The throwaway container `finally-phase2-check` on :8011 served "Market order" and printed `portfolio-probe: PASS totals=16 samples=20`. The tracer feedback gate re-ran the verify (`PASS totals=14 samples=20`) before Task 2 started.
- **Task 2, compose path (no fallback needed).** `docker compose -f test/docker-compose.test.yml build finally`, then the playwright run of 01, 03, 04 and 06 with `--grep-invert 'clicking a ticker'`:

  ```
  Running 10 tests using 1 worker
    ✓ 01 health endpoint responds
    ✓ 01 fresh start shows default watchlist, $10k cash and streaming prices
    ✓ 03 buy shares: cash decreases and position appears
    ✓ 03 sell shares: cash increases and position updates, then disappears
    ✓ 03 rejected trades show an error and leave cash unchanged
    ✓ 03 Buy and Sell stay visible at a narrow desktop width
    ✓ 04 heatmap shows held positions colored by P&L
    ✓ 04 P&L chart renders with snapshot data
    ✓ 04 positions table lists every held position
    ✓ 06 price stream reconnects after a network drop
    10 passed (5.3s)
  ```

  After the run, `docker compose -f test/docker-compose.test.yml down -v` ran, and `ps -a` for the project lists no containers.
- **Task 2, unit test.** `npm --prefix frontend test` reports `Test Files 1 passed (1)`, `Tests 2 passed (2)` (Vitest 5.0.2).
- **Task 2, integrity.** numstat against d92088b is `12 0 test/e2e/03-trading.spec.ts` only. The backend is unchanged against 0196ca8. There are no `http(s)://` strings in frontend/app, components or store. The image's `/app/backend/static` has no `OPENROUTER` or `sk-or-` hits. The command printed `gate-ok`.

## Docker state before and after

| Check | Before | After |
|-------|--------|-------|
| `finally-data` volume | listed | listed (untouched) |
| `finally-phase2-check` container | absent | absent (removed after each run) |
| test compose project containers | none | none (`down -v`) |
| `finally` image | created 2026-09-26T08:10:00Z | created 2026-09-27T00:20:35Z |
| container named `finally` | none in `docker ps -a` | none (not touched) |
| listener on :8000 | none | none |

The orchestrator's note said a stale user container was listening on IPv6 `*:8000`. At the start of this plan, `docker ps -a` showed no `finally` container, and `lsof` showed nothing listening on 8000 or 8011. Nothing was stopped or removed. `scripts/start_mac.sh` will create the user's `finally` container from the rebuilt tag with the existing `finally-data` volume.

## Task Commits

1. **Task 1 (tracer): rebuild the `finally` tag at HEAD and probe a throwaway container**: no commit (verification only; no repo files change)
2. **Task 2: compose gate (10 passed), frontend unit test, integrity gates**: no commit (verification only)

**Plan metadata:** this SUMMARY and the tracking updates, in one docs commit.

## Files Created/Modified

None in the repo. The only artifact is the rebuilt local Docker image tag `finally:latest`.

## Decisions Made

- The compose path ran cleanly, so the 02-03 fallback (a throwaway container plus local Playwright) was not used.

## Deviations from Plan

None. The plan ran exactly as written.

## Issues Encountered

- None. Docker, curl on local ports, the probe's Chromium and the compose run all ran with the sandbox off, as the orchestrator's environment notes say. The Vitest run ran inside the sandbox.

## Pending human check (end of phase)

These are for the user's own retest of G-02-1 and G-02-3 in `/gsd-verify-work`:

1. Check that nothing else listens on port 8000 (`lsof -nP -iTCP:8000 -sTCP:LISTEN`), then run `scripts/start_mac.sh` from the repo root.
2. Open http://localhost:8000 at about 1600x1000. Buy 1 AAPL, sell 1 AAPL, then try to sell 1000 AAPL. The "Bought" line should be green, the "Sold" line the normal light text color, and the rejection red.
3. Open the AI chat drawer and narrow the window to about 800 px. Buy and Sell should be visible under the inputs, with no scrolling inside the Trade panel. At full width the trade bar should be one row.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- All six Phase 2 plans have SUMMARYs. ROADMAP Phase 2 criterion 5 is green in the container, including the gap-closure assertions.
- The phase is ready for verification. The only open item is the user's visual retest above.

---
*Phase: 02-trading-portfolio*
*Completed: 2026-09-27*

## Self-Check: PASSED
