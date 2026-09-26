---
phase: 02-trading-portfolio
verified: 2026-09-26T08:40:00Z
status: human_needed
score: 15/19 must-haves verified (4 backstop truths need human evidence)
covered_files:
  - .planning/REQUIREMENTS.md
  - .planning/phases/02-trading-portfolio/02-01-PLAN.md
  - .planning/phases/02-trading-portfolio/02-01-SUMMARY.md
  - .planning/phases/02-trading-portfolio/02-02-PLAN.md
  - .planning/phases/02-trading-portfolio/02-02-SUMMARY.md
  - .planning/phases/02-trading-portfolio/02-03-PLAN.md
  - .planning/phases/02-trading-portfolio/02-03-SUMMARY.md
  - frontend/app/page.tsx
  - frontend/components/Header.tsx
  - frontend/components/Heatmap.tsx
  - frontend/components/PnlChart.tsx
  - frontend/components/Positions.tsx
  - frontend/components/TradeBar.tsx
  - frontend/package-lock.json
  - frontend/package.json
  - frontend/store/format.ts
  - frontend/store/portfolio.ts
  - frontend/store/terminal.ts
  - test/README.md
  - test/portfolio-probe.mjs
covered_digest: "v1:sha256:140bc09059ff1371816562eb5026ab5b6146343e1d7bada05dd5ba35a8d3b4b9"
behavior_unverified: 0
overrides_applied: 0
flagged_prohibitions: 2
human_verification:
  - test: "Run scripts/start_mac.sh (the finally tag is current; the running finally container is still on the old image ca44884f, so restart it), open http://localhost:8000 at about 1600x1000, buy 3 to 6 tickers (AAPL 10, MSFT 5, GOOGL 8, TSLA 4, NVDA 2)."
    expected: "Every heatmap tile holding at least 10% of invested value shows a readable ticker and P&L %."
    why_human: "Backstop truth (02-02). Tile legibility is visual; spec 04 only checks tile area > 0."
  - test: "Same session: watch the P&L panel for about a minute and resize the window once."
    expected: "The canvas fills the panel body with no scrollbar, and its size does not keep growing or jittering."
    why_human: "Backstop truth (02-02, RESEARCH A5). An autoSize resize feedback loop can only be seen at runtime."
  - test: "Same session: check Buy is green, Sell is red, and a long rejection (for example NFLX 1000000 Buy) stays on one line with the full text on hover."
    expected: "Button colors match UI-SPEC; trade-result truncates to one line and the title shows the full text."
    why_human: "Visual styling; no spec asserts colors or truncation."
  - test: "Place a trade just before a 30 s history poll fires (watch the P&L data-points in devtools)."
    expected: "The new snapshot appears after the trade or, at the latest, on the next poll; the chart never throws on duplicate times."
    why_human: "Backstop truth (02-02 edge PORT-04 concurrency). Needs a timed race; code review IN-02 notes a poll response can briefly overwrite the post-trade list, which self-heals within 30 s and matches the truth wording."
  - test: "Accept or reject: total-value order independence (02-01 backstop). selectTotalValue is a pure reduce over the server's alphabetical positions list; the verifier observed alphabetical rows and a matching total, but no test holds the state fixed and re-renders."
    expected: "Accept as low risk, or ask for a unit test."
    why_human: "Backstop truth: presence and wiring never qualify under the verification rules."
  - test: "Prohibition (02-01, test-tier): the success line shows only the backend trade.price, trade.quantity and trade.ticker. Code at frontend/store/terminal.ts:81-83 builds it from body.trade; the probe proves the ticker comes from the response ('nvda' typed, 'NVDA' shown) but no test compares the displayed price to the response price."
    expected: "Confirm by reading terminal.ts:81-83, or add a test."
    why_human: "unverified-prohibition — human review recommended (test-tier with no dedicated negative test)."
  - test: "Prohibition (02-02, test-tier): lightweight-charts, d3-hierarchy and @types/d3-hierarchy were installed only after your legitimacy approval."
    expected: "Confirm you approved before commit 9485445 (the first commit containing the packages)."
    why_human: "unverified-prohibition — human review recommended. Git history cannot show when approval happened."
