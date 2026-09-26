---
phase: 01-live-terminal-in-docker
plan: 04
subsystem: infra
tags: [nextjs, tsconfig, zustand, gitignore, playwright, gap-closure]

requires:
  - phase: 01-live-terminal-in-docker (01-03)
    provides: D-01/D-02 terminal grid in frontend/app, components, store
provides:
  - HEAD builds the canonical Phase 1 frontend again (G-01-1 build blocker removed)
  - Single app tree (frontend/src and its vitest setup removed)
  - WR-02 fixed: Python ignore rules anchored to /backend/, backend/static/ ignored again
  - Verified local full-stack run commands restored in test/README.md
affects: [01-06 docker rebuild, phase 3 charts, any future frontend/lib helpers]

actuals:
  tokens: 119619
  tasks: 2
  commits: 2
plan_head_before: 1c0172ae59f33b6e3afc8e9488f6ff96e5a38350

tech-stack:
  added: []
  patterns:
    - "Restore known-good config byte-for-byte from git (git checkout <rev> -- files) instead of hand edits"

key-files:
  created: []
  modified:
    - frontend/tsconfig.json
    - frontend/package.json
    - frontend/package-lock.json
    - frontend/next.config.ts
    - frontend/README.md
    - .gitignore
    - test/README.md

key-decisions:
  - "Phase 1 tree (frontend/app, components, store) is canonical; frontend/src and the vitest toolchain were removed (frontend unit tests stay deferred to v2)"
  - "Installed GSD tooling lib/ dirs under .claude stay out of commits via an explicit /.claude/**/lib/ rule, preserving pre-plan behavior; committing them is left to the user (deferred-items.md)"

patterns-established:
  - "Python-template directory ignore rules are anchored to /backend/ so they never hide frontend source"

requirements-completed: [FND-01, DLVR-01]

coverage:
  - id: D1
    description: "HEAD builds and lints the canonical frontend; exported index.html contains the Heatmap and AI Assistant grid panels"
    requirement: FND-01
    verification:
      - kind: other
        ref: "npm --prefix frontend run build && npm --prefix frontend run lint && grep Heatmap/AI Assistant frontend/out/index.html"
        status: pass
    human_judgment: false
  - id: D2
    description: "Frontend config byte-identical to 9745561^; frontend/src and vitest files gone; frontend/app, components, store untouched"
    requirement: FND-01
    verification:
      - kind: other
        ref: "git diff --quiet 9745561^ -- frontend/{tsconfig.json,package.json,package-lock.json,next.config.ts,README.md}; git diff --quiet d92088b -- frontend/app frontend/components frontend/store"
        status: pass
    human_judgment: false
  - id: D3
    description: "Phase 1 binding specs pass against the locally served export (health, fresh start, SSE reconnect)"
    requirement: DLVR-01
    verification:
      - kind: e2e
        ref: "test/e2e/01-fresh-start.spec.ts + test/e2e/06-sse-reconnect.spec.ts (local uvicorn :8010, 3 passed)"
        status: pass
    human_judgment: false
  - id: D4
    description: ".gitignore no longer hides frontend/lib or frontend/var, still ignores backend/lib, backend/static, db/*.db; test/README.md restored; binding test files unchanged"
    verification:
      - kind: other
        ref: "Task 2 hygiene gate (git check-ignore checks) printed hygiene-ok"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-09-26
status: complete
---

# Phase 1 Plan 04: Restore the Canonical Frontend Build Summary

**HEAD builds the D-01 terminal grid again. The Phase 1 frontend config (the @/* alias back to ./*, zustand, and the known-good lockfile) is restored from 9745561^, the stray frontend/src tree and its vitest setup are gone, and the Python ignore rules are anchored to /backend/ (WR-02).**

## Performance

- **Duration:** about 3 min
- **Started:** 2026-09-26T02:10:13Z
- **Completed:** 2026-09-26T02:13Z
- **Tasks:** 2
- **Files modified:** 35 (7 modified, 28 deleted)

## Accomplishments
- `npm --prefix frontend run build` and `lint` pass at HEAD. `frontend/out/index.html` contains `Heatmap` and `AI Assistant`.
- Local E2E against the export with a fresh DB: 01-fresh-start and 06-sse-reconnect gave 3 passed.
- There is one canonical app tree again. frontend/app, components, and store are unchanged from d92088b.
- WR-02 is fixed: `frontend/lib/` is no longer ignored, and `backend/static/` is ignored again.
- test/README.md again lists the verified build, uvicorn, and Playwright local commands.

## Task Commits

1. **Task 1: Restore the canonical Phase 1 frontend build and remove frontend/src** - `600c5a0` (fix)
2. **Task 2: Anchor the Python ignore rules to backend and restore the local E2E docs** - `f869718` (chore)

## Files Created/Modified
- `frontend/tsconfig.json`, `package.json`, `package-lock.json`, `next.config.ts`, `README.md`: restored byte-for-byte from 9745561^.
- `frontend/src/**` (26 files), `frontend/vitest.config.mts`, `frontend/vitest.setup.ts`: deleted on purpose (user decision; recoverable from 9745561).
- `.gitignore`: the Python rules are anchored to /backend/, `backend/static/` is re-added, and there is an explicit `/.claude/**/lib/` rule.
- `test/README.md`: restored from 9745561^.

## Decisions Made
- The planned restore was followed as written. The only judgment call was the `.claude/**/lib/` rule (see Deviations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Anchoring `lib/` exposed untracked GSD tooling directories**
- **Found during:** Task 2
- **Issue:** The old unanchored `lib/` also hid `.claude/gsd-core/bin/lib/` (8.4 MB), `.claude/hooks/lib/`, and `.claude/scripts/lib/`. After anchoring, they showed up as untracked. Committing installed tooling is outside this plan's scope.
- **Fix:** Added an explicit, commented `/.claude/**/lib/` rule so they stay out of commits, as before the plan. Logged the "commit them or not" question in deferred-items.md for the user.
- **Files modified:** .gitignore, .planning/phases/01-live-terminal-in-docker/deferred-items.md
- **Verification:** `git status` shows no untracked files, `git ls-files -ci --exclude-standard` is empty, and the hygiene gate prints hygiene-ok.
- **Committed in:** f869718

**2. [Cosmetic] `backend/static/` placement**
- Placed after `!db/.gitkeep`, matching 9745561^ exactly.

---

**Total deviations:** 1 auto-fixed (1 blocking). **Impact:** it preserves the pre-plan git behavior for the tooling directories, and there is no scope creep.

## Issues Encountered
- `npm ci` needed the sandbox disabled: the registry was blocked and ~/.npm cache writes were denied. Build, uvicorn, and Playwright ran outside the sandbox as the plan specified. The local server on :8010 was stopped afterwards.
- Commits land on `main` because the project uses `branching_strategy: none` and all prior plan commits are on main. This follows the orchestrator's sequential-executor instruction.

## User Setup Required
None.

## Next Phase Readiness
- The build blocker is removed. Plan 01-06 can now rebuild the `finally` Docker image from HEAD.
- Open: deferred-items.md asks whether to commit the GSD tooling `lib/` directories.

---
*Phase: 01-live-terminal-in-docker*
*Completed: 2026-09-26*

## Self-Check: PASSED
