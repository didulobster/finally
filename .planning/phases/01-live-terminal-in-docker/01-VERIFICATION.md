---
phase: 01-live-terminal-in-docker
verified: 2026-09-26T02:35:00Z
status: passed
score: 15/15 must-haves verified
covered_files:

  - .gitignore
  - .planning/REQUIREMENTS.md
  - .planning/phases/01-live-terminal-in-docker/01-01-PLAN.md
  - .planning/phases/01-live-terminal-in-docker/01-01-SUMMARY.md
  - .planning/phases/01-live-terminal-in-docker/01-02-PLAN.md
  - .planning/phases/01-live-terminal-in-docker/01-02-SUMMARY.md
  - .planning/phases/01-live-terminal-in-docker/01-03-PLAN.md
  - .planning/phases/01-live-terminal-in-docker/01-03-SUMMARY.md
  - .planning/phases/01-live-terminal-in-docker/01-04-PLAN.md
  - .planning/phases/01-live-terminal-in-docker/01-04-SUMMARY.md
  - .planning/phases/01-live-terminal-in-docker/01-05-PLAN.md
  - .planning/phases/01-live-terminal-in-docker/01-05-SUMMARY.md
  - .planning/phases/01-live-terminal-in-docker/01-06-PLAN.md
  - .planning/phases/01-live-terminal-in-docker/01-06-SUMMARY.md
  - .planning/phases/01-live-terminal-in-docker/01-BACKEND-VERIFICATION.md
  - Dockerfile
  - frontend/README.md
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
  - frontend/tsconfig.json
  - test/README.md
  - test/sse-502-probe.mjs

covered_digest: "v1:sha256:20cc2c7fcb350fd0d797e35b35dcba982a4a1e32f1dc449b7c1e610c2413183b"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 20/20
  gaps_closed:
    - "G-01-1: the D-01 grid is built at HEAD, and the user's `finally` image tag now holds HEAD (the grid was missing because the image was stale and HEAD did not build)"
    - "G-01-2: the price stream recovers without a reload after a reconnect is answered with 502 (the EventSource is reopened after CLOSED)"
  gaps_remaining: []
  regressions: []
advisory:

  - finding: "The `/.claude/**/lib/` rule in .gitignore (added in 01-04) keeps the installed GSD tooling lib/ directories out of git, so the tracked GSD entry points cannot run from a fresh clone (01-REVIEW.md WR-01)"
    category: other
    reason: "This is tooling-install scope, not the product. Before 01-04, the unanchored `lib/` rule already hid these directories, so the fresh-clone behavior did not change. It is logged in deferred-items.md for a user decision. It does not affect the Docker image or the phase goal."
    evidence_status: "reviewer cited file:line; no phase-goal impact"
human_verification:

  - test: "UAT Test 1 re-test on your own container. Your running `finally` container still uses the old image a8ecec43 (verified: StartedAt 2026-09-26T01:29:59Z, 0 restarts). Run `scripts/start_mac.sh` with no `--build`; the `finally` tag is already HEAD. Then open http://localhost:8000 at about 1600x1000."
    expected: "The full D-01 grid appears. Header on top (FinAlly, Total value, Cash, LIVE dot); Watchlist on the left; Chart over Trade in the center; AI Assistant drawer on the right; Heatmap, P&L, and Positions along the bottom. The theme is dark with no pure black, and the numbers are monospace."
    why_human: "UAT Test 1 failed for the user, and only the user can replace their running container and accept the look. The verifier saw the same layout in a throwaway container from a HEAD build with identical layers to the `finally` tag (screenshot and bounding boxes below)."
  - test: "Resolve the judgment-tier prohibitions. UAT Test 4 was skipped. (01-01) No checklist row is PASS unless it was exercised live or cited file:line. (01-03) Placeholder panels show no invented sample data."
    expected: "Confirm both. The verifier's verdict is not authoritative, but both hold: the rendered panel bodies are only the six 'arrives in Phase N' notes (seen again in this run's screenshot), and 01-BACKEND-VERIFICATION.md has 42 PASS, 5 OUT OF SCOPE, 3 NOT EXERCISED, and 0 GAP rows."
    why_human: "Judgment-tier prohibitions need explicit human resolution in interactive verify. The user skipped this item in UAT."