---

# Phase 2: Trading & Portfolio Verification Report

**Phase Goal:** The user can trade from the trade bar and see the result across the portfolio: cash, positions table, heatmap, P&L chart, and live total value
**Verified:** 2026-09-26T08:40:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

The verifier did not rely on SUMMARY claims. It rebuilt the frontend, ran the binding E2E subset and the portfolio probe on a fresh temp DB (port 8010), ran the compose E2E gate in Docker itself, ran pytest, and ran its own Playwright edge check (27 assertions) on a second fresh DB.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: User buys or sells a typed ticker and quantity; cash changes and the position appears, updates, or disappears at zero | ✓ VERIFIED | 03-trading buy and sell tests passed locally and in Docker. Verifier check: "Bought 2 AAPL @ $190.05", position-qty-AAPL "2", positions-empty removed, cash dropped; selling 2 AAPL removed position-row-AAPL and its heatmap tile |
| 2 | SC2: A rejected trade shows the backend text and leaves cash and positions unchanged | ✓ VERIFIED | 03-trading rejection test passed. Verifier check: "Insufficient cash: need $600,050,000.00, have $10,000.00" in text-down, cash unchanged, positions-empty still shown; "Insufficient shares: trying to sell 5 AAPL, hold 2", qty still 2, cash unchanged. Code: `applyPortfolio` only runs after `r.ok` (terminal.ts:78-79) |
| 3 | SC3: Header total equals cash + live positions value and updates on every tick and after every trade | ✓ VERIFIED | Header.tsx:15 `useTerminal(selectTotalValue)`; portfolio.ts:9-12 reduces qty x livePrice over positions. portfolio-probe PASS (identity on 20 samples, 16 distinct totals while cash held). Verifier check: total 10000.03 = cash 8844.53 + Σ qty x price 1155.50 with 3 positions |
| 4 | SC4: Heatmap sized by weight, green profit and red loss; canvas P&L chart from snapshots; empty-positions message with no positions | ✓ VERIFIED | Heatmap.tsx uses d3 `treemapSquarify` over live market value with inline rgba colors; PnlChart.tsx uses `addSeries(AreaSeries` and setData from /api/portfolio/history. 04-portfolio-viz 3/3 passed. Verifier check: fresh DB shows positions-empty text and the heatmap empty note, zero tiles; a single position tile fills the heatmap (478x286 = 478x286); data-points went 1 -> 2 after a trade; canvas present |
| 5 | SC5: 03-trading and 04-portfolio-viz pass against the container | ✓ VERIFIED | Verifier ran `docker compose -f test/docker-compose.test.yml` build and run with 01, 03, 04, 06: `9 passed (5.6s)`, then `down -v` (ps -a empty) |
| 6 | Success line uses the response trade object; inputs keep values; Buy and Sell never disabled; no form | ✓ VERIFIED | terminal.ts:81-83; TradeBar.tsx has no `disabled=` and no `<form`. Verifier check: inputs still "AAPL"/"2" after the trade |
| 7 | Empty quantity shows the 422 msg, empty ticker shows "Invalid ticker", lowercase "nvda" fills as NVDA | ✓ VERIFIED | portfolio-probe stages empty-inputs and lowercase PASS |
| 8 | Positions: 6 columns, live Price/P&L/%, alphabetical, colored by sign | ✓ VERIFIED | Positions.tsx:26-57. Verifier check: rows AAPL, GOOGL, TSLA in order; probe row P&L identity passed |
| 9 | positions-empty after load with zero positions; "Loading positions…" while cash is null | ✓ VERIFIED | Positions.tsx:14-21. Verifier check read the exact empty text on a fresh DB |
| 10 | selectTotalValue returns null until loaded and does not round; /api/portfolio fetched once; one EventSource | ✓ VERIFIED | Grep: no toFixed/Math.round in portfolio.ts, no totalValue in terminal.ts, one `fetch("/api/portfolio")`, one `new EventSource` |
| 11 | lightweight-charts 5.2.1, d3-hierarchy 3.1.2, @types/d3-hierarchy 3.1.7 in package.json and lockfile, no install scripts | ✓ VERIFIED | package.json pins exactly; lockfile check shows all three with no hasInstallScript |
| 12 | P&L chart: deduped to one point per second, history on mount, after trades and every 30 s, green/red by last vs first, fitContent | ✓ VERIFIED | PnlChart.tsx:19-23, 34-35, 52-62; terminal.ts:80. Post-trade refresh observed (1 -> 2 points) |
| 13 | Heatmap tile data-pnl and rgb/rgba color agree; intensity min(1, 0.35 + abs(pct)/5); title "{T} · {value} · {pct}" | ✓ VERIFIED | Heatmap.tsx:22-27, 41, 53; spec 04 color check passed locally and in Docker |
| 14 | Heatmap "Loading holdings…" and empty note; P&L "Waiting for the first portfolio snapshot…" overlay | ✓ VERIFIED | Heatmap.tsx:34-37 (empty note observed on fresh DB); PnlChart.tsx:67-69 (not observable: the backend records a startup snapshot, so a fresh DB already has 1 point) |
| 15 | Docker tag rebuilt after the last code commit; bundle has no key names; pytest green; binding tests unchanged; README documents the probe | ✓ VERIFIED | Image created 08:10:00Z after ec8bca7 (08:07:14Z); `grep OPENROUTER|sk-or-` in /app/backend/static finds nothing and index.html has "Market order"; pytest 75 passed; `git diff --quiet d92088b -- test/e2e ...` rc 0; README has `## Portfolio probe` |
| 16 | Backstop: total-value does not depend on summation order; store keeps server order | ? insufficient_spec | Pure reduce in server order; no test holds state fixed across renders. Human item |
| 17 | Backstop: heatmap tiles with >= 10% weight legible at 1600x1000 with 3-6 positions | ? insufficient_spec | Visual. Human item |
| 18 | Backstop: P&L canvas fills the panel with no scrollbar or resize loop | ? insufficient_spec | Visual/runtime. Human item |
| 19 | Backstop: overlapping history fetches replace history wholesale; no duplicate times reach setData | ? insufficient_spec | Map dedupe present (PnlChart.tsx:20-21); race not exercised. Human item |

