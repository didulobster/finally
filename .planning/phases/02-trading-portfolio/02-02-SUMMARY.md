---
phase: 02-trading-portfolio
plan: 02
subsystem: ui
tags: [nextjs, zustand, lightweight-charts, d3-hierarchy, treemap, canvas, playwright]

requires:
  - phase: 02-trading-portfolio
    provides: "02-01 positions in the store, applyPortfolio, placeTrade, livePrice, format helpers"
provides:
  - "PnlChart: Lightweight Charts v5 area series of /api/portfolio/history (pnl-chart, data-points)"
  - "store history: Snapshot[] + loadHistory(); placeTrade refreshes history after a fill"
  - "Heatmap: squarified treemap of positions by live market value, inline rgba P&L colors (heatmap, heatmap-cell-{TICKER}, data-pnl)"
  - "lightweight-charts 5.2.1, d3-hierarchy 3.1.2, @types/d3-hierarchy 3.1.7 pinned exactly in the committed lockfile"
affects: [02-03 docker gate, 03 main ticker chart (reuses lightweight-charts), 04 chat trades (history refresh)]

actuals:
  tokens: 3310
  tasks: 3
  commits: 2
plan_head_before: 1ee44563d039c495ac4e8abd10a9419a142e8ce4

tech-stack:
  added: [lightweight-charts@5.2.1, d3-hierarchy@3.1.2, "@types/d3-hierarchy@3.1.7"]
  patterns:
    - "Canvas library owns its mount div (no React children); chart created in a mount effect, data pushed in a second effect keyed on memoized points"
    - "Treemap laid out in a unit square in render and rendered as percent-positioned divs (no measuring, no ResizeObserver)"
    - "Colors the E2E parses are inline rgb/rgba strings, never Tailwind opacity or palette classes"

key-files:
  created:
    - frontend/components/PnlChart.tsx
    - frontend/components/Heatmap.tsx
  modified:
    - frontend/store/terminal.ts
    - frontend/app/page.tsx
    - frontend/package.json
    - frontend/package-lock.json

key-decisions:
  - "The three new packages are pinned exactly (no caret), matching the next/react pin style and the threat model's exact-versions mitigation"
  - "History is replaced wholesale on every fetch (mount, post-trade, 30 s poll); only stored snapshots are plotted, deduped to one per second"
  - "Heatmap datum typed as the union Tile | { children: Tile[] } with an explicit children accessor; leaves cast back to Tile"

patterns-established:
  - "Client-only canvas libraries: import at module top, construct only inside useEffect; the static export prerender never touches the canvas"

requirements-completed: [PORT-03, PORT-04]

coverage:
  - id: D1
    description: "P&L panel draws a canvas area chart of stored portfolio snapshots, refreshed on mount, after trades and every 30 s"
    requirement: PORT-04
    verification:
      - kind: e2e
        ref: "test/e2e/04-portfolio-viz.spec.ts#P&L chart renders with snapshot data"
        status: pass
    human_judgment: false
  - id: D2
    description: "Heatmap shows one squarified tile per position sized by live market value, colored and data-pnl-tagged by P&L sign"
    requirement: PORT-03
    verification:
      - kind: e2e
        ref: "test/e2e/04-portfolio-viz.spec.ts#heatmap shows held positions colored by P&L"
        status: pass
    human_judgment: false
  - id: D3
    description: "Loading, empty and waiting states for heatmap and P&L chart; visual quality of tiles and chart at 1600x1000"
    requirement: PORT-03
    verification:
      - kind: automated_ui
        ref: "scratchpad viz-check at 1600x1000 (4 positions): no panel body scrolls, canvas height stable 258->258, labels legible"
        status: pass
    human_judgment: true
    rationale: "No spec asserts the empty/loading copy or tile legibility and chart look; a human should glance at the panels"
  - id: D4
    description: "Packages installed only after human approval, exact versions, no install scripts, in the committed lockfile"
    verification:
      - kind: other
        ref: "npm --prefix frontend ls ... + lockfile hasInstallScript check (deps-ok)"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-09-26
status: complete
---

