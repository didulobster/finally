---
phase: 02-trading-portfolio
plan: 07
subsystem: ui
tags: [zustand, vitest, tdd, precision, docker, playwright, gap-closure]

requires:
  - phase: 02-trading-portfolio (02-05, 02-06)
    provides: Vitest runner with the first selectTotalValue order test, and the container re-gate shape
provides:
  - "selectTotalValue sums whole cents: cents(cash) + cents(qty x live price) per position, divided by 100 once. Order cannot change the header total, and it matches backend get_portfolio rounding"
  - "portfolio.test.ts: exact toBe equality across all 6 orders of a real half-cent boundary (11899.145) and all 24 orders of the 02-05 fixture, the backend value 11899.14, and the empty and null cases"
  - "Rebuilt local `finally` image tag (sha256:e609d826…, created 2026-09-27T02:24:33Z) holding the fix"
affects: [03-chat-and-charts, phase 02 verification (G-02-5)]

actuals:
  tokens: 1938
  tasks: 2
  commits: 2
plan_head_before: 53f4b676309c5e5543eb9647451e3af871316ef7

tech-stack:
  added: []
  patterns:
    - "Money totals shown in the UI are summed in integer cents (Math.round per term, divide by 100 once), matching the backend's per-position rounding"
    - "Order-independence tests use a fixture at a real rounding boundary and exact toBe, never a tolerance"

key-files:
  created: []
  modified:
    - frontend/store/portfolio.ts
    - frontend/store/portfolio.test.ts
    - .planning/phases/02-trading-portfolio/02-UI-SPEC.md

key-decisions:
  - "02-07: G-02-5 closed by fixing the code (integer-cents sum), not by restating the truth or recording an override, per the user decision of 2026-09-27"
  - "02-07: the frontend header total rounds each position to cents like backend get_portfolio, so at the 11899.145 boundary both give 11899.14"

patterns-established:
  - "Integer-cents summation for displayed money totals"

requirements-completed: [HDR-02]

coverage:
  - id: D1
    description: "selectTotalValue sums in whole cents: 02-05 fixture gives exactly 4716.83, with the JPM current_price fallback"
    requirement: "HDR-02"
    verification:
      - kind: unit
        ref: "frontend/store/portfolio.test.ts#sums cash plus each position rounded to cents, falling back to current_price"
        status: pass
    human_judgment: false
  - id: D2
    description: "All 24 orders of the 02-05 fixture give exactly 4716.83 and '$4,716.83'; all 6 orders of the half-cent boundary fixture give the identical total (G-02-5)"
    requirement: "HDR-02"
    verification:
      - kind: unit
        ref: "frontend/store/portfolio.test.ts#gives exactly the same header total for every order of the same positions"
        status: pass
      - kind: unit
        ref: "frontend/store/portfolio.test.ts#gives exactly the same total in every order at a half-cent boundary"
        status: pass
    human_judgment: false
  - id: D3
    description: "At the boundary the total is exactly 11899.14 ('$11,899.14'), the backend's value; no positions gives the cash; null cash gives null"
    requirement: "HDR-02"
    verification:
      - kind: unit
        ref: "frontend/store/portfolio.test.ts#rounds a half-cent boundary total the way the backend does"
        status: pass
      - kind: unit
        ref: "frontend/store/portfolio.test.ts#returns the cash alone with no positions, and null before the portfolio loads"
        status: pass
    human_judgment: false
  - id: D4
    description: "The new tests fail on the 0196ca8 float reduce with 'expected 11899.144999999999 to be 11899.145' (4 failed, 1 passed), and the fixed file is restored byte-for-byte"
    verification:
      - kind: other
        ref: "02-07-PLAN.md Task 1 RED re-proof verify (printed red-proven)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Local build on port 8010: 01, 03, 04 and 06 report 10 passed, and the portfolio probe passes (header total = cash + sum qty x price on every sample)"
    requirement: "HDR-02"
    verification:
      - kind: e2e
        ref: "BASE_URL=http://localhost:8010 npx playwright test 01 03 04 06 --grep-invert 'clicking a ticker' (10 passed (5.2s))"
        status: pass
      - kind: integration
        ref: "node test/portfolio-probe.mjs http://127.0.0.1:8010 (PASS totals=19 samples=20)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Rebuilt `finally` tag: throwaway container on 8011 serves 'Market order' and passes the probe; compose path reports 10 passed; unit test 5 passed; integrity gate-ok"
    verification:
      - kind: integration
        ref: "node test/portfolio-probe.mjs http://127.0.0.1:8011 (PASS totals=18 samples=20)"
        status: pass
      - kind: e2e
        ref: "docker compose -f test/docker-compose.test.yml run --rm playwright ... (10 passed (5.2s))"
        status: pass
      - kind: other
        ref: "02-07-PLAN.md Task 2 integrity command (gate-ok)"
        status: pass
    human_judgment: false
  - id: D7
    description: "02-UI-SPEC Header total bullet and 'loading | Header total value' row describe the whole-cents sum"
    verification:
      - kind: other
        ref: "02-07-PLAN.md Task 1 source/scope gate (cents-gates-ok)"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-09-27