---

# Phase 1: Live Terminal in Docker Verification Report

**Phase goal:** One `docker run` opens a dark trading terminal on :8000 that shows the 10 default tickers with streaming prices, $10k cash, and a connection status dot that survives a network drop.
**Verified:** 2026-09-26T02:35:00Z
**Status:** human_needed
**Re-verification:** Yes. This run follows gap-closure plans 01-04, 01-05, and 01-06, which close UAT gaps G-01-1 and G-01-2.

The user accepted the goal wording in UAT Test 5, so this run uses standard goal-backward verification against the 5 ROADMAP success criteria and the gap-closure must_haves. It does not use an MVP user-story table. The user also accepted the 390 px header overflow in UAT Test 3, so it is no longer a human item.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence (produced by the verifier in this run) |
|---|-------|--------|--------------------------------------------------|
| SC1 | The Docker image builds, and the container serves the frontend and `/api/health` on port 8000, with the SQLite DB on a persistent volume | ✓ VERIFIED | `docker build -t finally-verify01 .` at a clean HEAD built fine. `docker run -p 8013:8000 -v finally-verify01-vol:/app/db` then served `/api/health` as `{"status":"ok"}`, and `/` contained FinAlly, Watchlist, Chart, Trade, AI Assistant, Heatmap, P&L, and Positions. The persistence mechanism (Dockerfile `DB_PATH=/app/db/finally.db`, start_mac.sh `-v finally-data:/app/db`) is unchanged since the previous run proved a recreate on the same volume |
| SC2 | A fresh start shows exactly the 10 default tickers with live prices, $10,000 cash, and $10,000 total value | ✓ VERIFIED | The throwaway container returned `/api/watchlist` as 10 tickers (`AAPL,GOOGL,MSFT,AMZN,TSLA,NVDA,META,JPM,V,NFLX`) and `/api/portfolio` with `cash_balance 10000.0` and `total_value 10000.0`. In the browser, `cash-balance` and `total-value` both read `$10,000.00`. The compose run of `01-fresh-start` passed |
| SC3 | The dot shows connected while streaming, changes to reconnecting/disconnected when the stream drops, and returns to connected with prices resuming, with no reload | ✓ VERIFIED | There are three independent checks. (a) A TCP drop, from `docker restart -t 0` of the throwaway container, gave the status sequence `reconnecting → connected`, TSLA moved again, and `created=1` (native retry, no reopen). (b) A 502 reconnect: `node test/sse-502-probe.mjs http://127.0.0.1:8013` printed `PASS created=3 maxLive=1 502s=2`. (c) `06-sse-reconnect` passed in compose. With status LIVE, the header dot is green |
| SC4 | The backend was checked against PLAN.md, breaking gaps are fixed, and pytest passes | ✓ VERIFIED | `uv run --directory backend pytest -q` gave `75 passed, 2 warnings`. `git diff --stat 56aa0d1 HEAD -- backend` is empty, so the backend is unchanged since the audited state. 01-BACKEND-VERIFICATION.md is unchanged |
| SC5 | `01-fresh-start` (health and fresh start) and `06-sse-reconnect` pass against the container | ✓ VERIFIED | Compose was run on an isolated project `-p finally-verify01-e2e`, then `down -v`. Output: `✓ health endpoint responds`, `✓ fresh start shows default watchlist, $10k cash and streaming prices`, `✓ price stream reconnects after a network drop`, `3 passed (3.5s)` |
| G1 | HEAD builds the canonical Phase 1 frontend, and the export contains the D-01 grid (G-01-1 build half) | ✓ VERIFIED | `git diff --quiet 9745561^ -- frontend/{tsconfig.json,package.json,package-lock.json,next.config.ts,README.md}` exits 0. tsconfig has `"@/*": ["./*"]`, and zustand `^5.0.15` is in package.json and in the lockfile (`node_modules/zustand` 5.0.15). `frontend/src` does not exist, and `git ls-files` of src and the vitest configs is empty. The Docker `npm ci && npm run build` stage succeeded. `eslint` exits 0 |
| G2 | The user's `finally` tag holds HEAD, so `scripts/start_mac.sh` without `--build` serves the grid (G-01-1 direct cause) | ✓ VERIFIED | The `finally` tag is `sha256:ca44884f…`, created 2026-09-26T02:20:25Z. A fresh HEAD build has **identical RootFS layers** (`layers-identical`, same Created, full cache hit). Inside the `finally` tag, `/app/backend/static/index.html` contains Heatmap and AI Assistant, and the bundle contains `setTimeout(s,3e3)`, the reopen fix. start_mac.sh uses `IMAGE=finally` |
| G3 | At 1600x1000 the image renders the D-01 layout with a dark theme and no page scroll | ✓ VERIFIED | Screenshot and boxes from the throwaway HEAD container: Watchlist (5,46); Chart (297,46) over Trade (297,581); AI Assistant (1289,51); Heatmap (5,681), P&L (489,681), Positions (973,681). `scrollHeight 1000`, `scrollWidth 1600`, body bg `rgb(13,17,23)`, LIVE green dot, monospace prices. The visual look still needs the user's acceptance (human item 1) |
| G4 | After a reconnect is answered with 502, the dot goes OFFLINE and returns to LIVE with prices moving, with no reload (G-01-2) | ✓ VERIFIED | Probe against the HEAD image: `sse-502-probe: PASS created=3 maxLive=1 502s=2`. terminal.ts:65-73: `onerror` with `readyState === EventSource.CLOSED` sets `disconnected` and schedules `setTimeout(open, REOPEN_DELAY_MS)` (3000) |
| G5 | The 502 probe is a real regression check: it fails on the pre-fix store | ✓ VERIFIED | The same probe against the user's running old image a8ecec43 on :8000 (GET-only traffic) printed `FAIL stage=recover status=disconnected created=1 maxLive=1 502s=1`. The probe commit `0637c82` comes before the fix `7de6aa4`, and `0637c82:frontend/store/terminal.ts` has no REOPEN |
| G6 | At most one EventSource is ever live, and there is exactly one construction site | ✓ VERIFIED | `grep -rn 'new EventSource' frontend/app frontend/components frontend/store` finds only `terminal.ts:63`. The probe reported `maxLive=1`. The verifier's own construction-time counter (stronger than the probe's 100 ms sampling, REVIEW IN-03) gave `maxLiveAtCreate=1`. Code: a replacement is created only from the CLOSED branch, and cleanup does `clearTimeout(timer); es.close()` on the latest instance |
| G7 | The CONNECTING path is unchanged (D-10): a network drop recovers through native retry | ✓ VERIFIED | terminal.ts:69-71: the else branch only sets `reconnecting`. The restart probe recovered with `created=1`, so no reopen happened, and `06-sse-reconnect` passed |
| G8 | .gitignore no longer hides frontend/lib (WR-02) and ignores backend/static again | ✓ VERIFIED | `git check-ignore frontend/lib/x.ts` does not match. `backend/lib/x.py` and `backend/static/index.html` match. The rules at .gitignore:14-20 are anchored under `/backend/` |
| G9 | Integrity: binding test files are unchanged, 01-06 changed no product code, URLs are relative, and the bundle has no keys | ✓ VERIFIED | `git diff --quiet d92088b -- test/e2e test/playwright.config.ts test/docker-compose.test.yml test/package.json` exits 0. `git diff --stat 79ef4e6 4ef526c -- frontend backend test Dockerfile scripts` is empty. `grep -rnE 'https?://|process.env|NEXT_PUBLIC_'` over the frontend source finds nothing. `grep -rlE 'OPENROUTER|sk-or-' /app/backend/static` in the `finally` image finds nothing |
| G10 | test/README.md documents the local run and the 502 probe | ✓ VERIFIED | It has `npm --prefix frontend run build`, `STATIC_DIR="$PWD/frontend/out"`, and a "502 recovery probe" section with `node test/sse-502-probe.mjs http://127.0.0.1:8000` |

