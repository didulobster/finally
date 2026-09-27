---
phase: 02-trading-portfolio
verified: 2026-09-27T02:34:31Z
status: human_needed
score: 40/41 must-haves verified (0 failed, 1 needs human confirmation; 1 superseded truth excluded)
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
  - .planning/phases/02-trading-portfolio/02-07-PLAN.md
  - .planning/phases/02-trading-portfolio/02-07-SUMMARY.md
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
covered_digest: "v1:sha256:699c7bb591356fd75b81928ea4cb20047e1e1c64b3bf69068dea893534b38c06"
behavior_unverified: 0
overrides_applied: 0
flagged_prohibitions: 1
re_verification:
  previous_status: gaps_found
  previous_score: 31/33
  gaps_closed:
    - "G-02-5: header total does not depend on the order positions are summed, proven by a unit test (02-07: integer-cents selectTotalValue; exact toBe across all orders at a real half-cent boundary; the verifier re-proved that the test fails on the pre-fix reduce)"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "WR-01 (review 96e772c): the header's per-position cent rounding (JS Math.round(v*100), ties up after the x100 multiply) differs from the backend's Python round(market_value, 2) (exact binary value, ties to even). For a fractional holding whose value sits on or near a half cent, the header total and /api/portfolio total_value (and so the latest P&L snapshot) differ by one cent per affected position. The docstring at frontend/store/portfolio.ts:14, the test name at portfolio.test.ts:85, and 02-UI-SPEC.md lines 151 and 212 say 'as the backend does', which is false in general."
    category: other
    reason: "Evidenced (the verifier reproduced it: cash 9904.87 + 0.5 x 190.13 gives header $9,999.94 and backend total_value 9999.93), but it does not break any must-have: HDR-02 and SC3 define the header as cash + live positions value, which both sides represent to the cent; no truth or requirement ties the header to the backend's total_value; and 02-07's edge table recorded this exact per-position tie as a flagged assumption outside G-02-5. Recorded as a warning, not a gap. Resolve by either (a) removing 'as the backend does' from the docstring, the test name and the two UI-SPEC lines, or (b) making one rounding rule shared by both sides (review WR-01 fix) and adding a per-position-tie unit test."
    evidence_status: "reproduced by the verifier (node + uv run python); non-blocking by judgment"
human_verification:
  - test: "Run scripts/start_mac.sh first (the running finally container uses image 43e7664, built before 02-07; the rebuilt finally tag is e609d826). Open http://localhost:8000 at about 1600x1000. Buy 1 AAPL, sell 1 AAPL, then try to sell 1000 AAPL. Narrow the window to about 800 px with the AI chat drawer open."
    expected: "The Bought line is green, the Sold line is the normal light text color, and the rejection is red. At about 800 px, Buy and Sell are visible under the inputs with no scrolling inside the Trade panel. At full width the trade bar is one row."
    why_human: "The user's own visual retest of G-02-1 and G-02-3 (end-of-phase check carried from 02-06). The E2E suite passed these assertions in the verifier's local and compose runs, so this is confirmation, not discovery."
  - test: "Confirm you typed 'approved' at the 02-05 Task 1 checkpoint (vitest 5.0.2, its vite 8.x peer, @types/node ^24) before commit fe894d3."
    expected: "Yes, approval came before the install."
    why_human: "Flagged test-tier prohibition (02-05: MUST NOT install before the human replies approved). Git cannot show when approval happened. The orchestrator reports it witnessed the approval before the install; that is an attestation from another agent, not evidence the verifier could check, so the item stays flagged for a one-word user confirmation."
---

# Phase 2: Trading & Portfolio Verification Report

**Phase Goal:** The user can trade from the trade bar and see the result across the portfolio: cash, positions table, heatmap, P&L chart, and live total value
**Verified:** 2026-09-27T02:34:31Z
**Status:** human_needed
**Re-verification:** Yes, after gap-closure plan 02-07. This replaces the report from commit 5bbfc88 (gaps_found, G-02-5). The failed truth got the full three-level check. All other truths got a regression check, and the verifier re-ran every runtime gate itself.

The verifier did not rely on the SUMMARY claims. It ran these checks itself:

