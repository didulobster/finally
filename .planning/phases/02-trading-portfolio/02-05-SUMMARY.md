---
phase: 02-trading-portfolio
plan: 05
subsystem: testing
tags: [vitest, vite, typescript, unit-test, gap-closure, supply-chain]

requires:
  - phase: 02-trading-portfolio (02-01, 02-04)
    provides: selectTotalValue in frontend/store/portfolio.ts and the Header total-value it drives
provides:
  - "Minimal frontend unit runner: vitest 5.0.2 (exact), `npm test` = `vitest run`, no config, Node environment"
  - "frontend/store/portfolio.test.ts: correctness plus order-independence proof for selectTotalValue (G-02-5)"
  - "@types/node bumped ^20 -> ^24 (matches the Node 24 runtime)"
affects: [03-chat-and-charts, TEST-01 (v2), Dockerfile stage 1 npm ci]

actuals:
  tokens: 10554
  tasks: 2
  commits: 1
plan_head_before: de28244ed429c2f4c45e3aabc8a9eeed2fdd7472

tech-stack:
  added: ["vitest 5.0.2 (dev, exact pin)", "vite 8.3.1 (vitest peer, lockfile only)", "@types/node ^24 (was ^20)"]
  patterns:
    - "Frontend unit tests live beside the code as store/*.test.ts and use Vitest defaults (no config file)"
    - "Float totals are asserted to 1e-9 and to the formatted header string, never with exact equality across summation orders"

key-files:
  created:
    - frontend/store/portfolio.test.ts
  modified:
    - frontend/package.json
    - frontend/package-lock.json
    - frontend/README.md

key-decisions:
  - "02-05: user approved vitest 5.0.2, vite 8.x peer, @types/node ^24 at the blocking-human gate (T-02-SC2) before any install; npm resolved exactly the approved tree (51 new lockfile entries, fsevents the only new install script)"
  - "02-05: frontend unit runner is vitest 5.0.2 with no config and no DOM environment; TEST-01 (RTL rendering tests) stays deferred to v2"

patterns-established:
  - "Package approvals are checked against the resolved lockfile diff (entry count, majors, hasInstallScript) before committing"

requirements-completed: [HDR-02]

coverage:
  - id: D1
    description: "selectTotalValue = cash + sum of quantity x live price, with current_price used for a ticker with no live price (JPM); total 4716.834494"
    requirement: "HDR-02"
    verification:
      - kind: unit
        ref: "frontend/store/portfolio.test.ts#sums cash plus quantity x live price, falling back to current_price"
        status: pass
    human_judgment: false
  - id: D2
    description: "All 24 orders of the same four positions give the same header total $4,716.83 and the same value within 1e-9 (G-02-5)"
    requirement: "HDR-02"
    verification:
      - kind: unit
        ref: "frontend/store/portfolio.test.ts#gives the same header total for every order of the same positions"
        status: pass
    human_judgment: false
  - id: D3
    description: "Minimal runner: vitest 5.0.2 is the only new devDependency, @types/node ^24, test script 'vitest run', no vite/vitest config; build and lint green; selectTotalValue unchanged"
    verification:
      - kind: other
        ref: "02-05-PLAN.md Task 2 verify gates: deps-ok, runner-gates-ok"
        status: pass
      - kind: other
        ref: "npm --prefix frontend run build && npm --prefix frontend run lint (exit 0)"
        status: pass
    human_judgment: false

duration: 2min
completed: 2026-09-27
status: complete
---

# Phase 2 Plan 05: Vitest runner and header total order test (G-02-5) Summary

**Vitest 5.0.2 is now the frontend's one-command unit runner (`npm test`). A fixed-state test proves that selectTotalValue gives $4,716.83 (within 1e-9) for all 24 orders of the same positions, and that the total is cash + quantity x live price with the current_price fallback.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-09-27T00:16:39Z
- **Completed:** 2026-09-27T00:18:06Z
- **Tasks:** 2 (Task 1 was a human gate: approved, no commit)
- **Files modified:** 4

## Accomplishments

- G-02-5 closed with a real unit test instead of an accepted risk. `frontend/store/portfolio.test.ts` holds cash (1234.56) and live prices fixed, sums AAPL, JPM, MSFT and NVDA in all 24 orders, and checks the raw total and the `formatPrice` string the header shows.
- The math is pinned, so the test cannot pass vacuously. JPM has no live price and uses its `current_price` of 210.55, and the expected 4716.834494 was computed by hand.
- The runner is minimal: one new devDependency (`vitest` 5.0.2, exact), `@types/node` ^24, `"test": "vitest run"`, no config file and no DOM environment.
- `npm --prefix frontend test` reports `Test Files 1 passed (1)`, `Tests 2 passed (2)`. `next build` type-checks the test file (tsconfig includes `**/*.ts`) and compiles. eslint is clean.