status: complete
---

# Phase 2 Plan 07: Whole-cents header total (G-02-5) Summary

**selectTotalValue now adds whole cents (Math.round per position and for cash, divided by 100 once), so no order of positions can change the header total. It matches the backend's 11899.14 at a real half-cent boundary, and a test that failed on the old float reduce now passes.**

## Performance

- **Duration:** about 4 min
- **Started:** 2026-09-27T02:21:39Z
- **Completed:** 2026-09-27T02:25:23Z (gates); SUMMARY afterwards
- **Tasks:** 2 (Task 1 TDD tracer, Task 2 verification only)
- **Files modified:** 3

## Accomplishments

- **RED.** `frontend/store/portfolio.test.ts` now asserts exact `toBe` equality with no tolerance. The first run against the unchanged selector exited 1 with `Tests  4 failed | 1 passed (5)`:

  ```
  FAIL  ... > sums cash plus each position rounded to cents, falling back to current_price
  AssertionError: expected 4716.834494000001 to be 4716.83 // Object.is equality
  FAIL  ... > gives exactly the same header total for every order of the same positions
  AssertionError: expected 4716.834494000001 to be 4716.83 // Object.is equality
  FAIL  ... > gives exactly the same total in every order at a half-cent boundary
  AssertionError: expected 11899.144999999999 to be 11899.145 // Object.is equality
  FAIL  ... > rounds a half-cent boundary total the way the backend does
  AssertionError: expected 11899.145 to be 11899.14 // Object.is equality
  ```

  Test E (empty positions, null cash) passed, as the plan predicted.
