---
phase: 01-live-terminal-in-docker
verified: 2026-09-25T04:40:00Z
status: human_needed
score: 20/20 must-haves verified
covered_files:
  - .gitignore
  - .planning/REQUIREMENTS.md
  - .planning/phases/01-live-terminal-in-docker/01-01-PLAN.md
  - .planning/phases/01-live-terminal-in-docker/01-01-SUMMARY.md
  - .planning/phases/01-live-terminal-in-docker/01-02-PLAN.md
  - .planning/phases/01-live-terminal-in-docker/01-02-SUMMARY.md
  - .planning/phases/01-live-terminal-in-docker/01-03-PLAN.md
  - .planning/phases/01-live-terminal-in-docker/01-03-SUMMARY.md
  - .planning/phases/01-live-terminal-in-docker/01-BACKEND-VERIFICATION.md
  - frontend/app/globals.css
  - frontend/app/layout.tsx
  - frontend/app/page.tsx
  - frontend/components/ChatDrawer.tsx
  - frontend/components/Header.tsx
  - frontend/components/Panel.tsx
  - frontend/components/Watchlist.tsx
  - frontend/next.config.ts
  - frontend/package-lock.json
  - frontend/package.json
  - frontend/store/format.ts
  - frontend/store/terminal.ts
  - test/README.md
covered_digest: "v1:sha256:b0651af8ce5ccd207174d83ad0353dea0a7d94984d6a4b958372bb940f6a4b2e"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Open the app at 1600x1000 (build the image with `scripts/start_mac.sh --build`; the existing local `finally:latest` image predates the grid). Check the D-01 layout, the dark theme with no pure black, monospace numbers, and the LIVE/RECONNECTING/OFFLINE dot colors (green/yellow/red)."
    expected: "Header (FinAlly, Total value, Cash, LIVE dot) on top; Watchlist on the left; Chart over Trade in the center; AI Assistant drawer on the right; Heatmap, P&L, and Positions across the bottom. It looks like a dense dark terminal."
    why_human: "Visual quality is a judgment call. Measured geometry and colors are already verified (see Behavioral Spot-Checks)."
  - test: "Decide on code-review WR-01. If a reconnect gets a non-200 response (for example a 502 from a reverse proxy during a redeploy), the EventSource closes for good. The dot then stays OFFLINE and prices stay dimmed until a page reload."
    expected: "Either accept it for Phase 1 (the single local container never returns non-200 on /api/stream/prices, and a real network drop or a server kill recovers), or schedule the fix from 01-REVIEW.md WR-01 (reopen the EventSource after CLOSED) before any proxy or cloud deployment."
    why_human: "Reproduced by the verifier: after a 502, the status stays 'disconnected' 15 s after the server is back. This is outside the phase goal's local-docker scenario, so accepting or fixing it is a product decision."
  - test: "Decide on the deferred header overflow at 390 px (deferred-items.md)"
    expected: "Accept it (PLAN.md is desktop-first and functional on tablet, and 768 px fits), or add flex-wrap to the Header row"
    why_human: "Measured: at 390x844 the page scrolls sideways (scrollWidth 452). Whether that is acceptable is a UX judgment."
  - test: "Resolve the judgment-tier prohibitions: (01-01) no checklist row is PASS unless it was exercised live or cited file:line; (01-03) placeholder panels show no invented sample data"
    expected: "Both confirmed. Verifier's verdict (non-authoritative): 01-03 holds, because the rendered panel bodies are only the six 'arrives in Phase N' notes. 01-01 holds as far as sampled: 42 PASS, 5 OUT OF SCOPE, 3 NOT EXERCISED (real OpenRouter/Massive), and the verifier's own live probes reproduced the §8 results."
    why_human: "Judgment-tier prohibitions need explicit human resolution in interactive verify"
  - test: "MVP-mode goal format: ROADMAP marks Phase 1 `Mode: mvp`, but the goal is not a user story (user-story.validate: valid=false)"
    expected: "Run `/gsd-mvp-phase 1` to set a user-story goal if MVP-mode UAT framing is wanted, or accept the current goal wording"
    why_human: "The verifier ran standard goal-backward verification against the ROADMAP success criteria. It did not invent a user story."
---

# Phase 1: Live Terminal in Docker Verification Report

