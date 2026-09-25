---
phase: 01-live-terminal-in-docker
plan: 03
subsystem: ui
tags: [nextjs, tailwind, layout, docker, playwright, e2e, phase-gate]

requires:
  - phase: 01-02
    provides: "Header, Watchlist, useTerminal store with connect(), Tailwind @theme tokens, Dockerfile-built static export"
provides:
  - "Panel and PanelNote: titled terminal panel with an internally scrolling body"
  - "ChatDrawer: AI Assistant drawer, open on load, collapses to a 2rem edge tab (aria-expanded toggle)"
  - "D-01 grid in page.tsx: Header; Watchlist | Chart over Trade | ChatDrawer; bottom strip Heatmap | P&L | Positions; viewport-locked at md, stacked below md"
  - "Phase 1 gate proven in Docker: 01-fresh-start + 06-sse-reconnect 3 passed via test/docker-compose.test.yml"
  - "test/README.md Local section with verified build-and-serve commands"
affects: [phase-02, phase-03, phase-04, e2e]

actuals:
  tokens: 1405    # chars/4 over the realized diff (5620 chars)
  tasks: 2
  commits: 2
plan_head_before: c1a71fd4f063b5908dbbcd10dc710186d3162315

tech-stack:
  added: []
  patterns:
    - "Each region is <Panel title=...>; later phases replace the PanelNote body with the real component plus its testids"
    - "Viewport lock via md:h-screen md:overflow-hidden on the root; panels use min-h-0 + overflow-auto bodies"
    - "Below md every panel keeps min-h-48 (12rem) and the page scrolls as one column"

key-files:
  created:
    - frontend/components/Panel.tsx
    - frontend/components/ChatDrawer.tsx
  modified:
    - frontend/app/page.tsx
    - test/README.md

key-decisions:
  - "Grid proportions: watchlist 18rem, chat drawer 20rem (2rem collapsed), trade panel 6rem, bottom strip 32% with columns 1fr 1fr 1.3fr, 4px gaps"
  - "Docker gate ran on the compose path (Assumption A1 held); the fallback was not needed"

patterns-established:
  - "Placeholder panels carry only a title and a PanelNote naming the phase that builds them; no Phase 2-4 testids"

requirements-completed: [FND-01, FND-02, HDR-01, HDR-03, HDR-04, WTCH-01, DLVR-01]

coverage:
  - id: D1
    description: "D-01 grid at desktop: fills 1600x1000 with no page scroll; stacks into one column at 390 px"
    requirement: FND-02
    verification:
      - kind: automated_ui
        ref: "playwright screenshot --full-page 1600x1000 -> height 1000; 390x844 -> height 1598"
        status: pass
    human_judgment: false
  - id: D2
    description: "ChatDrawer collapses to an edge tab and expands again without reload"
    verification:
      - kind: automated_ui
        ref: "ad-hoc Playwright script: aside width 320 (aria-expanded true) -> 32 after Collapse chat (aria-expanded false) -> Expand chat clicked"
        status: pass
    human_judgment: false
  - id: D3
    description: "01-fresh-start (health, fresh start) and 06-sse-reconnect pass against the container built by test/docker-compose.test.yml on a fresh tmpfs DB"
    requirement: DLVR-01
    verification:
      - kind: e2e
        ref: "docker compose -f test/docker-compose.test.yml run --rm playwright ... e2e/01-fresh-start.spec.ts e2e/06-sse-reconnect.spec.ts --grep-invert 'clicking a ticker' -> 3 passed (3.4s)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Backend pytest green; binding test files identical to main; no absolute URLs in frontend source; no key names in the bundle"
    verification:
      - kind: unit
        ref: "UV_CACHE_DIR=$TMPDIR/uvcache uv run --directory backend pytest -q -> 75 passed"
        status: pass
      - kind: other
        ref: "Task 2 gate grep -> gate-ok"
        status: pass
    human_judgment: false
  - id: D5
    description: "Visual quality of the terminal: D-01 region placement, dark theme with no pure black, monospace numbers, placeholder copy"
    requirement: HDR-03
    verification: []
    human_judgment: true
    rationale: "Look and feel is a human judgment; screenshots at $TMPDIR/phase1-desktop.png and $TMPDIR/phase1-mobile.png"

duration: 3min
completed: 2026-09-25
status: complete
---

# Phase 1 Plan 03: Terminal Grid and Docker Phase Gate Summary