**Score:** 15/19 truths verified (0 present-but-behavior-unverified; 4 backstop truths routed to human)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/store/terminal.ts` | positions, history, applyPortfolio, placeTrade, loadHistory | ✓ VERIFIED | All exported and used |
| `frontend/store/portfolio.ts` | livePrice, selectTotalValue | ✓ VERIFIED | Used by Header, Positions, Heatmap |
| `frontend/store/format.ts` | formatQty, formatSignedPrice | ✓ VERIFIED | Used by Positions and terminal.ts |
| `frontend/components/TradeBar.tsx` | inputs, buttons, trade-result | ✓ VERIFIED | Rendered in page.tsx:33 |
| `frontend/components/Positions.tsx` | table plus empty and loading states | ✓ VERIFIED | Rendered in page.tsx:46 |
| `frontend/components/Header.tsx` | derived total-value | ✓ VERIFIED | `useTerminal(selectTotalValue)` |
| `frontend/components/Heatmap.tsx` | squarified treemap | ✓ VERIFIED | Rendered in page.tsx:40 |
| `frontend/components/PnlChart.tsx` | LWC v5 area chart | ✓ VERIFIED | Rendered in page.tsx:43 |
| `frontend/package-lock.json` | three packages | ✓ VERIFIED | Present, exact versions |
| `test/portfolio-probe.mjs` | edge probe | ✓ VERIFIED | Ran: PASS |
| `test/README.md` | probe docs | ✓ VERIFIED | Section present |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| TradeBar.tsx | terminal.ts | `placeTrade(` in onClick, result into local state | ✓ WIRED |
| terminal.ts | backend `/api/portfolio/trade` | `fetch("/api/portfolio/trade"`, applyPortfolio on ok | ✓ WIRED (api.py:44-51 returns trade + portfolio) |
| terminal.ts connect() | applyPortfolio | `.then(applyPortfolio)` | ✓ WIRED |
| Header.tsx | portfolio.ts | `useTerminal(selectTotalValue)` | ✓ WIRED |
| Positions.tsx / Heatmap.tsx | portfolio.ts | `livePrice(` | ✓ WIRED |
| PnlChart.tsx | terminal.ts | `loadHistory()` + `setInterval(loadHistory, HISTORY_POLL_MS)` | ✓ WIRED |
| terminal.ts | backend `/api/portfolio/history` | `fetch("/api/portfolio/history")` | ✓ WIRED (api.py:54-56) |
| PnlChart.tsx | lightweight-charts | `addSeries(AreaSeries` | ✓ WIRED |
| Heatmap.tsx | d3-hierarchy | `treemapSquarify` | ✓ WIRED |
| page.tsx | all four components | `<TradeBar />`, `<Positions />`, `<Heatmap />`, `<PnlChart />` | ✓ WIRED; no "arrives in Phase 2" text left |
| test/docker-compose.test.yml | Dockerfile | `context: ..` | ✓ WIRED (gate ran) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| Header total-value | cash, positions, prices | GET /api/portfolio, trade response, SSE | Yes (ticks observed by probe) | ✓ FLOWING |
| Positions rows | positions, prices | Same | Yes | ✓ FLOWING |
| Heatmap tiles | positions, prices | Same | Yes | ✓ FLOWING |
| PnlChart | history | GET /api/portfolio/history (SQLite portfolio_snapshots) | Yes (1 -> 2 points after a trade) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Lint | `npm --prefix frontend run lint` | rc 0 | ✓ PASS |
| Static export build | `npm --prefix frontend run build` (sandbox off) | rc 0, `/` prerendered | ✓ PASS |
| Local E2E subset (fresh temp DB, :8010) | playwright 01+03+04+06, grep-invert "clicking a ticker" | 9 passed (5.5s) | ✓ PASS |
| Portfolio probe | `node test/portfolio-probe.mjs http://127.0.0.1:8010` | `PASS totals=16 samples=20` | ✓ PASS |
| Verifier edge check (second fresh DB) | scratchpad verify-check.mjs | 27/27 OK | ✓ PASS |
| Docker compose gate | compose build + run 01+03+04+06 | 9 passed (5.6s); down -v clean | ✓ PASS |
| Backend pytest | `uv run --directory backend pytest -q` | 75 passed | ✓ PASS |
| Image bundle secrets | `docker run ... grep OPENROUTER|sk-or-` | none | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| `test/portfolio-probe.mjs` | `node test/portfolio-probe.mjs http://127.0.0.1:8010` | exit 0, `portfolio-probe: PASS totals=16 samples=20` | PASS |
| `scripts/*/tests/probe-*.sh` | none found | n/a | n/a |

### Prohibitions

| Plan | Prohibition | Tier | Disposition |
|------|-------------|------|-------------|
| 02-01 | No store write before a 200 | test | ✓ Enforced: 03-trading rejection test and the verifier check (cash and positions unchanged) |
| 02-01 | Success line only from response trade fields | test | ⚠️ Flagged: code is correct, no dedicated test for price. Human item |
| 02-01/02/03 | No edits to binding test files | test | ✓ Enforced: `git diff --quiet d92088b` rc 0 |
| 02-01 | No use of the user's DB, container, or volume | test | ✓ User's `finally` container still Up 6 hours on image ca44884f; verifier also used only temp DBs and the test compose project |
| 02-02 | No fabricated or appended P&L points | judgment | Non-authoritative LLM verdict: holds. setData receives only `toPoints(history)`; 1 -> 2 points after one trade |
| 02-02 | No cash tile; size by live market value | judgment | Non-authoritative LLM verdict: holds. Tiles come from positions only; one position fills the whole heatmap |
| 02-02 | No install before human approval | test | ⚠️ Flagged: not auditable from git. Human item |
| 02-03 | Do not touch the user's container or volume | test | ✓ Container uptime and image unchanged |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| TRAD-01 | 02-01, 02-03 | ✓ SATISFIED | Truth 1, 7 |
| TRAD-02 | 02-01, 02-03 | ✓ SATISFIED | Truth 2, 7 (see WR-02 warning for non-JSON errors) |
| HDR-02 | 02-01, 02-03 | ✓ SATISFIED | Truth 3, 10 |
| PORT-01 | 02-01, 02-03 | ✓ SATISFIED | Truth 1, 8 |
| PORT-02 | 02-01, 02-03 | ✓ SATISFIED | Truth 9 (verifier observed positions-empty; no E2E asserts it) |
| PORT-03 | 02-02, 02-03 | ✓ SATISFIED | Truth 4, 13 |
| PORT-04 | 02-02, 02-03 | ✓ SATISFIED | Truth 4, 12 |

All 7 phase IDs appear in plan frontmatter and in REQUIREMENTS.md, mapped to Phase 2. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (all phase files) | - | TBD/FIXME/XXX/TODO/HACK | none found | - |
| frontend/store/terminal.ts | 77-78 | `r.json()` outside the try; a non-JSON 5xx rejects out of placeTrade (review WR-02) | ⚠️ Warning | A server 500 or proxy 502 leaves the previous trade-result text (possibly a green success) on screen. It does not break the TRAD-02 cases (400/422), but it is a misleading error path |
| frontend/components/TradeBar.tsx | 17, 43-48 | No in-flight guard (review WR-01) | ℹ️ Info | Intended by user decision D-04; a double click places two orders |
| frontend/store/terminal.ts | 103-105 | One-shot portfolio fetch (review WR-03) | ℹ️ Info | Accepted by plan truth "stays on its loading note with no dedicated error UI" |
| frontend/components/PnlChart.tsx | 21, 41 | Time axis in UTC (review WR-04) | ℹ️ Info | Cosmetic: axis labels are off for users outside UTC |

### Human Verification Required

1. **Heatmap tile legibility.** Run `scripts/start_mac.sh` (restart the running `finally` container so it picks up the rebuilt tag), open http://localhost:8000 at about 1600x1000, and buy AAPL 10, MSFT 5, GOOGL 8, TSLA 4, NVDA 2. Expected: every tile with at least 10% of invested value shows a readable ticker and P&L %.
2. **P&L canvas sizing.** Expected: the chart fills its panel with no scrollbar and does not grow or jitter over a minute or after one window resize.
3. **Trade bar visuals.** Expected: Buy is green, Sell is red, and a long rejection stays on one line with the full text on hover.
4. **History race (backstop).** A trade near a 30 s poll: the snapshot appears after the trade or on the next poll, with no chart error.
5. **Total order independence (backstop).** Accept as low risk or ask for a unit test.
6. **Flagged prohibition:** success-line price comes only from the response (read terminal.ts:81-83).
7. **Flagged prohibition:** confirm the package legitimacy approval came before commit 9485445.

### Gaps Summary

No blocking gaps. All five ROADMAP success criteria were confirmed by the verifier's own runs: 9 passed locally and 9 passed in the Docker compose gate, the portfolio probe passed, and a 27-assertion edge check covered positions-empty, rejections leaving positions unchanged, sell-to-zero, alphabetical rows, the total identity and the post-trade chart refresh. All seven requirement IDs are satisfied.

The status is human_needed, not passed, for two reasons. Four backstop truths (tile legibility, canvas sizing, history race, total order independence) cannot be proven by presence checks. Two test-tier prohibitions have no dedicated enforcement test. One non-blocking warning is worth a follow-up: WR-02, where a non-JSON error response leaves stale text in trade-result.

---

_Verified: 2026-09-26T08:40:00Z_
_Verifier: Claude (gsd-verifier)_