**Phase goal:** One `docker run` opens a dark trading terminal on :8000 that shows the 10 default tickers with streaming prices, $10k cash, and a connection status dot that survives a network drop.
**Verified:** 2026-09-25T04:40:00Z
**Status:** human_needed
**Re-verification:** No, this is the initial verification.

The ROADMAP marks this phase `Mode: mvp`, but the goal is not in user-story format (`user-story.validate` returns valid=false). The User Flow Coverage table was therefore not generated. Verification ran goal-backward against the 5 ROADMAP success criteria plus the PLAN must_haves. See the human items.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | The Docker image builds, and the container serves the frontend and `/api/health` on port 8000, with the SQLite DB on a persistent volume | ✓ VERIFIED | Verifier ran `docker build` (rc 0), then `docker run -p 8010:8000 -v <throwaway vol>:/app/db`. Result: `/api/health` returns `{"status":"ok"}`, `/` serves `<title>FinAlly</title>`, and recreating the container on the same volume gives `snapshots after recreate: 2` |
| SC2 | A fresh start shows exactly the 10 default tickers with live prices, $10,000 cash, and $10,000 total value | ✓ VERIFIED | The Docker compose run of `01-fresh-start` "fresh start shows default watchlist, $10k cash and streaming prices" passed (count 10, cash 10000, prices change within 15 s). Verifier probe read `cash: "$10,000.00"` and `total: "$10,000.00"` |
| SC3 | The status dot is connected (green) while streaming, goes to reconnecting/disconnected when the stream drops, and returns to connected with prices resuming, without a reload | ✓ VERIFIED | `06-sse-reconnect` passed in Docker (TCP drop, then connected again, then the TSLA price changes). Verifier probe A: after a SIGKILL of the server, status is `reconnecting`; after a restart it recovers to `connected`. Dot color is `rgb(63,185,80)` when LIVE. WR-01 edge case (a non-200 reconnect gets stuck) was reproduced and is flagged as a warning, not a failure of this truth |
| SC4 | The backend was checked against PLAN.md, breaking gaps are fixed, and pytest passes | ✓ VERIFIED | `uv run --directory backend pytest -q` gives `75 passed`. 01-BACKEND-VERIFICATION.md has §5-§9 plus Pytest and Fixes sections: 42 PASS, 5 OUT OF SCOPE, 3 NOT EXERCISED, 0 GAP. `git diff main -- backend` is empty |
| SC5 | `01-fresh-start` (health and fresh start) and `06-sse-reconnect` pass against the container | ✓ VERIFIED | Verifier ran `docker compose -f test/docker-compose.test.yml build finally` and `run --rm playwright ... --grep-invert 'clicking a ticker'`, which printed `3 passed (3.4s)`, then `down -v` |
| 6 | 01-BACKEND-VERIFICATION.md has a row per PLAN.md §5-§9 item and §8 endpoint, with evidence and a valid Result | ✓ VERIFIED | 62 table lines. Headings §5, §6, §7, §8, §9, Pytest, and Fixes are present. Every Result is PASS, OUT OF SCOPE, or NOT EXERCISED |
| 7 | A fresh-DB server answers every §8 endpoint as PLAN.md describes | ✓ VERIFIED | The verifier's own probe in the container: portfolio `cash_balance 10000.0` and `total_value 10000.0`; watchlist `10 AAPL,...,NFLX` in seed order; SSE starts with `retry: 1000` followed by ticker-keyed `data:`. The remaining endpoints are recorded live in the note, and 75 pytest tests cover them |
| 8 | Cash and total value read 10000 and do not exist until /api/portfolio loads | ✓ VERIFIED | Probe with `/api/portfolio` delayed 2.5 s: `cashBeforeLoad: 0` and `totalBeforeLoad: 0` elements, then `$10,000.00` after load. Header.tsx:20-22 renders them conditionally |
| 9 | Loaded through a different origin, the page uses the same origin (relative /api) | ✓ VERIFIED | `06-sse-reconnect` loads through a 127.0.0.1 random-port proxy and passed. A grep for `https?://`, `process.env`, and `NEXT_PUBLIC_` in frontend/app, components, and store finds nothing |
| 10 | next.config.ts sets only `output: "export"` | ✓ VERIFIED | frontend/next.config.ts:4-6 |
| 11 | An SSE tick that arrives before the /api/watchlist seed is not overwritten by the older seed | ✓ VERIFIED | Probe: `/api/watchlist` was delayed 2.5 s and returned AAPL price 1.00. Over 4 s the AAPL cell showed only `$190.04-$190.06` and never `$1.00`. The merge order is at terminal.ts:47 |
| 12 | Prices use en-US USD with 2 decimals; change % is signed with 2 decimals; there is one number per testid | ✓ VERIFIED | format.ts:1-15 uses Intl en-US. Rendered values `$10,000.00` and `$190.05` parse correctly in the passing 01/06 specs |
| 13 | The status shows a dot plus LIVE/RECONNECTING/OFFLINE; prices dim when not connected; change % comes from session_change_percent | ✓ VERIFIED | Probe: label `LIVE`, green dot, price opacity `1` when connected and `0.5` when disconnected (probe B). Watchlist.tsx:22,34 |
| 14 | Watchlist rows render in /api/watchlist order (backstop) | ✓ VERIFIED | Directly observed in the DOM: `AAPL,GOOGL,MSFT,AMZN,TSLA,NVDA,META,JPM,V,NFLX`, which is the seed order, not SSE key order |
| 15 | At md and up the layout follows D-01 | ✓ VERIFIED | Bounding boxes at 1600x1000: Watchlist x=4; Chart y=45 over Trade y=580 at x=296; AI Assistant x=1276; Heatmap, P&L, and Positions at y=680 across the full width |
| 16 | At 1600x1000 there is no page scroll and the watchlist scrolls internally | ✓ VERIFIED | `scrollHeight 1000`, `scrollWidth 1600`. Panel body is `min-h-0 flex-1 overflow-auto` (Panel.tsx:10) |
| 17 | At 390 px the panels stack into one scrolling column | ✓ VERIFIED | `scrollHeight 1598`, which is more than 844. Horizontal overflow is 452 px (deferred item, human decision) |
| 18 | Unbuilt panels show a title and a phase note, with no Phase 2-4 testids | ✓ VERIFIED | Rendered panel text is only the six "arrives in Phase N" notes. The later-phase testid grep finds nothing |
| 19 | The AI drawer is open on load and toggles collapse/expand without a reload | ✓ VERIFIED | Probe: the Collapse click gives `Expand chat` with aria-expanded `false`; the Expand click gives `Collapse chat` with aria-expanded `true` |
| 20 | At phase end pytest passes and the binding test files are identical to main | ✓ VERIFIED | 75 passed. `git diff --stat main -- test/e2e test/playwright.config.ts test/docker-compose.test.yml test/package.json` is empty |

