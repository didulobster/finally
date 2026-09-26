---
phase: "01"
slug: "live-terminal-in-docker"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-09-26"
---

# Phase 01 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| HTTP client -> FastAPI routes | Untrusted ticker, quantity, side, message; validated by Pydantic and normalize_ticker | user input (low) |
| browser <-> same-origin API/SSE | JSON from /api/* and the SSE stream rendered in the DOM | prices, portfolio (low) |
| npm registry -> frontend build | Packages pinned by the committed lockfile, installed with npm ci | third-party code |
| repo / build context -> image | Files copied into the image; secrets must stay out | API keys (high) |
| container <-> host volume | SQLite on /app/db backed by finally-data | user portfolio data (medium) |
| gates / probes -> user's Docker host | Checks build, run, and tear down containers and volumes | user container + volume |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-01-01 | Information disclosure | verification notes, probes | medium | mitigate | LLM_MOCK + empty MASSIVE key in probes; no key-shaped values anywhere in .planning (grep) | closed |
| T-01-02 | Tampering | backend/tests | high | mitigate | 01-01-SUMMARY: 75 passed, 0 skipped; `git diff main -- backend/tests` no removed lines | closed |
| T-01-03 | Tampering | db/finally.db | medium | mitigate | Probe DB under $TMPDIR; `git status --porcelain db/` clean | closed |
| T-01-04 | Denial of service | probe server :8000 | low | accept | See AR-01 | closed |
| T-01-05 | Information disclosure | HTTPException detail | low | accept | See AR-02 | closed |
| T-01-SC | Tampering | npm installs | high | mitigate | Lockfile committed (zustand present), Dockerfile:5 `RUN npm ci`; RESEARCH legitimacy audit | closed |
| T-01-06 | Information disclosure | static bundle and image | high | mitigate | No process.env / NEXT_PUBLIC_ in frontend source; .dockerignore:4 excludes .env | closed |
| T-01-07 | Tampering (XSS) | ticker/price rendering | medium | mitigate | No dangerouslySetInnerHTML/innerHTML in frontend/app, components, store | closed |
| T-01-08 | Spoofing | connection status | medium | mitigate | frontend/store/terminal.ts:32 initial "reconnecting"; :65-71 status set only in onopen/onerror | closed |
| T-01-09 | Tampering / data loss | user container, finally-data | high | mitigate | Checks used separate names/ports; finally-data and finally present after phase | closed |
| T-01-10 | Denial of service | EventSource reconnect | low | accept | See AR-03 | closed |
| T-01-11 | Tampering | SSE payload parsing | low | accept | See AR-04 | closed |
| T-01-12 | Tampering / data loss | compose teardown | high | mitigate | 01-03-SUMMARY:112 finally-data present before and after | closed |
| T-01-13 | Information disclosure | frontend/out bundle | high | mitigate | No key names/values in frontend/out or backend/static (grep) | closed |
| T-01-14 | Tampering (XSS) | Panel, ChatDrawer | low | mitigate | Covered by the T-01-07 raw-HTML check | closed |
| T-01-15 | Tampering (test integrity) | test/e2e specs and config | high | mitigate | `git diff --quiet d92088b -- test/e2e ...` exits 0 | closed |
| T-01-16 | Spoofing (misleading UI) | placeholder panels | medium | mitigate | UAT Test 4 pass (human, 2026-09-26): only "arrives in Phase N" notes | closed |
| T-01-17 | Tampering (supply chain) | package-lock.json | medium | mitigate | Lockfile restored; no new packages; npm ci | closed |
| T-01-18 | Tampering (source drop) | root .gitignore | medium | mitigate | .gitignore:17 `/backend/lib/` anchored; frontend/lib not ignored (git check-ignore) | closed |
| T-01-19 | Information disclosure | backend/static | low | mitigate | .gitignore:213 `backend/static/` | closed |
| T-01-20 | Tampering (test integrity) | binding E2E files | high | mitigate | Same diff check as T-01-15, exits 0 | closed |
| T-01-21 | Denial of service | connect() reopen loop | medium | mitigate | terminal.ts:40 REOPEN_DELAY_MS 3000, reopen only on CLOSED (:67-69); probe asserts maxLive = 1 | closed |
| T-01-22 | Tampering (XSS) | onmessage merge | low | accept | See AR-05 | closed |
| T-01-23 | Spoofing (origin) | EventSource URL | low | mitigate | No absolute http(s) URLs in frontend source | closed |
| T-01-24 | Tampering (test integrity) | binding E2E files | high | mitigate | Probe outside test/e2e; diff check exits 0 | closed |
| T-01-25 | Elevation of privilege | probe proxy | low | accept | See AR-06 | closed |
| T-01-26 | Tampering / data loss | user container + volume | high | mitigate | 01-06-SUMMARY:144-145 before/after inspect identical | closed |
| T-01-27 | Tampering (provenance) | finally tag rebuild | medium | mitigate | 01-06-SUMMARY records clean tree + Id/Created before and after | closed |
| T-01-28 | Information disclosure | /app/backend/static | high | mitigate | 01-06 gate grep of shipped bundle; local grep none | closed |
| T-01-29 | Tampering (test integrity) | binding E2E files | high | mitigate | Same diff check as T-01-15, exits 0 | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-01-04 | Probe server is local, short-lived, stopped after the probe | plan 01-01 | 2026-09-26 |
| AR-02 | T-01-05 | Single-user local app; business error text is required verbatim by E2E | plan 01-01 | 2026-09-26 |
| AR-03 | T-01-10 | Native retry at 1000 ms, single user, local | plan 01-02 | 2026-09-26 |
| AR-04 | T-01-11 | Same-origin server JSON parsed with JSON.parse only | plan 01-02 | 2026-09-26 |
| AR-05 | T-01-22 | JSON.parse into state, React text rendering, no raw HTML sink | plan 01-05 | 2026-09-26 |
| AR-06 | T-01-25 | Probe proxy binds 127.0.0.1 ephemeral port only while running | plan 01-05 | 2026-09-26 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-26 | 30 | 30 | 0 | secure-phase (L1 grep, orchestrator) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-26
