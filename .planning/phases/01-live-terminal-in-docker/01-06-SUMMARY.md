---
phase: 01-live-terminal-in-docker
plan: 06
subsystem: infra
tags: [docker, gap-closure, phase-gate, playwright, sse, pytest]

requires:
  - phase: 01-live-terminal-in-docker (01-04)
    provides: HEAD builds the canonical D-01 frontend again
  - phase: 01-live-terminal-in-docker (01-05)
    provides: CLOSED-state stream reopen and test/sse-502-probe.mjs
provides:
  - The user's local `finally` image tag rebuilt from HEAD 79ef4e6 (G-01-1 direct cause removed)
  - Proof that the rebuilt image serves the D-01 grid and recovers from a 502 reconnect (G-01-2 closed in the shipped image)
  - Phase 1 gate re-run at HEAD in Docker: compose 3 passed, pytest 75 passed, gate-ok
affects: [phase-01 verification, UAT re-test, phase-02]

actuals:
  tokens: 0        # verification-only plan: no repository files changed
  tasks: 2
  commits: 0       # measured before the SUMMARY commit; no code commits by design
plan_head_before: 79ef4e61cd38bf29b0d4b0a968acca9a41dcd084

tech-stack:
  added: []
  patterns:
    - "Gap-closure gates rebuild the user's image tag but touch only throwaway containers (finally-gap-check, test compose project)"
    - "Container identity is compared with docker inspect (Id, Image digest, StartedAt, RestartCount, mounts), not the docker ps Image column, which shows the short ID once the tag moves"

key-files:
  created: []
  modified: []

key-decisions:
  - "No per-task commits: the plan changes no repository files; its only output is the rebuilt `finally` image tag and the evidence recorded here"
  - "User container compared by docker inspect fields; the docker ps Image column changing from `finally` to `a8ecec43c3e8` is the expected effect of moving the tag, not a change to the container"

patterns-established:
  - "Before/after docker inspect snapshot diff proves the user's container and volume were not touched by a gate"

requirements-completed: [DLVR-01, WTCH-01, HDR-01, HDR-04, BACK-02]

coverage:
  - id: D1
    description: "`finally` tag rebuilt from a clean HEAD; a throwaway container from it answers /api/health and serves / with the Heatmap and AI Assistant panel titles"
    requirement: DLVR-01
    verification:
      - kind: other
        ref: "Task 1 verify: docker build -t finally . + docker run finally-gap-check :8011 + curl /api/health ({\"status\":\"ok\"}) + grep Heatmap/AI Assistant $TMPDIR/g01-index.html (grid-titles-ok)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Rebuilt image recovers the price stream after a 502 reconnect with at most one live EventSource"
    requirement: HDR-04
    verification:
      - kind: automated_ui
        ref: "node test/sse-502-probe.mjs http://127.0.0.1:8011 -> sse-502-probe: PASS created=3 maxLive=1 502s=2 (twice: task run and tracer gate re-run)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Binding Phase 1 specs pass on the test/docker-compose.test.yml path at HEAD"
    requirement: WTCH-01
    verification:
      - kind: e2e
        ref: "docker compose -f test/docker-compose.test.yml run --rm playwright ... e2e/01-fresh-start.spec.ts e2e/06-sse-reconnect.spec.ts --grep-invert 'clicking a ticker' -> 3 passed (3.5s)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Backend pytest green at HEAD"
    requirement: BACK-02
    verification:
      - kind: unit
        ref: "UV_CACHE_DIR=$TMPDIR/uvcache uv run --directory backend pytest -q -> 75 passed, 2 warnings (baseline 75 passed in 01-01 and 01-03)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Binding test files unchanged since d92088b, only relative URLs in frontend source, no key names or values in the image's static bundle; user's container and volume untouched"
    verification:
      - kind: other
        ref: "Task 2 integrity gate -> gate-ok; docker inspect before/after diff -> user-state-unchanged"
        status: pass
    human_judgment: false
  - id: D6
    description: "User's own scripts/start_mac.sh (no --build) serves the full D-01 grid at :8000: layout, dark theme with no pure black, monospace numbers, drawer collapse/expand"
    requirement: HDR-01
    verification: []
    human_judgment: true
    rationale: "End-of-phase human check: replacing the user's running container and judging the look are the user's steps (the plan forbids the executor from restarting the user's container). Pending human verification."

duration: 2min
completed: 2026-09-26
status: complete
---

# Phase 1 Plan 06: Docker Gap-Closure Gate Summary

**The user's `finally` image is now built from HEAD 79ef4e6. A throwaway container from it serves the D-01 grid (Heatmap and AI Assistant titles), and the 502 probe passes (`PASS created=3 maxLive=1 502s=2`). The compose gate reports `3 passed (3.5s)`, pytest reports `75 passed`, and the integrity gate prints `gate-ok`. The user's container and data volume were not touched.**

## Performance

- **Duration:** about 2 min
- **Started:** 2026-09-26T02:19:55Z
- **Completed:** 2026-09-26T02:21:47Z
- **Tasks:** 2 (both verification-only)
- **Files modified:** 0

## Accomplishments

**G-01-1 (stale image) is closed.** The `finally` tag was rebuilt from a clean HEAD:

| | Image Id | Created |
|---|---|---|
| Before | `sha256:a8ecec43c3e80380ed817a0e2d496ec7c43fdd74216f7816324edbcaa48d1166` | 2026-09-25T04:01:29Z |
| After | `sha256:ca44884f1d4420a708f78850d15e7ecee6d448a0c8e4d36c752e44900ccf51ac` | 2026-09-26T02:20:25Z |