**Score:** 20/20 truths verified (0 present but behavior-unverified).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `01-BACKEND-VERIFICATION.md` | BACK-01/02 note | ✓ VERIFIED | Has the header row and all sections. Fixes reads "No breaking gaps found; no backend changes." |
| `frontend/package-lock.json` | lockfile for npm ci | ✓ VERIFIED | Tracked in git. The Docker `npm ci` succeeded |
| `frontend/next.config.ts` | static export | ✓ VERIFIED | `output: "export"` only |
| `frontend/app/globals.css` | Tailwind 4 dark tokens | ✓ VERIFIED | All 10 tokens are present. The built CSS contains #0d1117, #1a1a2e, and #ecad0a. Body bg is `rgb(13,17,23)` |
| `frontend/store/terminal.ts` | store plus connect | ✓ VERIFIED | Exports useTerminal, connect, Status, Price, and TerminalState. It has one EventSource and no timers |
| `frontend/store/format.ts` | en-US formatters | ✓ VERIFIED | formatPrice, formatPercent |
| `frontend/components/Header.tsx` | total, cash, status | ✓ VERIFIED | Wired through selectors |
| `frontend/components/Watchlist.tsx` | rows with per-ticker selector | ✓ VERIFIED | `s.prices[ticker]` |
| `frontend/components/Panel.tsx` | Panel, PanelNote | ✓ VERIFIED | Used 7 times in page.tsx |
| `frontend/components/ChatDrawer.tsx` | collapsible drawer | ✓ VERIFIED | Rendered in page.tsx:32 |
| `frontend/app/page.tsx` | grid; only caller of connect | ✓ VERIFIED | Calls `useEffect(connect, [])` |
| `test/README.md` | verified local commands | ✓ VERIFIED | Has `npm --prefix frontend run build`, `STATIC_DIR=`, and `uv run --directory backend uvicorn app.main:app` |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| page.tsx | store/terminal.ts | `useEffect(connect, [])` (only importer of connect) | ✓ WIRED |
| terminal.ts | stream.py | `new EventSource("/api/stream/prices")` (exactly 1 in the source) | ✓ WIRED (probe esCount = 1) |
| terminal.ts | api.py | `fetch("/api/watchlist")`, `fetch("/api/portfolio")` | ✓ WIRED |
| Watchlist.tsx | terminal.ts | `s.prices[ticker]` | ✓ WIRED |
| Dockerfile | package-lock.json | `COPY frontend/package.json frontend/package-lock.json` then `npm ci` | ✓ WIRED |
| page.tsx | Panel / ChatDrawer / Watchlist | `<Panel title=`, `<ChatDrawer`, `<Watchlist` | ✓ WIRED |
| test/docker-compose.test.yml | Dockerfile | `context: ..` | ✓ WIRED (built and served during the gate) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| Header total-value / cash-balance | cash, totalValue | GET /api/portfolio, then portfolio.get_portfolio (SQLite) | yes (10000.0 from seed) | ✓ FLOWING |
| Watchlist rows | watchlist | GET /api/watchlist (DB watchlist table) | yes (10 seed tickers) | ✓ FLOWING |
| Watchlist prices | prices | SSE /api/stream/prices from PriceCache (simulator) | yes (prices change live) | ✓ FLOWING |
| connection-status | status | EventSource onopen / onerror | yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend suite | `uv run --directory backend pytest -q` | `75 passed, 2 warnings` | ✓ PASS |
| Frontend build and lint | `rm -rf frontend/.next && npm --prefix frontend run build && npm --prefix frontend run lint` | build ok, `out/index.html` present, eslint clean | ✓ PASS |
| Container E2E gate | compose build plus `run --rm playwright` (01 + 06, excluding "clicking a ticker") | `3 passed (3.4s)`; `down -v` done | ✓ PASS |
| One docker run with volume | `docker run -p 8010:8000 -v finally-verify01-vol:/app/db` | health ok, FinAlly title, 10 tickers, cash 10000, SSE `retry: 1000`, 2 snapshots after recreate | ✓ PASS |
| Server kill recovery | Playwright probe: SIGKILL uvicorn, then restart | `reconnecting`, then `connected` | ✓ PASS |
| 502-on-reconnect recovery (WR-01) | Playwright probe: route stream to 502, kill, restore | stays `disconnected` for 15 s after the server is back; opacity 0.5 | ✗ reproduced (WARNING, out of goal scope) |
| Layout geometry | Playwright at 1600x1000 and 390x844 | 1000/1600 with no scroll; 1598 tall at 390 (452 wide) | ✓ PASS |