- **GREEN.** `selectTotalValue` reduces from `cents(s.cash)`, adds `cents(p.quantity * livePrice(p, s.prices))` for each position, and returns `total / 100`. `cents` is module-private and `livePrice` is unchanged. `npm --prefix frontend test` reports `Tests  5 passed (5)`.
- **RED re-proof.** The plan's verify swapped in the 0196ca8 selector, reran the tests, restored the fixed file and printed `red-proven`. The fixed file was byte-identical afterwards.
- **Doc sync.** In 02-UI-SPEC.md, the Header total bullet (line 151) and the `loading | Header total value` row (line 212) now describe the whole-cents sum, with each position rounded to cents as the backend does (UAT G-02-5).
- **Local run (port 8010).** `next build` compiled and type-checked, and eslint exited 0. Playwright ran 01, 03, 04 and 06 and reported `10 passed (5.2s)`, then `portfolio-probe: PASS totals=19 samples=20`. The source/scope gate printed `cents-gates-ok`.
- **Container gate (Task 2).** `docker build -t finally .` succeeded; stage 1 `npm ci` and `next build` type-checked the new test on Linux. The new image `sha256:e609d826…` was created at 02:24:33Z, after the fix commit at 02:23:15Z. The throwaway `finally-phase2-check` container on :8011 served "Market order" and printed `portfolio-probe: PASS totals=18 samples=20`, and was then removed. The **compose path** ran; no fallback was needed:

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
    10 passed (5.2s)
  ```

  `down -v` ran afterwards. The unit test reported 5 passed. The integrity gate printed `gate-ok`: numstat against d92088b is `12 0 test/e2e/03-trading.spec.ts` only, the backend is unchanged against 0196ca8, there are no absolute URLs in the frontend source, and the image's static bundle has no key names or values.

## Docker state before and after

| Check | Before | After |
|-------|--------|-------|
| `finally-data` volume | listed | listed (untouched) |
| user's `finally` container | Up 2 hours, :8000, image sha256:43e7664… | unchanged (not stopped, removed or recreated) |
| `finally-phase2-check` | absent | absent (removed after the run) |
| test compose project containers | none | none (`down -v`) |
| `finally` image tag | created 2026-09-27T00:20:35Z | created 2026-09-27T02:24:33Z (sha256:e609d826…) |
| listener on :8011 | none | none |

The user's running `finally` container was started at 00:40:30Z from an older image (`43e7664…`), so it does **not** yet serve this fix. `scripts/start_mac.sh` runs `docker rm -f finally` and then starts a new container from the `finally` tag with the `finally-data` volume, so running it again picks up the rebuilt tag. I didn't do this myself because the plan forbids touching the user's container.

## Task Commits

1. **Task 1 (tracer, TDD): RED boundary test, then sum in whole cents**
   - `1fb7ff1` test(02-07): add failing half-cent boundary test for header total order (only frontend/store/portfolio.test.ts)
   - `df00fd1` fix(02-07): sum the header total in whole cents so order cannot change it (portfolio.ts + 02-UI-SPEC.md)
   - No refactor commit; nothing needed cleanup.
   - Tracer feedback gate (interactive, end-of-phase, automated-only verify): all Task 1 verify commands ran after both commits and passed, so no checkpoint and Task 2 proceeded.
2. **Task 2: rebuild the `finally` tag and re-prove in a container**: no commit (verification only)

**Plan metadata:** this SUMMARY with STATE/ROADMAP, in one docs commit.

## Files Created/Modified

- `frontend/store/portfolio.ts`: module-private `cents()` helper; `selectTotalValue` sums whole cents and divides by 100 once.
- `frontend/store/portfolio.test.ts`: `stateWith(ps, cash = CASH)`, `EXPECTED_TOTAL = 4716.83`, the `boundary` fixture with `BOUNDARY_CASH = 7916.37`, two renamed tests, three new ones, no `toBeCloseTo`, and the false comment removed.
- `.planning/phases/02-trading-portfolio/02-UI-SPEC.md`: two lines amended to the whole-cents contract.

## Decisions Made

- The fix went in as the plan specified (user decision 2026-09-27). No override and no tolerance assertion.
- The frontend follows the backend's rounding (per-position cents, then the sum), so the header and `/api/portfolio` `total_value` agree at the boundary.

## Deviations from Plan

### Tooling note (not a code change)

**1. [Rule 3 - Blocking tooling] The TDD RED evidence checker cannot parse Vitest output**
- **Found during:** Task 1, RED step
- **Issue:** `gsd-tools check tdd-red-evidence` returned `INVALID_RED (zero_tests_discovered)` for both the default and `--reporter=tap-flat` Vitest output. Root cause: the checker reads counts only from `node --test` TAP summary lines (`# tests N`, `# pass N`, `# fail N`, prohibition-enforcement.cjs lines 176-178), and Vitest does not print them. The same check listed the target test "gives exactly the same total in every order at a half-cent boundary" among its `failing_tests`, so the RED itself was real: exit 1, 5 tests found, and the target failed on the planned assertion.
- **Fix:** Summary lines were not faked. The plan's own stricter RED proof was used instead: `red-proven` (swap in the 0196ca8 selector, require the exact order-dependence message, restore byte-for-byte). `workflow.tdd_mode` is not enabled in config, so the plan-level gate is advisory.
- **Files modified:** none
- **Commit:** n/a

---

**Total deviations:** 1 (tooling; no scope or code change)
**Impact on plan:** None on the delivered code. The RED/GREEN commit order holds (`test(02-07)` 1fb7ff1 before `fix(02-07)` df00fd1).

## TDD Gate Compliance

- RED: `1fb7ff1` test(02-07). The target test failed on the planned assertion (quoted above).
- GREEN: `df00fd1`. The plan names this commit `fix(02-07)`, not `feat(02-07)`, so the executor's `^feat\(` grep will not find it. It is the GREEN commit, and 5 tests pass on it.
- REFACTOR: none needed.

## Issues Encountered

- `build rc=` was empty on the first build and lint run because the shell is zsh, where `PIPESTATUS` is unset. A rerun without pipes showed build exit 0 (Compiled successfully, TypeScript finished) and lint exit 0.
- `next build`, the local E2E run, the probes and Docker all ran with the sandbox off, per the environment notes. Vitest ran inside the sandbox. Port 8000 was never bound.
- The UI-SPEC edit used a short `python3` string replacement script. It is not project code; the project's `uv run` rule covers backend Python.

## Pending human check (end of phase, unchanged)

G-02-5 is proven by the unit test, so no human check was added. The two human items already in 02-VERIFICATION.md are unchanged. The user's visual retest of G-02-1 and G-02-3 now runs on this rebuilt tag after re-running `scripts/start_mac.sh`.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- G-02-5 is closed in code and test. All seven Phase 2 plans have SUMMARYs, and the phase is ready for re-verification.
- Review WR-02 (`terminal.ts` `r.json()` outside the try) and the other open review items are still open. They were out of this plan's scope.

---
*Phase: 02-trading-portfolio*
*Completed: 2026-09-27*

## Self-Check: PASSED
