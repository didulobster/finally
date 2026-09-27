---
phase: 02-trading-portfolio
verified: 2026-09-27T00:45:00Z
status: gaps_found
score: 31/33 must-haves verified (1 failed, 1 needs human confirmation)
covered_files:
  - .planning/REQUIREMENTS.md
  - .planning/phases/02-trading-portfolio/02-01-PLAN.md
  - .planning/phases/02-trading-portfolio/02-01-SUMMARY.md
  - .planning/phases/02-trading-portfolio/02-02-PLAN.md
  - .planning/phases/02-trading-portfolio/02-02-SUMMARY.md
  - .planning/phases/02-trading-portfolio/02-03-PLAN.md
  - .planning/phases/02-trading-portfolio/02-03-SUMMARY.md
  - .planning/phases/02-trading-portfolio/02-04-PLAN.md
  - .planning/phases/02-trading-portfolio/02-04-SUMMARY.md
  - .planning/phases/02-trading-portfolio/02-05-PLAN.md
  - .planning/phases/02-trading-portfolio/02-05-SUMMARY.md
  - .planning/phases/02-trading-portfolio/02-06-PLAN.md
  - .planning/phases/02-trading-portfolio/02-06-SUMMARY.md
  - frontend/README.md
  - frontend/app/page.tsx
  - frontend/components/Header.tsx
  - frontend/components/Heatmap.tsx
  - frontend/components/PnlChart.tsx
  - frontend/components/Positions.tsx
  - frontend/components/TradeBar.tsx
  - frontend/package-lock.json
  - frontend/package.json
  - frontend/store/format.ts
  - frontend/store/portfolio.test.ts
  - frontend/store/portfolio.ts
  - frontend/store/terminal.ts
  - test/README.md
  - test/e2e/03-trading.spec.ts
  - test/portfolio-probe.mjs
covered_digest: "v1:sha256:24457c9a48c71617801e448ef24a117e1a87539d3d4677138778b0853d0cd45f"
behavior_unverified: 0
overrides_applied: 0
flagged_prohibitions: 1
re_verification:
  previous_status: human_needed
  previous_score: 15/19
  gaps_closed:
    - "G-02-3: Buy is green, Sell is neutral text, rejections are red (UAT test 3)"
    - "G-02-1: Buy and Sell stay visible at 768-850 px with the chat drawer open"
    - "Backstops resolved by UAT: heatmap tile legibility (test 1), P&L canvas sizing (test 2), history race (test 4)"
    - "Flagged prohibitions from the first verification resolved by UAT: success-line price (test 6), 02-02 package approval (test 7)"
  gaps_remaining:
    - "G-02-5: header total does not depend on summation order, proven by a unit test"
  regressions: []
gaps:
  - truth: "Header total does not depend on the order positions are summed, proven by a unit test that holds state fixed and sums positions in different orders (UAT G-02-5; 02-05 must_have truth 1)"
    status: failed
    reason: "The property is false and the committed test cannot detect it. selectTotalValue is a plain float reduce, so near a half-cent the displayed total depends on order. The verifier reproduced this against the real selectTotalValue and formatPrice (Vitest scratch test, removed afterwards): cash 7916.37 with A=4.368@370.93, B=4.348@487.04, C=6.396@38.29 gives A,B,C = 11899.145 -> '$11,899.15' and B,A,C = 11899.144999999999 -> '$11,899.14'. frontend/store/portfolio.test.ts still passes, because its fixture total (4716.834494) is 0.0005 from a rounding boundary. The test would pass for any summation order, including the order-dependent code that ships today (review WR-01)."
    artifacts:
      - path: "frontend/store/portfolio.ts"
        issue: "selectTotalValue sums floats (line 11), so the rounded header total depends on order at half-cent boundaries"
      - path: "frontend/store/portfolio.test.ts"
        issue: "Its only fixture sits far from a half-cent boundary, so the order-independence test is vacuous; its comment says what must not change is the cents the header shows, which is false in general"
    missing:
      - "Make the total exactly order-independent, for example by summing in integer cents (Math.round(qty * livePrice * 100), starting from Math.round(cash * 100), then / 100), which also matches the backend's per-position rounding (backend/app/portfolio.py:87,92)"
      - "Add the half-cent boundary fixture (cash 7916.37; 4.368@370.93, 4.348@487.04, 6.396@38.29) and assert exact toBe equality across every permutation; show it fails on the current reduce first"
      - "Or, if the float sum is kept, restate the G-02-5 truth and the test comment to what actually holds (orderings agree within 1e-9; the backend's ORDER BY ticker makes the runtime order fixed) and record that as an accepted override"