- Vitest: 5 passed.
- A RED re-proof: the 0196ca8 selector swapped in, the tests run, the file restored byte for byte.
- A 20,000-case randomized order check against the real `selectTotalValue`.
- Static build and lint.
- The local E2E subset and probe on port 8010 with a fresh temp DB.
- A throwaway container from the rebuilt `finally` tag on port 8011: probe, plus "Market order" in index.html.
- A check that the image bundle contains the whole-cents selector.
- The Docker compose E2E gate.
- Backend pytest.
- WR-01 reproduced in both Node and Python.

Port 8000, the user's `finally` container and the `finally-data` volume were not touched.

**MVP-mode note:** ROADMAP marks Phase 2 `Mode: mvp`, but the goal is not in "As a …, I want to …, so that …." form. As in the earlier verifications and every plan's Phase Goal note, no user story was invented. This report uses standard goal-backward verification. To make this consistent, run `/gsd mvp-phase 2` or clear `mode: mvp`.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: buy or sell a typed ticker and quantity; cash changes; the position appears, updates, or disappears at zero | ✓ VERIFIED | Verifier runs: 03-trading buy and sell passed locally (:8010, fresh DB) and on the compose path |
| 2 | SC2: a rejected trade shows the backend text and leaves cash and positions unchanged | ✓ VERIFIED | 03-trading "rejected trades" passed in both runs. `applyPortfolio` runs only after `r.ok` (terminal.ts:78-79) |
| 3 | SC3: header total = cash + live positions value, updating on every tick and after every trade | ✓ VERIFIED | Header.tsx:15 `useTerminal(selectTotalValue)`, rendered as `formatPrice`. Probe PASS locally (`totals=16 samples=20`) and on the 8011 container (`totals=18 samples=20`): identity on every sample, and the total moves with ticks. See WR-01 below for the one-cent tie difference from the backend's `total_value` |
| 4 | SC4: heatmap sized by weight with green and red tiles, canvas P&L chart from snapshots, empty-positions message | ✓ VERIFIED | 04-portfolio-viz 3/3 passed locally and in compose. Heatmap.tsx and PnlChart.tsx are unchanged since 5bbfc88 |
| 5 | SC5: 03-trading and 04-portfolio-viz pass against the container | ✓ VERIFIED | Verifier ran `docker compose -f test/docker-compose.test.yml` build, then run (01+03+04+06): `10 passed (5.3s)`, then `down -v`. `ps -a` for the project is empty |
| 6-15 | First-verification plan truths (success line from the response, D-01/D-04, 422 and "Invalid ticker" messages, positions columns and order, empty and loading states, package pins, P&L dedupe and poll, heatmap color and title, empty notes) | ✓ VERIFIED (regression) | `git diff --name-only 5bbfc88 HEAD -- frontend backend test` lists only store/portfolio.ts and store/portfolio.test.ts. The probe's empty-input and lowercase stages passed, and both E2E runs passed |
| 15b | 02-01 edge "HDR-02 precision": selectTotalValue sums unrounded numbers; portfolio.ts contains no Math.round | SUPERSEDED (not counted) | 02-07 truth 1 replaced it by the user's decision of 2026-09-27 (fix G-02-5 in code): the selector now uses `Math.round` per term on purpose. It is excluded from the score rather than failed |
| 16 | Backstop 02-02: heatmap tiles with ≥10% weight legible at 1600x1000 | ✓ VERIFIED | UAT test 1 pass (user) |
| 17 | Backstop 02-02: P&L canvas fills its panel, no scrollbar or resize loop | ✓ VERIFIED | UAT test 2 pass (user) |
| 18 | Backstop 02-02: overlapping history fetches; no duplicate times reach setData | ✓ VERIFIED | UAT test 4 pass (user) |
| 19 | **G-02-5 / 02-01 ordering backstop / 02-05 truth 1:** header total does not depend on summation order, proven by a unit test | ✓ VERIFIED | Previously FAILED. `selectTotalValue` (portfolio.ts:17-21) reduces integers from `cents(cash)`, adding `cents(qty × livePrice)` per term, then `/100` once. Integer addition below 2^53 is exact, so order cannot matter. The unit test at portfolio.test.ts:76-83 asserts exact `toBe` equality across all 6 orders of the 11899.145 boundary. **Verifier's RED re-proof:** with the 0196ca8 selector swapped in, the run exits 1, `4 failed / 1 passed`, including `expected 11899.144999999999 to be 11899.145`; the fixed file was restored byte for byte. **Randomized check:** 20,000 random states (2-7 fractional positions) through the real module, each against a shuffled order: 0 differences. The old reduce showed 5 display differences on the same generator |
| 20 | G-02-3 / 02-04 truth 1: Bought green, Sold neutral, rejection red | ✓ VERIFIED | `resultColor` (TradeBar.tsx:11-15) is unchanged. The E2E `toHaveCSS` assertions passed in both verifier runs |
| 21 | G-02-1 / 02-04 truth 2: Buy and Sell visible at 768-850 px with the chat drawer open | ✓ VERIFIED | "Buy and Sell stay visible at a narrow desktop width" passed in both runs. page.tsx is unchanged |
| 22 | 02-04 truth 3: one row at 1600x1000; local run 10 passed; probe PASS | ✓ VERIFIED | Local `10 passed (5.3s)`, probe PASS. Layout files are unchanged since the prior verifier's width check |
| 23 | 02-04 truth 4: each new E2E assertion failed before the fix | ✓ VERIFIED (regression) | Established in the prior verification from `git show 0a1002f^` and `100d2dc^`. Those commits are unchanged |
| 24 | 02-04 truth 5: UI-SPEC and CONTEXT match the code | ✓ VERIFIED | Unchanged since the prior verification |
| 25 | 02-05 truth 2: the test pins cash + Σ qty × live price with the current_price fallback (JPM) | ✓ VERIFIED | portfolio.test.ts:60-63 asserts `toBe(4716.83)`, and JPM is missing from `prices`. Without the fallback the value is NaN and the test fails |
| 26 | 02-05 truth 3: vitest, vite and @types/node were installed only after the user approved | ? UNCERTAIN | Not auditable from git. The orchestrator attests it witnessed the approval before the install. Human item 2 |
| 27 | 02-05 truth 4: minimal runner (vitest pinned 5.0.2, @types/node ^24, `vitest run`, no config); build and lint pass | ✓ VERIFIED | package.json and the lockfile are unchanged since 5bbfc88. Build rc 0 and lint rc 0 (verifier run). The clause "selectTotalValue unchanged" was 02-05's scope fence and is superseded by 02-07 |
| 28 | 02-06/02-07: `docker build -t finally .` succeeds and the tag holds the latest code | ✓ VERIFIED | Tag `finally` = `sha256:e609d826…`, created 02:24:33Z, after fix commit df00fd1 (02:23:15Z). The image's `/app/backend/static/_next/static/chunks/2xqb1ba8jqk-h.js` contains the exact minified whole-cents selector from the verifier's own HEAD build (`function W(t){return Math.round(100*t)}function I(t){return null===t.cash?null:t.positions.reduce…`) |
| 29 | 02-06/02-07: the rebuilt tag serves "Market order" and the probe passes | ✓ VERIFIED | Throwaway `finally-verify-check` on :8011: index.html has 1 "Market order" hit, `portfolio-probe: PASS totals=18 samples=20`. The container was removed afterwards |
| 30 | 02-06/02-07: compose path reports 10 passed | ✓ VERIFIED | Verifier compose run: `10 passed (5.3s)` |
| 31 | 02-06 truth 4: `npm --prefix frontend test` passes | ✓ VERIFIED | `Test Files 1 passed (1)`, `Tests 5 passed (5)` |
| 32 | 02-06 truth 5: binding tests only have additions; backend unchanged; no absolute URLs; no keys in the bundle | ✓ VERIFIED | numstat vs d92088b: `12 0 test/e2e/03-trading.spec.ts` only. `git diff --quiet 0196ca8 -- backend` is clean. No `https?://` in frontend app, components or store. The image bundle has 0 files matching `OPENROUTER` or `sk-or-`. pytest: 75 passed |
| 33 | 02-06/02-07: user's `finally` container and `finally-data` volume untouched | ✓ VERIFIED | The container still runs image 43e7664 (created 00:40:30Z), Up and healthy. `finally-data` is listed. Only the test compose project and `finally-verify-check` were created, and both were removed |
| 34 | 02-07 truth 1: whole-cents contract (Math.round(cash×100) + Σ Math.round(qty×live×100), /100 once, live falls back to current_price) | ✓ VERIFIED | portfolio.ts:9-20 matches exactly. `cents` is module-private. `livePrice` is unchanged (used by Heatmap and Positions) |
| 35 | 02-07 truth 2: exact toBe across 6 boundary orders and 24 fixture orders; no tolerance assertion left | ✓ VERIFIED | portfolio.test.ts:65-83. `grep toBeCloseTo\|not associative` finds nothing |
| 36 | 02-07 truth 3: the boundary gives exactly 11899.14, the same as backend get_portfolio | ✓ VERIFIED | Test D passes. The verifier ran the backend formula in `uv run python`: `round(7916.37 + Σ round(mv, 2), 2)` = 11899.14 |
| 37 | 02-07 truth 4: no positions gives the cash; cash null gives null, so total-value stays unrendered | ✓ VERIFIED | Test E passes. Header.tsx:21 renders `total-value` only when `totalValue !== null` |
| 38 | 02-07 truth 5: the new tests fail on the pre-fix float reduce | ✓ VERIFIED | Verifier's own swap-and-restore run (see truth 19). Commit order: `1fb7ff1 test(02-07)` (only portfolio.test.ts) before `df00fd1 fix(02-07)` |
| 39 | 02-07 truth 6: local :8010 run reports 10 passed; probe PASS | ✓ VERIFIED | Verifier run: `10 passed (5.3s)`, `portfolio-probe: PASS totals=16 samples=20` |
| 40 | 02-07 truth 7: `docker build` succeeds; the 8011 throwaway serves "Market order" and passes the probe; compose 10 passed | ✓ VERIFIED | Truths 28-30 |
| 41 | 02-07 truth 8: the UI-SPEC Header total bullet and the "loading \| Header total value" row describe the whole-cents sum | ✓ VERIFIED (with a wording warning) | 02-UI-SPEC.md:151 and :212 contain "whole cents". Both also say "as the backend does", which is only true away from per-position ties (WR-01) |

