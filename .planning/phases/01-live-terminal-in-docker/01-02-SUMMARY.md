---
phase: 01-live-terminal-in-docker
plan: 02
subsystem: ui
tags: [nextjs, static-export, tailwind, zustand, sse, eventsource, docker, playwright]

requires:
  - phase: 01-01
    provides: "Verified backend contract: /api/watchlist, /api/portfolio, /api/stream/prices (retry: 1000), SPAStaticFiles serving STATIC_DIR"
provides:
  - "frontend/ Next.js 16.3.6 static export (TS 5.9.3, Tailwind 4, zustand 5) with committed package-lock.json; docker build succeeds"
  - "useTerminal store plus connect(): REST seed and one EventSource, status connected/reconnecting/disconnected"
  - "Header (total-value, cash-balance, connection-status) and Watchlist (watchlist-row/price/change-{T}) with E2E testids"
  - "Tailwind @theme tokens: bg, panel, border, muted, text, accent, primary, submit, up, down"
affects: [01-03, phase-02, phase-03, phase-04, e2e]

actuals:
  tokens: 62560   # chars/4 over the realized diff incl. package-lock.json (~59k); source files alone ~3.4k
  tasks: 2
  commits: 2
plan_head_before: 6acb721a4625115a6cb72d46d57b86ed2b2b3a53

tech-stack:
  added: [next@16.3.6, react@19.2.8, react-dom@19.2.8, typescript@5.9.3, tailwindcss@4, "@tailwindcss/postcss@4", zustand@5.0.15, eslint@9, eslint-config-next@16.3.6]
  patterns:
    - "One zustand store (store/terminal.ts); components use primitive or per-ticker selectors (s.prices[ticker])"
    - "connect() called only from page.tsx useEffect; one native EventSource, no timers, relative /api paths only"
    - "E2E-read numbers render only once loaded (cash !== null && ...), formatted with Intl en-US"
    - "Frontend code lives in app/, components/, store/ (never lib/, which the root .gitignore ignores)"

key-files:
  created:
    - frontend/package.json
    - frontend/package-lock.json
    - frontend/next.config.ts
    - frontend/app/layout.tsx
    - frontend/app/globals.css
    - frontend/app/page.tsx
    - frontend/store/terminal.ts
    - frontend/store/format.ts
    - frontend/components/Header.tsx
    - frontend/components/Watchlist.tsx
  modified:
    - .gitignore

key-decisions:
  - "formatPercent uses Intl.NumberFormat en-US with signDisplay exceptZero (so -0.00 renders 0.00%)"
  - "Header shell moved from page.tsx (Task 1) into components/Header.tsx (Task 2); page.tsx renders Header plus a Watchlist section"
  - "watchlist-change-{T} is empty (no digits) until a price exists; watchlist-price-{T} shows an em dash"

patterns-established:
  - "Local E2E loop: npm --prefix frontend run build, then uvicorn with STATIC_DIR=frontend/out and DB_PATH under $TMPDIR on port 8010"
  - "Docker checks use container finally-phase1, volume finally-phase1-check, host port 8010; removed afterwards"

requirements-completed: [FND-01, FND-02, HDR-01, HDR-03, HDR-04, WTCH-01, DLVR-01]

coverage:
  - id: D1
    description: "docker build of the repo succeeds; the container serves / (FinAlly) and /api/health on container port 8000; the DB persists on the /app/db volume across container recreation (2 snapshots)"
    requirement: DLVR-01
    verification:
      - kind: integration
        ref: "Task 1 verify: docker build -t finally . ; finally-phase1 recreate on finally-phase1-check volume -> 'snapshots 2', RC=0"
        status: pass
    human_judgment: false
  - id: D2
    description: "Next.js 16 + TS 5.9 static export (output: \"export\" only) with Tailwind 4 dark @theme tokens using the PLAN.md colors"
    requirement: FND-01
    verification:
      - kind: other
        ref: "rm -rf frontend/.next && npm --prefix frontend run build && test -f frontend/out/index.html; npm --prefix frontend run lint"
        status: pass
    human_judgment: false
  - id: D3
    description: "Fresh start shows exactly 10 watchlist rows with streaming prices and 10000 cash and total value"
    requirement: WTCH-01
    verification:
      - kind: e2e
        ref: "test/e2e/01-fresh-start.spec.ts#fresh start shows default watchlist, $10k cash and streaming prices (local, uvicorn serving frontend/out)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Connection status leaves connected on a TCP drop and returns to connected with TSLA prices resuming, loaded via a different-origin proxy (relative /api paths)"
    requirement: HDR-04
    verification:
      - kind: e2e
        ref: "test/e2e/06-sse-reconnect.spec.ts#price stream reconnects after a network drop"
        status: pass
      - kind: other
        ref: "gates grep: one new EventSource, no timers, no absolute URLs, no env reads -> gates-ok"
        status: pass
    human_judgment: false
  - id: D5
    description: "Dark terminal look: status dot colors/labels, dimmed prices while disconnected, row styling"
    requirement: HDR-03
    verification: []
    human_judgment: true
    rationale: "Visual quality (colors, dimming, density) is judged by a human at the phase-end check in 01-03"