human_verification:
  - test: "Check that nothing else listens on port 8000 (lsof -nP -iTCP:8000 -sTCP:LISTEN), run scripts/start_mac.sh, and open http://localhost:8000 at about 1600x1000. Buy 1 AAPL, sell 1 AAPL, then try to sell 1000 AAPL. Narrow the window to about 800 px with the AI chat drawer open."
    expected: "The Bought line is green, the Sold line is the normal light text color, and the rejection is red. At about 800 px, Buy and Sell are visible under the inputs with no scrolling inside the Trade panel. At full width the trade bar is one row."
    why_human: "The user's own visual retest of G-02-1 and G-02-3 on the rebuilt tag (02-06 end-of-phase human check). The E2E suite and the verifier's scratch check already assert these, so this is confirmation, not discovery."
  - test: "Confirm you typed 'approved' at the 02-05 Task 1 checkpoint for vitest 5.0.2, its vite 8.x peer and @types/node ^24 before commit fe894d3."
    expected: "Yes, approval came before the install."
    why_human: "unverified-prohibition (02-05, test-tier): 'MUST NOT install before the human replies approved'. Git history cannot show when approval happened; only the SUMMARY claims it."
---

# Phase 2: Trading & Portfolio Verification Report

**Phase Goal:** The user can trade from the trade bar and see the result across the portfolio: cash, positions table, heatmap, P&L chart, and live total value
**Verified:** 2026-09-27T00:45:00Z
**Status:** gaps_found
**Re-verification:** Yes, after gap-closure plans 02-04, 02-05 and 02-06. This report replaces the 2026-09-26 report, which had no `gaps:` section, so every truth was checked again.

The verifier did not rely on the SUMMARY claims. It ran these checks itself:

- rebuilt the static export
- ran the Phase 2 E2E subset and the portfolio probe on a fresh temp DB (port 8010)
- ran a scratch layout and color check across seven viewports
- ran the compose E2E gate in Docker
- ran Vitest, pytest and the integrity gates
- reproduced review WR-01 against the real `selectTotalValue`