**Score:** 40/41 truths verified (0 failed, 1 uncertain; 0 present-but-behavior-unverified). One superseded truth (15b) is excluded from the total.

### Advisory and warnings (not blocking)

| # | Finding | Category | Why not a gap |
|---|---------|----------|---------------|
| 1 | WR-01: per-position tie rounding differs between the header (JS) and the backend (Python). Reproduced: `0.5 × 190.13` = 95.06499999999999773 in binary. The `×100` gives exactly 9506.5, and `Math.round` rounds that up to 95.07. Python `round(…, 2)` gives 95.06. With cash 9904.87 the header shows **$9,999.94** and the backend `total_value` is **9999.93**. With 0.5 × 190.25 (an exact tie): header $10,000.00, backend 9999.99 (banker's rounding) | other | See the analysis below |

**WR-01 analysis: does it break a must-have or requirement?**

- **(a) G-02-5.** It is met. WR-01 is not order dependence. Each position is rounded once, the same way, whatever the order, and the integer sum is exact. The unit test proves order independence at a real float boundary and fails on the old code.
- **(b) HDR-02 and SC3.** They still hold. The requirement defines `total-value` as cash + live positions value. The header shows that quantity to the cent: each term is rounded once to the cent, and the probe's identity check passes on every sample. No requirement, ROADMAP criterion or plan truth says the header must equal the backend's `total_value` or the latest P&L snapshot in general. 02-07 truth 3 claims equality only at the 11899.145 boundary fixture, and that holds.
- **The backend is not the more accurate side.** In the realistic flow (fresh $10,000, buy 0.5 @ 190.13), the exact value is $10,000.00. The header shows $10,000.00, while the backend adds its unrounded cash (9904.935) to the rounded 95.06 and reports 9999.99. So this is a rounding-rule mismatch, not a wrong header.
- **02-07 key link "portfolio.ts → backend/app/portfolio.py via the same per-position cents rounding".** It is structurally true: both round each position to cents and then sum. It is not true for the tie rule. The plan's own edge table recorded this exact tie (HDR-02 adjacency) as a flagged assumption, outside G-02-5. Status: ⚠️ PARTIAL, a warning.
- **What is wrong is the wording.** The docstring (`portfolio.ts:14`), the test name (`portfolio.test.ts:85`), the 02-07 SUMMARY ("matches backend get_portfolio rounding") and two UI-SPEC lines say "as the backend does". That is inaccurate in general and misleads future readers.

Recommended follow-up, for the developer to decide; neither option blocks the phase:

- **Option (a):** drop "as the backend does" from the docstring, the test name and UI-SPEC lines 151 and 212, and accept a possible one-cent difference between the header and the snapshot.
- **Option (b):** give both sides one rounding rule, as in the review's WR-01 fix, and add a per-position tie test. If this is deferred, Phase 4's "all 6 E2E specs" work does not depend on it.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/store/portfolio.ts` | Whole-cents `selectTotalValue` via private `cents()`; `livePrice` unchanged | ✓ VERIFIED | Exists, substantive, and wired: Header.tsx:15 uses it; Heatmap and Positions import `livePrice`. Also in the image bundle |
| `frontend/store/portfolio.test.ts` | Exact order tests, boundary fixture 7916.37, 11899.14, empty and null cases | ✓ VERIFIED | Previously a STUB for its order claim. It now fails on the old code and passes on the new |
| `.planning/phases/02-trading-portfolio/02-UI-SPEC.md` | Header total contract says "whole cents" | ✓ VERIFIED | Lines 151 and 212. Wording caveat per WR-01 |
| `frontend/store/terminal.ts`, `TradeBar.tsx`, `page.tsx`, `03-trading.spec.ts`, `package.json` / `package-lock.json`, `frontend/README.md` | 02-04 and 02-05 artifacts | ✓ VERIFIED (regression) | Unchanged since 5bbfc88 |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| Header.tsx | portfolio.ts | `useTerminal(selectTotalValue)` → `formatPrice` in `total-value` | ✓ WIRED |
| portfolio.test.ts | portfolio.ts / format.ts | imports `selectTotalValue` and `formatPrice` | ✓ WIRED; the assertions can now fail (RED re-proof) |
| portfolio.ts | backend/app/portfolio.py | "the same per-position cents rounding as get_portfolio" | ⚠️ PARTIAL: same structure, different tie rule (WR-01); a warning per the plan's own flagged assumption |
| Dockerfile | portfolio.test.ts / package-lock.json | `RUN npm ci`, then `next build` type-checks the test | ✓ WIRED: the compose build succeeded |
| TradeBar.tsx | terminal.ts | `resultColor(result)` reads `ok` and `side` | ✓ WIRED (unchanged) |
| docker-compose.test.yml | Dockerfile | `context: ..` | ✓ WIRED: the verifier's gate ran |
| scripts/start_mac.sh | finally tag | runs `IMAGE=finally` | ✓ The tag holds 02-07. The user's running container predates it, hence human item 1 |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| Header `total-value` | cash, positions, prices | /api/portfolio (seed), trade response, SSE ticks | Yes: 16-18 distinct totals across 20 probe samples | ✓ FLOWING |
| trade-result color | `TradeResult.side` | server `body.trade.side` or the requested side on failure | Yes | ✓ FLOWING |
| Positions, Heatmap, PnlChart | unchanged | same sources | Yes: E2E passed | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unit tests | `npm --prefix frontend test` | `Tests 5 passed (5)` | ✓ PASS |
| RED re-proof (tests fail on pre-fix selector) | swap in `git show 0196ca8:frontend/store/portfolio.ts`, run, restore, `cmp` | rc=1, `4 failed / 1 passed`, `expected 11899.144999999999 to be 11899.145`; restored byte for byte | ✓ PASS |
| Randomized order independence | node, importing the real portfolio.ts; 20,000 states vs a shuffled order | new selector 0 diffs; old reduce 5 display diffs | ✓ PASS |
| WR-01 reproduction | node vs `uv run python` on the same inputs | header 9999.94 vs backend 9999.93; 10000 vs 9999.99; boundary 11899.14 on both | Reproduced (warning) |
| Build and lint | `npm --prefix frontend run build` / `lint` (sandbox off) | rc 0 / rc 0; `/` prerendered static | ✓ PASS |
| Local E2E (:8010, fresh DB) | playwright 01+03+04+06, `--grep-invert "clicking a ticker"` | `10 passed (5.3s)` | ✓ PASS |
| Compose gate | compose build, then run 01+03+04+06, then `down -v` | `10 passed (5.3s)` | ✓ PASS |
| Rebuilt tag holds fix | `docker run --entrypoint sh finally -c "grep -rlF '<minified cents selector>' …"` | 1 chunk matched; 0 key hits | ✓ PASS |
| Backend | `uv run --directory backend pytest -q` | 75 passed | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| `test/portfolio-probe.mjs` (local) | `node test/portfolio-probe.mjs http://127.0.0.1:8010` | exit 0, `portfolio-probe: PASS totals=16 samples=20` | PASS |
| `test/portfolio-probe.mjs` (rebuilt tag) | `node test/portfolio-probe.mjs http://127.0.0.1:8011` | exit 0, `portfolio-probe: PASS totals=18 samples=20` | PASS |
| `scripts/*/tests/probe-*.sh` | none found | n/a | n/a |

### Prohibitions

| Plan | Prohibition | Tier | Disposition |
|------|-------------|------|-------------|
| 02-07 | No tolerance assertion and no override in place of fixing selectTotalValue | test | ✓ Enforced: no `toBeCloseTo`; the selector is fixed; no `overrides:` |
| 02-07 | No change outside store/portfolio.ts and store/portfolio.test.ts (backend, test/e2e, probe, other frontend files) | test | ✓ Enforced: `git diff --name-only 5bbfc88 HEAD -- frontend backend test Dockerfile .dockerignore scripts` lists only those two |
| 02-07 | No npm install, add or bump | test | ✓ Enforced: package.json and the lockfile are unchanged since 5bbfc88 |
| 02-07 | User's container and volume untouched; port 8000 never bound | test | ✓ Container still on 43e7664 and healthy; the volume is listed. The verifier also used only :8010, :8011 and the test compose project |
| 02-05 | No install before human approval | test | ⚠️ Flagged: not auditable from git. The orchestrator attests it; human item 2 |
| 02-01 to 02-06 | Earlier binding-test, panel and D-01/D-04 fences | test | ✓ Enforced (regression): numstat `12 0` on 03-trading only; Panel.tsx, TradeBar and terminal.ts unchanged since 5bbfc88 |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| TRAD-01 | 02-01, 02-03, 02-04, 02-06 | buy or sell any typed ticker and quantity | ✓ SATISFIED | Truths 1, 21, 22 |
| TRAD-02 | 02-01, 02-03, 02-04, 02-06 | rejection shows the backend text verbatim; state unchanged | ✓ SATISFIED | Truths 2, 20 (WR-03 non-JSON 5xx is a robustness warning outside the requirement's backend-error case) |
| HDR-02 | 02-01, 02-03, 02-05, 02-06, 02-07 | `total-value` = cash + live positions value, on every tick and trade | ✓ SATISFIED | Truths 3, 19, 34-39. The WR-01 tie difference is from the backend's `total_value`, not from the requirement's definition |
| PORT-01 | 02-01, 02-03 | positions table; sold to zero disappears | ✓ SATISFIED | Truths 1, 6-15 |
| PORT-02 | 02-01, 02-03 | `positions-empty` with no positions | ✓ SATISFIED | Truths 6-15 |
| PORT-03 | 02-02, 02-03 | treemap by weight, `data-pnl` and color agree | ✓ SATISFIED | Truths 4, 16 |
| PORT-04 | 02-02, 02-03 | canvas P&L chart from `/api/portfolio/history` | ✓ SATISFIED | Truths 4, 17, 18 |

All 7 phase IDs appear in plan frontmatter and map to Phase 2 in REQUIREMENTS.md (lines 103, 113-118). No requirement is orphaned. REQUIREMENTS.md still shows these rows as "Gaps Found". The orchestrator should update them once the human items resolve.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| frontend/store/portfolio.ts | 14 | Docstring says it rounds "as the backend does"; false at per-position ties (WR-01) | ⚠️ Warning | Header and snapshot can differ by one cent per tie position; the comment misleads. Also portfolio.test.ts:85 test name and UI-SPEC:151, :212 |
| frontend/store/terminal.ts | 77 | `await r.json()` outside the try (WR-03, carried forward) | ⚠️ Warning | A non-JSON 5xx rejects out of `placeTrade` and leaves the previous result line (possibly a green "Bought …") on screen |
| frontend/components/TradeBar.tsx | 24 | No in-flight guard (WR-02, carried forward) | ℹ️ Info | Deliberate: locked decision D-04 (02-CONTEXT.md:26) says Buy and Sell stay enabled in flight, and 02-04 forbade changing it. Changing it needs a user decision to revise D-04, not a fix |
| test/e2e/03-trading.spec.ts | 30, 49-50 | Sell color equals the inherited body color; rejected-sell color not asserted (IN-01) | ℹ️ Info | Carried forward |
| frontend/app/page.tsx | 29-34 | Chart panel is about 140 px at 768x600 (IN-03) | ℹ️ Info | Phase 3 concern |
| phase files | - | TBD/FIXME/XXX/TODO/HACK | none | - |

### Human Verification Required

1. **G-02-1 and G-02-3 visual retest on the rebuilt tag.** Run `scripts/start_mac.sh` first. Your running `finally` container uses image 43e7664, built before 02-07; the rebuilt tag is e609d826. Open http://localhost:8000 at about 1600x1000. Buy 1 AAPL, sell 1 AAPL, then try to sell 1000 AAPL. Narrow the window to about 800 px with the AI chat drawer open.
   - **Expected:** Bought is green, Sold is the light neutral text, and the rejection is red. At about 800 px, Buy and Sell are visible with no scrolling inside the Trade panel. At full width the bar is one row.
   - **Why human:** this is your end-of-phase confirmation. The E2E assertions for both already pass in the verifier's local and compose runs.
2. **Flagged prohibition (02-05).** Confirm you typed "approved" for vitest 5.0.2, vite 8.x and @types/node ^24 before commit fe894d3.
   - **Why human:** git cannot show this. The orchestrator says it witnessed the approval first; one word from you closes it.

### Gaps Summary

G-02-5 is closed. `selectTotalValue` now sums integer cents, so no order of positions can change the header total. This is proven three ways:

- The committed unit test asserts exact equality across every order at a real half-cent boundary. The verifier re-proved that it fails on the old float reduce (`expected 11899.144999999999 to be 11899.145`).
- 20,000 randomized states found no order difference.
- The rebuilt `finally` image contains the new selector.

All five ROADMAP success criteria were re-proven by the verifier's own runs:

- local E2E: 10 passed
- compose E2E: 10 passed
- the probe passed on both the local build and the rebuilt tag
- pytest: 75 passed

All seven requirement IDs are satisfied. No truth failed.

The new review finding WR-01 is real and reproduced. It is a per-position tie-rounding difference between the frontend and the backend, not order dependence. It breaks no must-have or requirement, and 02-07 had recorded it as a flagged assumption. It is recorded as a warning, and the "as the backend does" wording should be corrected or the rounding rule unified in a follow-up. WR-03 remains a robustness warning. WR-02 conflicts with locked decision D-04, so it needs a user decision rather than a fix.

Status is `human_needed` only because of the two human items above: the user's visual retest, which needs `scripts/start_mac.sh` first, and the one-word approval confirmation.

Environment notes: the build, local E2E, Docker and pytest ran with the sandbox off (turbopack cache, localhost, Docker socket, uv cache). Vitest, the fuzz check and the RED re-proof ran inside the sandbox. The RED re-proof temporarily swapped `frontend/store/portfolio.ts` and restored it byte for byte (`cmp` clean). `git status` for frontend, backend and test is clean. The throwaway container and the test compose project were removed.

---

_Verified: 2026-09-27T02:34:31Z_
_Verifier: Claude (gsd-verifier)_