duration: 4min
completed: 2026-09-25
status: complete
---

# Phase 1 Plan 02: Frontend Walking Skeleton Summary

**Next.js 16.3.6 static export (Tailwind 4, zustand 5) is built by the real Dockerfile and served on :8000. One zustand store and one EventSource drive the header's cash, total value, and LIVE status dot plus the 10-row live watchlist. Local E2E 01-fresh-start and 06-sse-reconnect: 3 passed.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-09-25T03:57:50Z
- **Completed:** 2026-09-25T04:01:35Z
- **Tasks:** 2
- **Files modified:** 20 (15 in Task 1, 5 in Task 2; page.tsx in both)

## Accomplishments
- Scaffolded `frontend/` with `create-next-app@16.3.6` and added zustand 5. Resolved versions: next 16.3.6, react 19.2.8, typescript 5.9.3, zustand 5.0.15. The lockfile is committed and `npm ci` works in `node:24-slim`.
- `docker build -t finally .` succeeds. The container serves the FinAlly page at `/` and `{"status":"ok"}` at `/api/health`. A recreated container on the same volume returned 2 portfolio snapshots, so the DB persists.
- `store/terminal.ts` holds the single zustand store and `connect()`:
  - it seeds from `/api/watchlist`, merging under any SSE ticks that arrived first
  - it reads cash and total value from `/api/portfolio`
  - it opens one `EventSource("/api/stream/prices")`: `onopen` sets connected, and `onerror` sets disconnected when the stream is CLOSED, otherwise reconnecting
- The Header shows `total-value` and `cash-balance` only after they load. The status element shows a LIVE (green), RECONNECTING (yellow), or OFFLINE (red) dot. Watchlist rows follow `/api/watchlist` order, use per-ticker selectors, show `session_change_percent`, and dim while not connected.
- Local E2E run (uvicorn serving `frontend/out` with a fresh `$TMPDIR` DB) had 3 passed and 0 failed or flaky. Lint is clean. The gate grep printed `gates-ok`. The test specs are unchanged from main.

## Task Commits

1. **Task 1 (tracer): Next.js static export built by the real Dockerfile, DB on a volume:** `c65fba5` (feat)
2. **Task 2: Live watchlist, cash, and connection status from one store and one EventSource:** `d378e90` (feat)

## Files Created/Modified
- `frontend/package.json`, `frontend/package-lock.json`: scaffold deps plus zustand; `build` = `next build`
- `frontend/next.config.ts`: `output: "export"` only
- `frontend/app/layout.tsx`: FinAlly metadata, no `next/font/google`
- `frontend/app/globals.css`: `@import "tailwindcss"` plus `@theme` dark tokens
- `frontend/app/page.tsx`: client page with `useEffect(connect, [])`, Header, and a Watchlist section
- `frontend/store/terminal.ts`: `Status`, `Price`, `TerminalState`, `useTerminal`, `connect`
- `frontend/store/format.ts`: `formatPrice`, `formatPercent` (en-US)
- `frontend/components/Header.tsx`: `Header` with internal `Stat` and `ConnectionStatus`
- `frontend/components/Watchlist.tsx`: `Watchlist` with internal `WatchlistRow`
- `frontend/.gitignore`, `AGENTS.md`, `CLAUDE.md`, `README.md` (3 lines), `eslint.config.mjs`, `postcss.config.mjs`, `tsconfig.json`, `app/favicon.ico`: scaffold output
- `.gitignore`: added `backend/static/`
- Deleted the uncommitted scaffold `frontend/public/*.svg` demo assets (never tracked)

## Decisions Made
- `formatPercent` uses `Intl.NumberFormat("en-US", { signDisplay: "exceptZero" })` with 2 fraction digits, so a value that rounds to zero shows `0.00%`, not `-0.00%`.
- The header markup moved from `page.tsx` (Task 1 shell) into `components/Header.tsx` in Task 2.

## Deviations from Plan

None. The plan was executed as written.

## Issues Encountered
- `create-next-app` printed the expected `RangeError: Maximum call stack size exceeded` at the end inside the sandbox (RESEARCH Pitfall 5). It had already written all files and `package-lock.json`, so I continued.
- `next build`, `docker`, uvicorn, and Playwright ran with the sandbox disabled, as the plan requires (local port binding and the docker socket).

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness
- Plan 01-03 can lay out the full terminal grid around `Header` and `Watchlist` and run the Docker E2E gate. The store and connection contract (D-09, D-10) is in place for Phases 2-4.
- No blockers.

---
*Phase: 01-live-terminal-in-docker*
*Completed: 2026-09-25*

## Self-Check: PASSED
- FOUND: frontend/package-lock.json, frontend/next.config.ts, frontend/store/terminal.ts, frontend/store/format.ts, frontend/components/Header.tsx, frontend/components/Watchlist.tsx, frontend/app/page.tsx
- FOUND commits: c65fba5, d378e90