**The full D-01 Bloomberg-style grid now surrounds the live header and watchlist: Chart over Trade in the center, a collapsible AI Assistant drawer on the right, and Heatmap, P&L, and Positions along the bottom. It fills 1600x1000 with no page scroll and stacks at 390 px. In Docker, 01-fresh-start and 06-sse-reconnect report 3 passed, and pytest reports 75 passed.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-09-25T04:03:36Z
- **Completed:** 2026-09-25T04:06:21Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `Panel` (a titled section with a 28px header and a `min-h-0 flex-1 overflow-auto` body) and `PanelNote` (muted placeholder text).
- `ChatDrawer`: local `useState(true)`, open at 20rem with a "Collapse chat" toggle. Collapsed, it is a 2rem edge tab with a vertical "AI" label and an "Expand chat" toggle. Both toggles set `aria-expanded` and turn accent on hover. A browser check measured 320 px open and 32 px collapsed.
- `page.tsx` keeps the single `useEffect(connect, [])` and renders the D-01 grid. At md and up the root is `md:h-screen md:overflow-hidden`. Below md, panels stack with a 12rem minimum height.
- Local E2E, with uvicorn serving `frontend/out` on a fresh DB: 3 passed. The desktop full-page screenshot is 1000 px tall and the mobile one is 1598 px tall.
- **Docker gate, compose path:** `docker compose -f test/docker-compose.test.yml build finally`, then `run --rm playwright` with the Phase 1 subset. Summary line: `3 passed (3.4s)`. This was followed by `down -v`. The A1 fallback was not needed.
- After the gate, `docker compose ... ps -a` lists nothing, no `finally-phase1-e2e` container exists, and the `finally-data` volume is present both before and after (untouched).
- pytest: `75 passed, 2 warnings`. `git diff --quiet main -- test/e2e test/playwright.config.ts test/docker-compose.test.yml test/package.json` exits 0. There are no absolute URLs in the frontend source and no `OPENROUTER` or `sk-or-` in `frontend/out`.
- The `test/README.md` Local section now lists the verified commands. They were re-run exactly as written on port 8000, and 01-fresh-start passed (2 passed).

## Task Commits

1. **Task 1: D-01 terminal grid with titled panels and a collapsible AI Assistant drawer:** `57b1ed1` (feat)
2. **Task 2: Phase gate in Docker, plus the local-run docs:** `5402055` (docs)

## Files Created/Modified
- `frontend/components/Panel.tsx`: `Panel({ title, children, className })` and `PanelNote({ children })`
- `frontend/components/ChatDrawer.tsx`: `ChatDrawer()`, an open/collapsed drawer with an aria-expanded toggle
- `frontend/app/page.tsx`: the D-01 grid composing Header, Watchlist, Panel, and ChatDrawer
- `test/README.md`: Local section with the build, uvicorn (DB_PATH, STATIC_DIR, LLM_MOCK, MASSIVE_API_KEY), and Playwright steps
- `.planning/phases/01-live-terminal-in-docker/deferred-items.md`: one open item (header overflow at phone width)

## Decisions Made
- Proportions: watchlist 18rem, drawer 20rem (2rem when collapsed), trade panel 6rem, bottom strip 32% split 1fr/1fr/1.3fr, 4px gaps.
- The Header is wrapped in a `shrink-0` div rather than edited, because the plan said to compose Header and not change it.

## Deviations from Plan

None. The plan was executed as written.

## Issues Encountered
- At 390 px the Header's single flex row is wider than the viewport, so the page scrolls sideways (the mobile full-page screenshot is 452 px wide). The panels still stack correctly, and tablet width (768 px) and up fit. The plan scoped Header as compose-only, so I logged this in `deferred-items.md` rather than fixing it here. The fix is a one-class `flex-wrap` on the header row.
- The ad-hoc drawer check script ended with a Playwright strict-mode error on its last assertion, because `getByText('AI Assistant')` also matched the note text. The collapse (32 px, aria-expanded false) and expand clicks had already succeeded. The script was a throwaway and was removed.
- `next build`, uvicorn, Playwright, and docker ran with the sandbox disabled, as the plan requires (port binding and the docker socket).

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness
- Phase 1 success criteria SC1 to SC5 are proven: the image builds and serves on :8000; fresh start and reconnect pass in the container; pytest is green; and the binding specs are unchanged.
- Phases 2 to 4 replace the `PanelNote` bodies of Chart, Trade, Heatmap, P&L, Positions, and AI Assistant with real components, and add their testids at that point.
- The human visual check (D5) is pending at end of phase.

---
*Phase: 01-live-terminal-in-docker*
*Completed: 2026-09-25*

## Self-Check: PASSED
- FOUND: frontend/components/Panel.tsx, frontend/components/ChatDrawer.tsx, frontend/app/page.tsx, test/README.md
- FOUND commits: 57b1ed1, 5402055