**MVP-mode note:** ROADMAP marks Phase 2 `Mode: mvp`, but `user-story.validate` rejects the goal because it is not in "As a …, I want to …, so that …." form. As in the first verification and in every plan's "Phase Goal" note, no user story was invented. This report uses standard goal-backward verification and omits the User Flow Coverage table. To make this consistent, run `/gsd mvp-phase 2` to add a user-story goal, or clear `mode: mvp`.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: buy or sell a typed ticker and quantity; cash changes; the position appears, updates, or disappears at zero | ✓ VERIFIED | 03-trading buy and sell passed locally (fresh DB) and in the compose container. The scratch check saw "Bought 1 AAPL @ $189.98", then "Sold 1 AAPL @ $190.00" |
| 2 | SC2: a rejected trade shows the backend text and leaves cash and positions unchanged | ✓ VERIFIED | 03-trading "rejected trades" passed in both runs. `applyPortfolio` still runs only after `r.ok` (terminal.ts:78-79). The scratch check saw "Insufficient shares: trying to sell 99999 NFLX, hold 0" |
| 3 | SC3: header total = cash + live positions value, updating on every tick and after every trade | ✓ VERIFIED | `portfolio-probe: PASS totals=20 samples=20` (identity on every sample, 20 distinct totals). Header uses `useTerminal(selectTotalValue)` |
| 4 | SC4: heatmap sized by weight with green/red tiles, canvas P&L chart from snapshots, empty-positions message | ✓ VERIFIED | 04-portfolio-viz 3/3 passed locally and in the container. Heatmap and PnlChart are unchanged since the first verification |
| 5 | SC5: 03-trading and 04-portfolio-viz pass against the container | ✓ VERIFIED | The verifier ran `docker compose -f test/docker-compose.test.yml` build and run (01, 03, 04, 06): `10 passed (5.2s)`, then `down -v`. `ps -a` for the project is empty |
| 6-15 | First-verification plan truths 6-15 (success line from the response, D-01/D-04, the 422 and "Invalid ticker" messages, positions columns and order, empty and loading states, selector purity, package pins, P&L dedupe and poll, heatmap color and title, empty notes) | ✓ VERIFIED (regression) | The code for these is unchanged: `git diff 4264d02` touches only the result color, the `TradeResult.side` field, and the Trade panel and bar height classes. The probe's empty-inputs and lowercase stages passed, and the E2E subset passed |
| 16 | Backstop 02-02: heatmap tiles with ≥10% weight legible at 1600x1000 | ✓ VERIFIED | Observed by the user: UAT test 1 pass |
| 17 | Backstop 02-02: P&L canvas fills its panel with no scrollbar or resize loop | ✓ VERIFIED | Observed by the user: UAT test 2 pass |
| 18 | Backstop 02-02: overlapping history fetches, with no duplicate times reaching setData | ✓ VERIFIED | Observed by the user: UAT test 4 pass |
| 19 | **G-02-5 / 02-01 backstop / 02-05 truth 1:** header total does not depend on summation order, proven by a unit test | ✗ FAILED | See the gap below. The verifier reproduced a 1-cent display difference between orders A,B,C and B,A,C using the shipped `selectTotalValue`. The committed test passes on this order-dependent code, so it cannot catch the defect |
| 20 | **G-02-3 / 02-04 truth 1:** Bought is green rgb(63,185,80), Sold is neutral rgb(230,237,243), rejection is red rgb(248,81,73) | ✓ VERIFIED | `resultColor` (TradeBar.tsx:11-15) branches on `!r.ok` before `side`. `side` is set on all three `placeTrade` returns (terminal.ts). The E2E `toHaveCSS` assertions passed locally and in Docker. The scratch check also confirmed a rejected **sell** is red (`text-down`), which no test asserts (review IN-01) |
| 21 | **G-02-1 / 02-04 truth 2:** Buy and Sell stay visible at every desktop width, including 768-850 px with the chat drawer open | ✓ VERIFIED | `md:h-24` removed (page.tsx:32); the bar uses `min-h-16`. The E2E test at 768x600 passed in both runs. The scratch check with the chat drawer at 320 px, at 768, 800, 820, 850, 900, 1024 and 1600: Buy and Sell in view and the panel body never overflows at any width |
| 22 | 02-04 truth 3: one row at 1600x1000; the local run reports 10 passed; the probe prints PASS | ✓ VERIFIED | Scratch check: oneRow=true at 1600 and 1024. Local run: `10 passed (5.2s)`, probe PASS |
| 23 | 02-04 truth 4: each new E2E assertion failed before the fix | ✓ VERIFIED | Pre-fix code: `git show 0a1002f^` has `result.ok ? "text-up"` for every fill, so a sell rendered rgb(63,185,80) and the new assertion rejects it. `git show 100d2dc^` has `md:h-24` plus `h-full`, the clipping root cause measured in the debug session |
| 24 | 02-04 truth 5: 02-UI-SPEC.md and 02-CONTEXT.md match the code | ✓ VERIFIED | UI-SPEC lines 87, 106, 110, 118 and 172 and CONTEXT D-02 (line 24) and line 41 were amended as planned |
| 25 | 02-05 truth 2: the test pins cash + Σ qty × live price, with the current_price fallback (JPM) | ✓ VERIFIED | portfolio.test.ts: `toBeCloseTo(4716.834494, 9)`, and JPM is missing from `prices`. Without the fallback the result would be NaN and the test would fail |
| 26 | 02-05 truth 3: vitest, vite and @types/node were installed only after the user approved | ? UNCERTAIN | Git cannot show when approval happened; only the 02-05 SUMMARY claims it. Human item |
| 27 | 02-05 truth 4: minimal runner (only vitest added, pinned 5.0.2; @types/node ^24; `vitest run`; no config); build and lint pass; selectTotalValue unchanged | ✓ VERIFIED | devDependencies match the planned set exactly. The only install-script entries are fsevents and unrs-resolver. No `vite*.config.*`. Build and lint rc 0 (verifier run). `git diff 0196ca8 -- frontend/store/portfolio.ts` is empty |
| 28 | 02-06 truth 1: `docker build -t finally .` succeeds at HEAD and the tag holds the gap-closure code | ✓ VERIFIED | The `finally` image was created 2026-09-27T00:20:35Z, after the last code commit (fe894d3, 00:17:59Z); commits after it touch only `.planning`. The compose `build finally` also succeeded (verifier run). Note: the image ID is now `sha256:43e7664e…`, not the `d3423355…` quoted in the SUMMARY; the created timestamp matches, so this is likely a config vs manifest digest difference |
| 29 | 02-06 truth 2: the rebuilt tag serves "Market order" and the probe passes | ✓ VERIFIED | `docker run … finally` shows `index.html` contains "Market order" (1 hit). The verifier ran the probe against the fresh local build, not a throwaway container. The container path is covered by the compose E2E run, which exercises the same trade and total flow |
| 30 | 02-06 truth 3: compose path reports 10 passed, including the sell-color and narrow-width tests | ✓ VERIFIED | Verifier compose run: `10 passed (5.2s)`, with the narrow-width test listed as #6 |
| 31 | 02-06 truth 4: `npm --prefix frontend test` passes | ✓ VERIFIED | `Test Files 1 passed (1)`, `Tests 2 passed (2)`. The run passes, but the property its second test claims is false (truth 19) |
| 32 | 02-06 truth 5: binding tests have additions only; backend unchanged; no absolute URLs; no key names in the bundle | ✓ VERIFIED | numstat vs d92088b: `12 0 test/e2e/03-trading.spec.ts` only. The backend diff vs 0196ca8 is empty. No `https?://` matches in frontend app, components or store. 0 files in `/app/backend/static` match `OPENROUTER` or `sk-or-`. pytest: 75 passed |
| 33 | 02-06 truth 6: the user's `finally` container and `finally-data` volume are untouched | ✓ VERIFIED | `finally-data` is still listed. No `finally` or `finally-phase2-check` container exists. The verifier used only temp DBs, port 8010 and the test compose project (then `down -v`) |