## Task 1 approval (T-02-SC2)

Task 1 was a `gate="blocking-human"` package legitimacy checkpoint. The orchestrator showed it to the user, and the user typed **"approved"** for:

- @types/node ^20 -> ^24
- vitest pinned to exactly 5.0.2
- vite 8.x as Vitest 5's required peer, lockfile only
- 51 new lockfile entries, where the only new one with an install script is fsevents (optional, macOS only)

At approval time nothing was installed. HEAD was de28244 and `frontend/package.json` and `package-lock.json` matched HEAD (`git diff --quiet HEAD` exit 0).

**What npm actually resolved (checked against the pre-install lockfile before committing):** 51 added entries, 0 removed. vitest 5.0.2, vite 8.3.1, rolldown 1.2.11 with optional platform bindings, and lightningcss 1.33.0 nested under vite. Two entries changed: `@types/node` 20.19.43 -> 24.19.0 and `undici-types` 6.21.0 -> 7.24.6 (a dependency of @types/node). The only lockfile entries with install scripts are `fsevents` (new, optional) and the existing `unrs-resolver`. This matches the approval, so no second checkpoint was needed.

## Task Commits

1. **Task 1: Package legitimacy check**: no commit (human gate, approved)
2. **Task 2 (tracer): Install Vitest, add the test script, and prove selectTotalValue is order-independent**: `fe894d3` (test)

The tracer feedback gate (interactive, end-of-phase, automated-only verify) re-ran the verify commands. They passed, and there were no expansion tasks.

## Files Created/Modified

- `frontend/store/portfolio.test.ts`: two Vitest tests for `selectTotalValue`, with small `price`, `stateWith` and `permutations` helpers.
- `frontend/package.json`: `"test": "vitest run"`, `vitest` `5.0.2`, `@types/node` `^24`.
- `frontend/package-lock.json`: the vitest/vite tree that the Docker stage 1 `npm ci` consumes.
- `frontend/README.md`: one line: "`npm test` runs the Vitest unit tests (`store/*.test.ts`)."

## Verification

| Gate | Result |
|------|--------|
| `npm ls` + package.json/lockfile check | `deps-ok` |
| `npm --prefix frontend test` | 1 file, 2 passed |
| `npm --prefix frontend run build` | Compiled successfully, TypeScript finished, 4/4 static pages |
| `npm --prefix frontend run lint` | exit 0, no output |
| portfolio.ts unchanged vs 0196ca8, no vite/vitest config, README line | `runner-gates-ok` |

## Decisions Made

- The runner uses Vitest defaults (Node environment, `*.test.ts` discovery). There is no config file.
- The test does not assert exact equality across orders. Floating-point addition is not associative, so raw totals can differ in the last bit. The assertions are the formatted cents and 1e-9, as the plan specifies.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] npm wrote `@types/node` as `^24.19.0` instead of `^24`**
- **Found during:** Task 2, step 1 (first install)
- **Issue:** `npm install -D @types/node@^24` saves the resolved version with a caret (`^24.19.0`). The plan's truth and the user's approval say `^24`.
- **Fix:** Set the specifier to `^24` in package.json before the vitest install, which then synced the lockfile root entry (`"@types/node": "^24"`). The resolved version (24.19.0) is the same.
- **Files modified:** frontend/package.json, frontend/package-lock.json
- **Verification:** The lockfile root devDependencies show `"@types/node":"^24"`, and `npm ls` shows `@types/node@24.19.0`.
- **Committed in:** fe894d3

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The specifier now matches exactly what was approved. No scope change.

## Issues Encountered

- None. Both npm installs and the tests ran inside the sandbox (registry.npmjs.org allowed). `next build` and lint ran with the sandbox off, per the 02-04 note about turbopack cache poisoning. The build did not fail. Port 8000 and the user's container were not touched.
- `requirements.mark-complete` was not run for HDR-02. It is already `[x]` / Complete in REQUIREMENTS.md, and the shared-ID gate reported 0/1 ready because a sibling plan (02-06) still declares it.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- G-02-5 is closed. Plan 02-06 remains in this phase.
- Docker stage 1 `npm ci` now installs vitest and vite in the Node build stage only. The final image copies only `frontend/out` (T-02-14 accepted). A Docker rebuild was not part of this plan.
- TEST-01 (React Testing Library rendering and chat tests) stays deferred to v2.

---
*Phase: 02-trading-portfolio*
*Completed: 2026-09-27*

## Self-Check: PASSED