All throwaway containers, volumes, the image, and the probe scripts were removed. The user's `finally-data` volume was never touched and is still present. `git status` shows no changes to frontend, backend, or test.

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes are declared or present. Step 7c does not apply.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| BACK-01 | 01-01 | Backend verified against PLAN.md end to end | ✓ SATISFIED | Note plus the verifier's live container probe |
| BACK-02 | 01-01 | Breaking gaps fixed; pytest passes | ✓ SATISFIED | 0 GAP rows; 75 passed; backend unchanged |
| FND-01 | 01-02, 01-03 | Next.js + TS static export with Tailwind dark theme | ✓ SATISFIED | next 16.3.6, output export, @theme tokens, build ok |
| FND-02 | 01-02, 01-03 | Relative /api paths only | ✓ SATISFIED | grep clean; 06 passes through a different-origin proxy |
| HDR-01 | 01-02, 01-03 | cash-balance in the header | ✓ SATISFIED | 01-fresh-start; probe `$10,000.00` |
| HDR-03 | 01-02, 01-03 | 3-state connection dot | ✓ SATISFIED | green LIVE observed; yellow reconnecting and red disconnected observed in probes A and B |
| HDR-04 | 01-02, 01-03 | Recovers after a drop without a reload | ✓ SATISFIED (with WR-01 warning) | 06 passes in Docker; server-kill probe recovers |
| WTCH-01 | 01-02, 01-03 | Exactly 10 default tickers with live prices | ✓ SATISFIED | 01-fresh-start in Docker |
| DLVR-01 | 01-02, 01-03 | Image builds and serves on 8000 with a persistent DB volume | ✓ SATISFIED | Docker run and recreate probe |