# Phase 2 Plan 02: Heatmap and P&L Chart Summary

**The P&L panel now draws a Lightweight Charts v5 canvas area of stored portfolio snapshots, one point per second, green or red by first versus last. The Heatmap panel shows a d3-hierarchy squarified treemap of positions, sized by live market value and colored with inline rgba by P&L sign. The local Phase 2 subset reports 9 passed.**

## Performance

- **Duration:** 3 min (continuation after the Task 1 approval)
- **Started:** 2026-09-26T08:03:52Z
- **Completed:** 2026-09-26T08:07:19Z
- **Tasks:** 3 (Task 1 was the human legitimacy check, approved; no commit)
- **Files modified:** 6

## Accomplishments
- Installed lightweight-charts 5.2.1, d3-hierarchy 3.1.2 and @types/d3-hierarchy 3.1.7 after the human approval, with exact pins. The only transitive package is fancy-canvas 2.1.0. None of them has an install script.
- `store/terminal.ts` gained `Snapshot`, `history` and `loadHistory()`. `placeTrade` refreshes the history after a fill (ok path only).
- `PnlChart` creates the chart in a mount effect that also starts the 30 s poll. A second effect keyed on memoized points runs `applyOptions` (colors), `setData` and `fitContent`. While there are no points, the wrapper shows the "Waiting for the first portfolio snapshot…" overlay.
- `Heatmap` shows loading and empty notes. It computes the layout in render, one tile per position. Each tile carries `data-pnl` and an inline rgba color derived from the same P&L number, and a title of "{TICKER} · {value} · {pct}".
- Local fresh-DB run: 01-fresh-start, 03-trading, 04-portfolio-viz and 06-sse-reconnect gave 9 passed. The portfolio probe printed PASS (19 distinct totals in 20 samples), and the gates printed deps-ok and viz-gates-ok.
- Backstop check at 1600x1000 with 4 positions: no panel body scrolls, the canvas height is stable (no autosize feedback loop), and the tile labels are legible.

## Task Commits

1. **Task 1: Package legitimacy check** - no commit (checkpoint:human-verify, gate blocking-human, approved by the user)
2. **Task 2 (tracer): P&L chart end to end** - `9485445` (feat)
3. **Task 3: Heatmap and full local Phase 2 subset** - `ec8bca7` (feat)

## Files Created/Modified
- `frontend/components/PnlChart.tsx` - Lightweight Charts area chart of snapshots with a 30 s poll
- `frontend/components/Heatmap.tsx` - squarified treemap of positions with inline rgb/rgba colors
- `frontend/store/terminal.ts` - Snapshot type, history state, loadHistory, post-trade history refresh
- `frontend/app/page.tsx` - Heatmap and P&L panels render the new components
- `frontend/package.json`, `frontend/package-lock.json` - the three new packages, pinned exactly

## Decisions Made
- Exact pins: npm wrote caret ranges by default. I reinstalled with `--save-exact` to match the file's pin style for next and react, and the plan's "exact versions" mitigation (T-02-SC).
- The tracer feedback gate took the interactive, end-of-phase, automated-only verify path. I re-ran the verify (build, lint, deps-ok, 3 passed) and continued to expansion without a checkpoint.

## Deviations from Plan

None. The plan ran as written. The exact-pin install is within the plan's own "exact versions" requirement, not new scope.

## Issues Encountered
- None. `next build`, uvicorn on port 8010 and Playwright ran with the sandbox off, as the plan says. npm ran inside the sandbox, with registry.npmjs.org allowed and the cache at `$TMPDIR/npmcache`.

## Known Stubs

None. The Chart panel's "arrives in Phase 3" note is Phase 3 scope and was already there.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 02-03 (Docker gate) can run the same Phase 2 subset in `test/docker-compose.test.yml`. The Dockerfile's `npm ci` uses the committed lockfile.
- PORT-03 and PORT-04 are also declared by 02-03, so the shared-ID gate leaves them unmarked in REQUIREMENTS.md until 02-03's SUMMARY exists.

---
*Phase: 02-trading-portfolio*
*Completed: 2026-09-26*

## Self-Check: PASSED
