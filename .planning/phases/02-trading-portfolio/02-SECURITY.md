---
phase: "02"
slug: "trading-portfolio"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-09-27"
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| browser to API | Untrusted trade input enters POST /api/portfolio/trade | ticker, quantity, side (low) |
| API response to DOM | Backend `detail`, tickers and values rendered in trade-result, heatmap and charts | echoed user text (low) |
| backend API/SSE to browser store | Cash, positions and prices feed the header total | numbers (low) |
| npm registry to build | Third-party packages enter the Node build stage | code (high) |
| build output to image | Static bundle copied into the image | could carry secrets (medium) |
| gate to host Docker | Verification gates run on the developer's Docker engine | user container and volume (medium) |
| repo to gate | Binding E2E and unit tests define "done" | test files (medium) |
| verification to host | Local gates start uvicorn and a browser | local DB files (low) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-02-01 | Tampering | trade-result rendering of backend detail | medium | mitigate | No `dangerouslySetInnerHTML`/`innerHTML` in frontend/app, components, store (grep: none) | closed |
| T-02-02 | Tampering | POST /api/portfolio/trade body | low | mitigate | frontend/store/terminal.ts:72 sends only `{ticker, quantity, side}`; backend TradeRequest (backend/app/api.py:15) has no price/cash | closed |
| T-02-03 | Denial of service | duplicate submits (D-04) | low | accept | See accepted risks | closed |
| T-02-04 | Spoofing | cross-site request to trade endpoint | low | accept | See accepted risks | closed |
| T-02-05 | Information disclosure | verification against real user data | low | mitigate | Local runs used $TMPDIR DB and port 8010 (02-01/02-04/02-07 SUMMARY) | closed |
| T-02-SC | Tampering | lightweight-charts 5.2.1, d3-hierarchy 3.1.2, @types/d3-hierarchy 3.1.7 | high | mitigate | Human legitimacy gate approved (02-02 SUMMARY Task 1); exact pins in frontend/package.json; no install scripts on these packages | closed |
| T-02-06 | Tampering | heatmap tile text/titles | low | mitigate | JSX text/attributes only (raw-HTML grep: none); chart on canvas | closed |
| T-02-07 | Denial of service | 30 s history poll, snapshot growth | low | accept | See accepted risks | closed |
| T-02-08 | Information disclosure | Lightweight Charts attribution logo | low | accept | See accepted risks | closed |
| T-02-09 | Information disclosure | /app/backend/static in image | medium | mitigate | Integrity gate: no OPENROUTER / sk-or- in bundle (02-03 SUMMARY `gate-ok`) | closed |
| T-02-10 | Tampering | user `finally` container / `finally-data` volume | medium | mitigate | Throwaway containers only; volume listed before/after (02-03 SUMMARY) | closed |
| T-02-11 | Repudiation | binding E2E files | medium | mitigate | `git diff --numstat d92088b`: only `12 0 test/e2e/03-trading.spec.ts` | closed |
| T-02-12 | Tampering | test/e2e and Playwright config | medium | mitigate | Only added lines in 03-trading.spec.ts (numstat 12/0) | closed |
| T-02-13 | Tampering | trade-result text rendering | low | accept | See accepted risks (still plain JSX text) | closed |
| T-02-SC2 | Tampering | vitest 5.0.2, vite 8.x, @types/node ^24 | high | mitigate | Human gate approved (02-05 SUMMARY; confirmed in 02-UAT test 2); vitest pinned; only new install-script entry is optional fsevents (unrs-resolver predates Phase 2, c65fba5) | closed |
| T-02-14 | Elevation of privilege | dev deps in image | low | accept | See accepted risks (Dockerfile:29 copies only /frontend/out) | closed |
| T-02-15 | Information disclosure | /app/backend/static in rebuilt image | medium | mitigate | Integrity gate `gate-ok` (02-06, 02-07 SUMMARY) | closed |
| T-02-16 | Tampering | user `finally` container / `finally-data` volume | medium | mitigate | Volume listed before/after, untouched (02-06, 02-07 SUMMARY); port 8000 never bound | closed |
| T-02-17 | Repudiation | binding E2E files | medium | mitigate | numstat vs d92088b is 12 added lines in 03-trading.spec.ts only | closed |
| T-02-18 | Tampering | selectTotalValue header total | low | mitigate | Whole-cents sum at frontend/store/portfolio.ts:19; test pins 11899.14 with `toBe` (frontend/store/portfolio.test.ts:88) | closed |
| T-02-19 | Repudiation | frontend/store/portfolio.test.ts | medium | mitigate | RED re-proof printed `red-proven` (02-07 SUMMARY); no `toBeCloseTo` in the test | closed |
| T-02-SC3 | Tampering | npm dependency tree (02-07) | low | mitigate | `git diff 5bbfc88 -- frontend/package*.json` empty | closed |
| T-02-20 | Denial of service | integer cents overflow | low | accept | See accepted risks | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-02-01 | T-02-03 | Each POST is its own BEGIN IMMEDIATE transaction; simulated money; user decision D-04 | plan 02-01 | 2026-09-27 |
| AR-02-02 | T-02-04 | Single local user, no auth or cookies; same-origin JSON POST (PLAN.md single-user design) | plan 02-01 | 2026-09-27 |
| AR-02-03 | T-02-07 | ~2,880 snapshots/day is fine for the canvas chart; single local user | plan 02-02 | 2026-09-27 |
| AR-02-04 | T-02-08 | Attribution is a static link; no network calls from the page | plan 02-02 | 2026-09-27 |
| AR-02-05 | T-02-13 | Text stays a plain JSX child; only the color class changed | plan 02-04 | 2026-09-27 |
| AR-02-06 | T-02-14 | Dev deps live only in the Node build stage; the image gets only frontend/out | plan 02-05 | 2026-09-27 |
| AR-02-07 | T-02-20 | Cents are exact below 2^53 (~9e13 dollars); portfolio is $10k scale | plan 02-07 | 2026-09-27 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-27 | 23 | 23 | 0 | /gsd-secure-phase (orchestrator, ASVS L1 grep-depth short-circuit) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-27