- The after Created time is later than the 01-05 fix commit `7de6aa4` (2026-09-26T02:16:53Z).
- Throwaway container `finally-gap-check` (port 8011, LLM_MOCK=true, empty MASSIVE_API_KEY, no volume) returned `{"status":"ok"}` on /api/health.
- Its `/` HTML (`$TMPDIR/g01-index.html`) contains `Heatmap` and `AI Assistant`.

**G-01-2 (502 reconnect) is closed in the shipped image.**
- `node test/sse-502-probe.mjs http://127.0.0.1:8011` printed `sse-502-probe: PASS created=3 maxLive=1 502s=2`.
- The tracer gate re-ran the whole verify command (cached rebuild, new container, grid check, probe) and got the same PASS line.
- `finally-gap-check` was removed both times, and `docker ps -aq --filter name=^finally-gap-check$` is empty.

**The Phase 1 gate at HEAD passes.**
- pytest: `75 passed, 2 warnings in 2.35s`, with 0 failed, 0 errors and 0 skipped. This matches the 75-passed baseline measured in 01-01 and 01-03 (01-03-SUMMARY coverage D4).
- Compose path, run with the same command as 01-03:

  ```
  ✓  1 [chromium] › e2e/01-fresh-start.spec.ts:4:5 › health endpoint responds (17ms)
  ✓  2 [chromium] › e2e/01-fresh-start.spec.ts:9:5 › fresh start shows default watchlist, $10k cash and streaming prices (1.2s)
  ✓  3 [chromium] › e2e/06-sse-reconnect.spec.ts:38:5 › price stream reconnects after a network drop (1.9s)

  3 passed (3.5s)
  ```

  It finished with `down -v`, and afterwards `docker compose -f test/docker-compose.test.yml ps -a -q` printed nothing. No `test-*` containers or `test_*` volumes remain.
- Integrity gate printed `gate-ok`:
  - binding test files are unchanged since d92088b;
  - frontend/app, components and store contain no absolute http(s) URL;
  - `/app/backend/static` in the rebuilt image (24 files) has no `OPENROUTER` or `sk-or-` match.

**The user's state was not touched.**
- Before and after, container `finally` had the same `docker inspect` fields: Id `511733ac4cfb…`, Image `sha256:a8ecec43…`, StartedAt `2026-09-26T01:29:59Z`, `restarts=0`, mount `finally-data:/app/db`. The diff was empty (`user-state-unchanged`), both after Task 1 and after Task 2.
- The `finally-data` volume had the same name, CreatedAt (2026-09-24T14:31:10Z) and mountpoint, before and after.
- The `docker ps` line changed from `511733ac4cfb finally Up 50 minutes (healthy)` to `511733ac4cfb a8ecec43c3e8 Up 51 minutes (healthy)`. The container is the same; only the display changed:
  - Docker now shows the short image ID because the `finally` tag moved to the new image.
  - The uptime text changes with time.
- The user's container still runs the old image `a8ecec43` until they run `scripts/start_mac.sh`.

## Task Commits

This plan changes no repository files, so the tasks have no code commits (measured `git rev-list --count 79ef4e6..HEAD` = 0 before the SUMMARY commit).

1. **Task 1 (tracer): rebuild `finally` at HEAD, grid + 502 probe in the container**: no commit (image rebuild only)
2. **Task 2: Phase 1 gate at HEAD (pytest, compose specs, integrity)**: no commit (verification only)

**Plan metadata:** `docs(01-06)` commit with this SUMMARY, STATE.md, ROADMAP.md and REQUIREMENTS.md.

## Files Created/Modified
None in the repository. Outside git, only the local Docker image tag `finally` changed (a8ecec43 -> ca44884f).

## Decisions Made
- No per-task commits, because there is nothing to commit. The orchestrator asked for atomic task commits, but empty commits would add no information.
- The user's container was compared with `docker inspect` fields, not the `docker ps` line (see Accomplishments).

## Deviations from Plan

None. The plan was executed as written.

## Issues Encountered
None. docker, curl, compose, the probe, and pytest ran with the sandbox disabled (docker socket, local ports), as the plan specified.

## Pending Human Verification (end of phase)
Run `scripts/start_mac.sh` from the repo root. No `--build` is needed, because the tag is already current. The script replaces the old container and keeps the `finally-data` volume. Then open http://localhost:8000 at about 1600x1000 and check:
1. The full D-01 grid:
   - header (FinAlly, Total value, Cash, LIVE dot) on top;
   - Watchlist on the left;
   - Chart over Trade in the center;
   - the AI Assistant drawer open on the right;
   - Heatmap, P&L and Positions along the bottom.
2. The theme is dark with no pure black, and the numbers are monospace.
3. The drawer toggle collapses the drawer to a thin edge tab and expands it again.

## User Setup Required
None.

## Next Phase Readiness
- G-01-1 and G-01-2 are closed in the shipped image. Phase 1 SC1 to SC5 are re-proven at HEAD in Docker.
- Still open: the human visual check above (UAT Test 1 re-test).
- Still open: deferred-items.md (header overflow at phone width; whether to commit the GSD tooling lib/ directories).

## Self-Check: PASSED
- The rebuilt image Id `ca44884f…` exists, and it was created after `7de6aa4`.
- The throwaway container `finally-gap-check` and the test compose project are gone.
- No commits are claimed. HEAD is still `79ef4e6` before the metadata commit.

---
*Phase: 01-live-terminal-in-docker*
*Completed: 2026-09-26*