**Score:** 15/15 truths verified (0 present but behavior-unverified).

Regression check of the prior 01-01..01-03 must-haves: layout geometry, the no-scroll desktop view, the 390 px stack (`scrollHeight 1598`, width 452, which the user accepted), seed order, relative URLs, one EventSource, pytest, and the unchanged binding files all still hold. `frontend/app` and `frontend/components` are byte-identical to d92088b. The only change under `frontend/store` is the planned 01-05 fix.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/store/terminal.ts` | One EventSource, reopened after CLOSED | ✓ VERIFIED | Has `REOPEN_DELAY_MS = 3000`, `setTimeout(open, REOPEN_DELAY_MS)`, `EventSource.CLOSED`, and `clearTimeout(timer)`. Wired through `page.tsx` `useEffect(connect, [])` |
| `test/sse-502-probe.mjs` | Standalone 502 proxy probe | ✓ VERIFIED | 123 lines. Imports only `node:http` and `@playwright/test`. Lives outside `test/e2e`. Red on the old image, green on HEAD |
| `frontend/tsconfig.json` | `@/*` → `./*` | ✓ VERIFIED | Byte-identical to 9745561^ |
| `frontend/package.json` / `package-lock.json` | zustand restored; lockfile for `npm ci` | ✓ VERIFIED | Byte-identical to 9745561^. The Docker `npm ci` succeeded |
| `.gitignore` | Anchored `/backend/lib/` etc.; `backend/static/` | ✓ VERIFIED | check-ignore results as in G8 |
| `test/README.md` | Local commands and probe docs | ✓ VERIFIED | See G10 |
| `Dockerfile` | `COPY --from=frontend /frontend/out ./static` | ✓ VERIFIED | Unchanged. The build succeeded at HEAD |
| local image tag `finally` | Built from HEAD | ✓ VERIFIED | Layers are identical to a fresh HEAD build |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| frontend/app/page.tsx | components/ChatDrawer.tsx | `@/components/ChatDrawer` resolved by `@/*` → `./*` | ✓ WIRED (the build succeeds and AI Assistant renders) |
| frontend/store/terminal.ts | package.json | `import { create } from "zustand"`, dependency present | ✓ WIRED |
| Dockerfile | frontend/package-lock.json | `COPY … package-lock.json` then `npm ci` | ✓ WIRED |
| terminal.ts onerror | readyState CLOSED | `setTimeout(open, REOPEN_DELAY_MS)` | ✓ WIRED (probe PASS) |
| page.tsx | terminal.ts | `useEffect(connect, [])` | ✓ WIRED |
| sse-502-probe.mjs | Header.tsx | `[data-testid="connection-status"][data-status=…]` | ✓ WIRED (the probe reads status transitions) |
| scripts/start_mac.sh | Dockerfile | `IMAGE=finally`, a tag holding the HEAD build | ✓ WIRED |
| test/docker-compose.test.yml | Dockerfile | `context: ..` | ✓ WIRED (the compose build served the specs) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| Header cash / total | cash, totalValue | GET /api/portfolio from SQLite seed | `$10,000.00` | ✓ FLOWING |
| Watchlist rows | watchlist | GET /api/watchlist (DB) | 10 seed tickers in order | ✓ FLOWING |
| Watchlist prices | prices | SSE `/api/stream/prices` from PriceCache (simulator) | `retry: 1000`, then ticker-keyed `data:`; TSLA moves after recovery | ✓ FLOWING |
| connection-status | status | EventSource onopen/onerror, plus the reopen | reconnecting → connected; disconnected → connected | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend suite | `UV_CACHE_DIR=$TMPDIR/uvcache uv run --directory backend pytest -q` | `75 passed, 2 warnings` | ✓ PASS |
| Frontend lint | `npm --prefix frontend run lint` | exit 0 | ✓ PASS |
| Image builds at HEAD | `docker build -q -t finally-verify01 .` | built; layers identical to `finally` | ✓ PASS |
| Container serves the app | `docker run -p 8013:8000 -v finally-verify01-vol:/app/db …` + curl | health ok, grid titles, 10 tickers, cash 10000, SSE `retry: 1000` | ✓ PASS |
| 502 recovery on HEAD | `node test/sse-502-probe.mjs http://127.0.0.1:8013` | `PASS created=3 maxLive=1 502s=2` | ✓ PASS |
| Probe is red on pre-fix code | `node test/sse-502-probe.mjs http://127.0.0.1:8000` (user's old image; GET only) | `FAIL stage=recover status=disconnected created=1 maxLive=1 502s=1` | ✓ PASS (expected red) |
| TCP-drop native retry | Playwright page + `docker restart -t 0 finally-verify01-c` | statuses `reconnecting,connected`; TSLA moves; `created=1`, `maxLiveAtCreate=1` | ✓ PASS |
| Layout 1600x1000 / 390x844 | Playwright boxes + screenshot | 1000/1600 no scroll; D-01 positions; 1598 tall / 452 wide at 390 (accepted) | ✓ PASS |
| Container E2E gate | `docker compose -p finally-verify01-e2e -f test/docker-compose.test.yml` build + run (01 + 06, excluding "clicking a ticker") | `3 passed (3.5s)`; `down -v`; 0 containers left | ✓ PASS |
| Shipped bundle | `docker run --rm --entrypoint sh finally -c "grep …"` | grid in index.html, no key names, `setTimeout(s,3e3)` present | ✓ PASS |

Cleanup: the `finally-verify01-c` container, the `finally-verify01-vol` volume, the `finally-verify01` and `finally-verify01-e2e-finally` images, and the compose project were removed. The user's `finally` container (Id `511733ac…`, image a8ecec43, StartedAt `01:29:59Z`, RestartCount 0) and the `finally-data` volume are unchanged. The `finally` tag is still `ca44884f…`. `git status` shows only the pre-existing `.gsd/dispatch-isolation-sentinel.json` change.

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes exist. The phase declares one probe, `test/sse-502-probe.mjs`. The verifier ran it in its own process, with the results in the table above: PASS on HEAD, and the expected FAIL on the pre-fix image.

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| `test/sse-502-probe.mjs` | `node test/sse-502-probe.mjs http://127.0.0.1:8013` | exit 0, `PASS created=3 maxLive=1 502s=2` | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| BACK-01 | 01-01 | Backend verified against PLAN.md | ✓ SATISFIED | Note unchanged, backend unchanged, live endpoints behave as described (SC2) |
| BACK-02 | 01-01, 01-06 | Breaking gaps fixed; pytest passes | ✓ SATISFIED | 75 passed; 0 GAP rows |
| FND-01 | 01-02, 01-03, 01-04 | Next.js + TS static export, Tailwind dark theme | ✓ SATISFIED | HEAD builds in Docker; export; bg `#0d1117` |
| FND-02 | 01-02, 01-03, 01-05 | Relative /api paths only | ✓ SATISFIED | grep clean; the probe and 06 load through a different-origin proxy |
| HDR-01 | 01-02, 01-03, 01-06 | cash-balance in the header | ✓ SATISFIED | `$10,000.00` |
| HDR-03 | 01-02, 01-03, 01-05 | 3-state dot | ✓ SATISFIED | connected, reconnecting, and disconnected all observed |
| HDR-04 | 01-02, 01-03, 01-05, 01-06 | Recovers without a reload | ✓ SATISFIED | TCP drop (06 + restart probe) and 502 (probe) both recover |
| WTCH-01 | 01-02, 01-03, 01-06 | Exactly 10 default tickers with live prices | ✓ SATISFIED | 01-fresh-start in compose |
| DLVR-01 | 01-02, 01-03, 01-04, 01-06 | Image builds; serves on 8000; persistent DB volume | ✓ SATISFIED | build + run + `finally` tag current |

No orphaned requirements. REQUIREMENTS.md maps exactly these 9 IDs to Phase 1, and plans claim all 9.

### Prohibitions

| Prohibition | Tier | Disposition |
|-------------|------|-------------|
| (01-04) Do not edit frontend/app, components, or store | test | Verified: `git diff d92088b 9b34512 -- frontend/app frontend/components frontend/store` is empty |
| (01-04) Do not add frontend unit tests or a runner | test | Verified: no vitest, jest, or testing-library in package.json; vitest configs removed |
| (01-04/05/06) Do not edit binding test files | test | Verified: diff against d92088b is empty |
| (01-05) Do not change the CONNECTING path | test | Verified: code else branch; restart probe `created=1` |
| (01-05) Never two live EventSources | test | Verified: `maxLive=1` (probe) and `maxLiveAtCreate=1` (verifier) |
| (01-06) Do not touch the user's container or volume | test | Verified: docker inspect Id, Image, StartedAt, and RestartCount unchanged; `finally-data` present |
| (01-06) No product code changes in the gate plan | test | Verified: `git diff --stat 79ef4e6 4ef526c` over the code paths is empty |
| (01-01) PASS only when exercised or cited | judgment | Human item 2 (UAT Test 4 was skipped). Non-authoritative verdict: holds |
| (01-03) No invented sample data in placeholder panels | judgment | Human item 2. Non-authoritative verdict: holds (only the "arrives in Phase N" notes appear in this run's screenshot) |

The test-tier items have no wired repo enforcement. Each has verifier-run evidence above, so none is flagged as unverified.

### Advisory (New Scope, Unevidenced)

| # | Finding | Category | Why Advisory |
|---|---------|----------|--------------|
| 1 | `/.claude/**/lib/` keeps GSD tooling lib/ out of git, so the committed tooling cannot run from a fresh clone (01-REVIEW WR-01) | other | Tooling-install scope; the behavior predates the phase (the old `lib/` rule); it is in deferred-items.md; no effect on the image or the goal |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| frontend/store/terminal.ts | 47-58 | REST seed not refreshed when the stream reopens (REVIEW IN-05) | ℹ️ Info | Cash and watchlist can go stale after a backend restart with a new DB. That is not in the Phase 1 goal; worth doing when Phase 2 makes cash change |
| frontend/store/terminal.ts | 67 | Status stays OFFLINE while the reopened stream connects (REVIEW IN-04) | ℹ️ Info | Cosmetic; lasts at most one connection attempt |
| frontend/store/terminal.ts | 74 | `prices` merged, never pruned (REVIEW IN-06) | ℹ️ Info | Matters for Phase 3 watchlist removal |
| test/sse-502-probe.mjs | 112 | `catch {}` drops the error reason (REVIEW IN-02) | ℹ️ Info | Diagnostics only |
| test/sse-502-probe.mjs + test/README.md | — | The 502 path is guarded only by a manual probe, not the E2E suite (REVIEW IN-07) | ⚠️ Warning | A regression would not fail the compose gate. Port it into 06 when the binding specs can be edited |

There are no TBD, FIXME, XXX, TODO, or HACK markers in frontend/app, components, store, or the probe. There are no stubs; the placeholder panel notes are the intended D-02 phase notes.

### Human Verification Required

1. **UAT Test 1 re-test on your own container.** Your `finally` container still runs the old image. Run `scripts/start_mac.sh` (no `--build` needed) and open http://localhost:8000 at about 1600x1000. Expected: the full D-01 grid (header, Watchlist left, Chart over Trade, AI Assistant drawer right, Heatmap, P&L, and Positions along the bottom), dark with no pure black, monospace numbers. Why human: the user reported this test as failed, and only the user can replace their container and accept the look. The verifier already saw the correct layout from an image with identical layers.
2. **Judgment-tier prohibitions (UAT Test 4, skipped).** Confirm that (01-01) no PASS row is unevidenced and (01-03) the placeholder panels show no invented data. Why human: judgment tier needs explicit human resolution.

### Gaps Summary

There are no gaps. Both UAT gaps are closed, with evidence the verifier produced itself.

- **G-01-1 (only the watchlist and header showed).** HEAD builds the canonical tree again:
  - The config is restored byte-for-byte from 9745561^, and frontend/src is gone.
  - The user's `finally` tag has the same layers as a fresh HEAD build.
  - A container from that build renders the full D-01 grid.
- **G-01-2 (stuck OFFLINE after a 502).** `connect()` reopens its single EventSource 3 s after the browser closes it:
  - The committed probe fails on the old image and passes on HEAD.
  - At most one EventSource is ever live.
  - The native TCP-drop path is unchanged.

All 5 ROADMAP success criteria were re-proven at HEAD in Docker: compose `3 passed`, pytest `75 passed`, and a direct `docker run` with a volume. The status is human_needed for two reasons only. The user must re-run UAT Test 1 against their own container after `scripts/start_mac.sh`. And the skipped judgment-tier prohibitions (UAT Test 4) still need an explicit decision.

---

_Verified: 2026-09-26T02:35:00Z_
_Verifier: Claude (gsd-verifier)_