**Score:** 31/33 truths verified (1 failed, 1 uncertain; 0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/store/terminal.ts` | `TradeResult` carries `side` | ✓ VERIFIED | Type plus all three returns |
| `frontend/components/TradeBar.tsx` | `resultColor()`, root `min-h-16` | ✓ VERIFIED | Present and used on the trade-result `<p>` |
| `frontend/app/page.tsx` | Trade panel without a fixed md height | ✓ VERIFIED | `${STACKED} md:shrink-0` |
| `test/e2e/03-trading.spec.ts` | color assertions plus the narrow-width test | ✓ VERIFIED | 12 added lines, 0 deleted |
| `frontend/store/portfolio.test.ts` | order-independence and correctness test | ✗ STUB (for its order claim) | The correctness test is substantive. The order test is vacuous: its fixture cannot expose order dependence |
| `frontend/package.json` / `package-lock.json` | `vitest run`, vitest 5.0.2, @types/node ^24 | ✓ VERIFIED | `npm ci` in the Docker stage succeeded |
| `frontend/README.md` | `npm test` line | ✓ VERIFIED | Line 4 |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| TradeBar.tsx | terminal.ts | `resultColor(result)` reads `ok` and `side` from `placeTrade`'s result | ✓ WIRED |
| 03-trading.spec.ts | TradeBar.tsx | `toHaveCSS("color", …)` on trade-result; `toBeInViewport({ ratio: 1 })` on Buy and Sell | ✓ WIRED (passes; the pre-fix code fails it) |
| page.tsx | TradeBar.tsx | the Trade `Panel` wraps `<TradeBar />` and sizes to it | ✓ WIRED |
| portfolio.test.ts | portfolio.ts / format.ts | imports `selectTotalValue` and `formatPrice` | ✓ WIRED; the order assertion is too weak (truth 19) |
| Dockerfile | package-lock.json | `RUN npm ci`, then `npm run build` type-checks the test file | ✓ WIRED (compose build succeeded) |
| docker-compose.test.yml | Dockerfile | `context: ..` | ✓ WIRED (verifier gate ran) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| trade-result color | `TradeResult.side` | server `body.trade.side` on success; the requested side on failure | Yes | ✓ FLOWING |
| Header total-value | cash, positions, prices | /api/portfolio, the trade response, SSE | Yes (20 distinct totals in the probe) | ✓ FLOWING |
| Positions / Heatmap / PnlChart | unchanged since the first verification | same | Yes (E2E passed) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Order dependence of the header total (WR-01) | scratch Vitest file calling the real `selectTotalValue` and `formatPrice` (removed afterwards) | `ABC 11899.145 $11,899.15` vs `BAC 11899.144999999999 $11,899.14`; the assertion failed | ✗ FAIL (confirms the gap) |
| Frontend unit tests | `npm --prefix frontend test` | 1 file, 2 passed | ✓ PASS |
| Static export plus lint | `npm --prefix frontend run build && … lint` (sandbox off) | build ok, `/` prerendered; lint rc 0 | ✓ PASS |
| Local E2E subset (fresh DB, :8010) | playwright 01+03+04+06, grep-invert "clicking a ticker" | `10 passed (5.2s)` | ✓ PASS |
| Portfolio probe | `node test/portfolio-probe.mjs http://127.0.0.1:8010` | `PASS totals=20 samples=20` | ✓ PASS |
| Layout and colors across widths (scratch, removed) | Playwright at 768-1600 plus three trades | all widths OK; rejected sell red, buy green, sell neutral | ✓ PASS |
| Compose gate in Docker | compose build plus run 01+03+04+06 | `10 passed (5.2s)`; `down -v` clean | ✓ PASS |
| Backend | `uv run --directory backend pytest -q` | 75 passed | ✓ PASS |
| Image bundle | `docker run --entrypoint sh finally -c "grep …"` | "Market order" present; 0 key hits | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| `test/portfolio-probe.mjs` | `node test/portfolio-probe.mjs http://127.0.0.1:8010` | exit 0, `portfolio-probe: PASS totals=20 samples=20` | PASS |
| `scripts/*/tests/probe-*.sh` | none found | n/a | n/a |

### Prohibitions

| Plan | Prohibition | Tier | Disposition |
|------|-------------|------|-------------|
| 02-04 | No existing test/e2e line edited; only lines added to 03-trading | test | ✓ Enforced: numstat `12 0` |
| 02-04 | No change to result copy, button colors, D-01 or D-04 | test | ✓ Enforced: the diff shows only the color function and height classes; E2E text assertions pass |
| 02-04 | Panel.tsx not edited | test | ✓ Enforced: the diff since 4264d02 is empty |
| 02-05 | No install before human approval | test | ⚠️ Flagged: not auditable from git. Human item |
| 02-05 | selectTotalValue unchanged | test | ✓ Enforced: the diff vs 0196ca8 is empty. The gap fix will need to lift this for the next plan |
| 02-06 | No test edits to make the gate pass | test | ✓ Enforced: numstat |
| 02-06 | User's container and volume untouched | test | ✓ Volume present; no user container existed |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| TRAD-01 | 02-01, 02-03, 02-04, 02-06 | ✓ SATISFIED | Truths 1, 21, 22 |
| TRAD-02 | 02-01, 02-03, 02-04, 02-06 | ✓ SATISFIED | Truths 2, 20 |
| HDR-02 | 02-01, 02-03, 02-05, 02-06 | ✓ SATISFIED (the requirement itself) | Truth 3. The header total equals cash + live value and updates on ticks and trades. The extra G-02-5 order property is the open gap, not the requirement text |
| PORT-01 | 02-01, 02-03 | ✓ SATISFIED | Truths 1, 6-15 |
| PORT-02 | 02-01, 02-03 | ✓ SATISFIED | Truths 6-15 (positions-empty) |
| PORT-03 | 02-02, 02-03 | ✓ SATISFIED | Truths 4, 16 |
| PORT-04 | 02-02, 02-03 | ✓ SATISFIED | Truths 4, 17, 18 |

All 7 phase IDs appear in plan frontmatter and map to Phase 2 in REQUIREMENTS.md. No requirement is orphaned.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| frontend/store/portfolio.test.ts | 58-67 | The test claims a property it cannot detect (review WR-01) | 🛑 Blocker (for G-02-5) | False assurance for exactly the property the UAT gap asked to prove |
| frontend/store/portfolio.ts | 11 | Float reduce; the displayed total is order-dependent at half-cent boundaries | ⚠️ Warning | Runtime impact is small: the backend returns positions `ORDER BY ticker`, so the order is fixed in practice. The total can also differ by a cent from the backend's `total_value`, which rounds each position first |
| frontend/store/terminal.ts | 77-78 | `r.json()` outside the try (earlier WR-02, still open) | ⚠️ Warning | A non-JSON 5xx rejects out of placeTrade and leaves a stale line (possibly a green "Bought …") on screen |
| test/e2e/03-trading.spec.ts | 30, 49-50 | The sell color equals the inherited body color; the rejected-sell color is not asserted (review IN-01) | ℹ️ Info | The verifier checked the rejected-sell color manually (red) |
| frontend/app/page.tsx | 29-34 | The Chart panel gets about 140 px at 768x600 (review IN-03) | ℹ️ Info | Phase 3 concern (price chart) |
| all phase files | - | TBD/FIXME/XXX/TODO/HACK | none | - |

### Human Verification Required

1. **G-02-1 and G-02-3 visual retest.** Run `scripts/start_mac.sh` and open http://localhost:8000 at 1600x1000. Buy 1 AAPL, sell 1 AAPL, then try to sell 1000 AAPL. Expected: Bought is green, Sold is light neutral text, and the rejection is red. At about 800 px with the chat drawer open, Buy and Sell are visible with no scrolling inside the Trade panel. At full width the bar is one row.
2. **Flagged prohibition (02-05).** Confirm you approved vitest 5.0.2, vite 8.x and @types/node ^24 before commit fe894d3.

### Gaps Summary

Most of the phase goal is achieved. All five ROADMAP success criteria were re-proven by the verifier's own runs: 10 passed locally on a fresh DB, 10 passed on the Docker compose path, and the probe passed. All seven requirement IDs are satisfied. G-02-1 and G-02-3 are closed in the code: the verifier's scratch check covered the whole 768-850 px range plus wider widths, and all three result-line colors, including the rejected-sell case that no test asserts.

One gap remains: **G-02-5 is not closed.** Its truth says the header total does not depend on summation order, proven by a unit test. That property is false for the shipped `selectTotalValue`: two orders of the same state give "$11,899.15" and "$11,899.14". The committed test cannot detect this, because its only fixture sits 0.0005 from a rounding boundary, and it passes on the order-dependent code. The user-visible effect today is negligible, since the backend returns positions in a fixed order. But the UAT asked for a proof, and the test gives a false one. Close it one of two ways:

- **Fix (recommended):** sum in integer cents, add the boundary fixture, and assert exact equality across permutations, test-first.
- **Accept:** restate the truth to what actually holds (orderings agree within 1e-9, and the runtime order is fixed) and record an override:

```yaml
overrides:
  - must_have: "Header total does not depend on the order positions are summed, proven by a unit test that holds state fixed and sums positions in different orders"
    reason: "Positions arrive ORDER BY ticker from the backend, so the runtime order is fixed; the float sum agrees across orders within 1e-9 and can differ by one displayed cent only at half-cent boundaries"
    accepted_by: "{name}"
    accepted_at: "{ISO timestamp}"
```

Environment notes: the build, local E2E, probe, Docker and pytest ran with the sandbox off (localhost, Docker socket, uv cache). Every scratch file the verifier created in the repo was removed; `git status` for frontend and test is clean.

---

_Verified: 2026-09-27T00:45:00Z_
_Verifier: Claude (gsd-verifier)_
