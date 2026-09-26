---
phase: 02-trading-portfolio
plan: 03
subsystem: testing
tags: [docker, docker-compose, playwright, e2e, pytest, gate]

requires:
  - phase: 02-trading-portfolio
    provides: "02-01 trade bar, positions, derived total, portfolio-probe.mjs; 02-02 heatmap and P&L chart"
provides:
  - "The local `finally` image tag rebuilt at HEAD aa8cf44, so scripts/start_mac.sh serves Phase 2 without --build"
  - "Phase 2 container gate green: compose path 01+03+04+06 = 9 passed (ROADMAP Phase 2 criterion 5)"
  - "test/README.md ## Portfolio probe section"
affects: [03 watchlist and main chart gate, 04 chat gate]

actuals:
  tokens: 240
  tasks: 2
  commits: 1
plan_head_before: aa8cf4429c7a55db3a4f80be7c02cb85b1f933d9

tech-stack:
  added: []
  patterns:
    - "Phase gate runs on throwaway containers only (finally-phase2-check, test compose project with down -v); the user's finally container and finally-data volume are compared before and after"

key-files:
  created: []
  modified:
    - test/README.md

key-decisions:
  - "Compose path ran directly; the port-8011 fallback was not needed"

patterns-established:
  - "Tracer for a Docker gate: rebuild the user's tag, then probe a throwaway container from it before running the binding specs"

requirements-completed: [TRAD-01, TRAD-02, HDR-02, PORT-01, PORT-02, PORT-03, PORT-04]

coverage:
  - id: D1
    description: "The rebuilt `finally` image serves the Phase 2 frontend (trade bar 'Market order', 'Loading positions') and passes the portfolio probe (empty inputs, lowercase ticker, total identity, ticking total)"
    requirement: HDR-02
    verification:
      - kind: other
        ref: "docker build -t finally . + node test/portfolio-probe.mjs http://127.0.0.1:8011 (portfolio-probe: PASS totals=17 samples=20; rerun PASS totals=14)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Binding specs pass in the container on the compose path: 01-fresh-start, 03-trading, 04-portfolio-viz, 06-sse-reconnect"
    requirement: PORT-03
    verification:
      - kind: e2e
        ref: "docker compose -f test/docker-compose.test.yml run --rm playwright ... e2e/01 e2e/03 e2e/04 e2e/06 --grep-invert 'clicking a ticker' (9 passed (5.0s))"
        status: pass
    human_judgment: false
  - id: D3
    description: "Backend pytest green after Phase 2"
    verification:
      - kind: unit
        ref: "UV_CACHE_DIR=$TMPDIR/uvcache uv run --directory backend pytest -q (75 passed)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Integrity gates: binding test files unchanged since d92088b, no absolute URLs in frontend source, no key names or values in the image bundle, README documents both probes"
    verification:
      - kind: other
        ref: "integrity command from 02-03-PLAN Task 2 verify (gate-ok)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Visual backstops: heatmap tile legibility (>=10% weight) and P&L canvas sizing at 1600x1000 with 3-6 positions, Buy green / Sell red, trade-result on one line"
    requirement: PORT-04
    verification: []
    human_judgment: true
    rationale: "Tile legibility and chart resize behavior are visual; the E2E specs only check tile area > 0 and canvas visibility (UI-SPEC backstop rows, RESEARCH A5)"

duration: 2min
completed: 2026-09-26
status: complete
---

# Phase 2 Plan 03: Docker Gate Summary

**The user's `finally` image tag is rebuilt at HEAD and a throwaway container from it passes the portfolio probe; on the test compose path (LLM_MOCK, fresh tmpfs DB) 01-fresh-start, 03-trading, 04-portfolio-viz and 06-sse-reconnect report 9 passed, pytest reports 75 passed, and the integrity gates print gate-ok.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-09-26T08:09:36Z
- **Completed:** 2026-09-26T08:11:34Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Task 1 (tracer): the tree was clean for frontend, backend, Dockerfile, .dockerignore and test. `docker build -t finally .` succeeded; the image was created at 2026-09-26T08:10:00Z, after the plan started. The container finally-phase2-check (port 8011, LLM_MOCK=true, no volume) served an index.html with "Market order" and "Loading positions". The probe printed `portfolio-probe: PASS totals=17 samples=20`. The tracer feedback gate (interactive, end-of-phase, automated-only verify) re-ran the verify: `PASS totals=14 samples=20`. The throwaway container was removed both times.
- Task 2: pytest `75 passed`. The compose gate ran on the **compose path** (no fallback needed). Playwright summary line: `9 passed (5.0s)`. `down -v` left `docker compose -f test/docker-compose.test.yml ps -a` empty.
- Integrity command printed `gate-ok`: binding test files unchanged since d92088b, no `http(s)://` in frontend/app, components or store, no `OPENROUTER` or `sk-or-` in /app/backend/static of the image.
- test/README.md gained a 3-line `## Portfolio probe` section (6 added lines, 0 removed).
- The user's `finally` container stayed running on its old image (ca44884f) throughout, and the `finally-data` volume was listed before and after. It picks up Phase 2 on the next `scripts/start_mac.sh`.

## Task Commits

1. **Task 1 (tracer): rebuild `finally` and pass the probe** - no commit (verification only; the plan lists no repo file changes)
2. **Task 2: Phase gate, pytest, integrity gates, probe docs** - `1341d25` (docs)

## Files Created/Modified
- `test/README.md` - new `## Portfolio probe` section on running test/portfolio-probe.mjs locally

## Decisions Made
- The compose path worked, so the documented port-8011 fallback did not run.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- None. Docker, curl on local ports and the probe's Chromium ran with the sandbox off, as the plan says. pytest ran in the sandbox; litellm's attempt to fetch a model price map from raw.githubusercontent.com was denied and did not affect the result.

## End-of-phase human check (queued)
Run `scripts/start_mac.sh` (the tag is current), open http://localhost:8000 at about 1600x1000, and buy 3 to 6 tickers (e.g. AAPL 10, MSFT 5, GOOGL 8, TSLA 4, NVDA 2). Expect: every heatmap tile with at least 10% of invested value shows a readable ticker and P&L %; the P&L canvas fills its panel with no scrollbar and no growing or jittering size; Buy is green, Sell is red; the trade-result line stays on one line.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 2 is complete: all three plans have summaries and ROADMAP criterion 5 is proven in the container.
- Phase 3 re-enables the "clicking a ticker" test and adds 02-watchlist to the gate.

---
*Phase: 02-trading-portfolio*
*Completed: 2026-09-26*

## Self-Check: PASSED