No orphaned requirements. REQUIREMENTS.md maps exactly these 9 IDs to Phase 1, and all 9 are claimed by a plan.

### Prohibitions

| Prohibition | Tier | Disposition |
|-------------|------|-------------|
| Do not delete, skip, or loosen backend or E2E tests (01-01, 01-02, 01-03) | test | Evidence: `git diff main -- backend` is empty; the binding test files diff against main is empty; pytest shows 0 skipped. No wired repo enforcement, but verifier-observed |
| PASS only when exercised or cited (01-01) | judgment | Human item. Non-authoritative verdict: holds |
| Do not touch the user's db, container, or volume (01-01, 01-02, 01-03) | test | `finally-data` is present and no `finally` container exists. No wired enforcement; the history cannot be fully proven, so this is flagged as unverified-prohibition, low risk |
| Do not show LIVE before open or full-opacity prices when disconnected (01-02) | test | Verified: initial state is `reconnecting`, and opacity is 0.5 when disconnected (probe B). 06 covers the "leaves connected" part |
| No made-up number before the backend supplies it (01-02) | test | Verified: 0 elements before load (probe); an em dash for a missing price |
| No invented sample data in placeholder panels (01-03) | judgment | Human item. Non-authoritative verdict: holds (only phase notes are rendered) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| frontend/store/terminal.ts | 56-57 | A CLOSED EventSource is never reopened (WR-01) | ⚠️ Warning | Only a non-200 reconnect (proxy or deploy) leaves the dot stuck on OFFLINE. Reproduced |
| frontend/components/Header.tsx | 17 | Non-wrapping header row | ⚠️ Warning | 390 px sideways scroll (deferred item) |
| .gitignore | 17 | Unanchored `lib/` ignores `frontend/lib` (WR-02) | ℹ️ Info | Risk for later phases; `frontend/lib` does not exist today |
| frontend/package.json | 8 | `next start` is unusable with export (IN-03) | ℹ️ Info | Dev ergonomics only |
| local Docker image `finally:latest` | none | Built at 04:01Z, before the grid (`NO_GRID`) | ℹ️ Info | `scripts/start_mac.sh` without `--build` reuses it and serves the pre-grid UI. Use `--build` once |

There are no TBD, FIXME, XXX, TODO, or HACK markers in the phase files, and no stubs. The placeholder notes are intentional D-02 phase notes, not stubs.

### Human Verification Required

1. **Visual terminal check.** Run `scripts/start_mac.sh --build` and open localhost:8000 at desktop width. Expected: the D-01 layout, a dark theme with no pure black, monospace numbers, and a green LIVE dot. Why human: visual judgment.
2. **WR-01 decision.** Accept for Phase 1, or fix now. The 502-on-reconnect case stays OFFLINE until a reload (reproduced). Why human: it falls outside the goal's local scenario, so this is a product decision.
3. **390 px header overflow.** Accept it or add `flex-wrap`. Why human: UX judgment.
4. **Judgment prohibitions.** Confirm the 01-01 PASS discipline and that the 01-03 panels show no fake data. Why human: judgment tier.
5. **MVP goal format.** Optionally run `/gsd-mvp-phase 1`. Why human: the goal wording is the user's choice.

### Gaps Summary

There are no gaps. Every ROADMAP success criterion and every PLAN must-have has behavioral evidence that the verifier produced itself, independent of the SUMMARY claims:
- the container E2E gate: 3 passed
- the backend suite: pytest 75 passed
- a direct `docker run` with volume persistence
- Playwright probes for ordering, merge precedence, status transitions, and layout

The status is human_needed because of the visual review, the reproduced WR-01 edge case (outside the goal's scope, but a real defect for proxy deployments), the deferred 390 px header overflow, the judgment-tier prohibitions, and the MVP-mode goal-format discrepancy.

---

_Verified: 2026-09-25T04:40:00Z_
_Verifier: Claude (gsd-verifier)_
