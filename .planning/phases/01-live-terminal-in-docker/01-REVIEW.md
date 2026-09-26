---
phase: 01-live-terminal-in-docker
reviewed: 2026-09-26T02:26:03Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - .gitignore
  - frontend/store/terminal.ts
  - test/README.md
  - test/sse-502-probe.mjs
findings:
  critical: 0
  warning: 1
  info: 7
  total: 8
status: issues_found
---

# Phase 1: Code Review Report (incremental, gap closure 01-04..01-06)

**Reviewed:** 2026-09-26T02:26:03Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

This is an incremental review of the Phase 1 gap-closure changes since `56aa0d1`: the anchored Python ignore rules and the new `/.claude/**/lib/` rule in `.gitignore`, the CLOSED-stream reopen in `frontend/store/terminal.ts`, the new `test/sse-502-probe.mjs`, and the probe section in `test/README.md`. I checked the store against the SSE endpoint (`backend/app/market/stream.py` sends `retry: 1000` and `text/event-stream`), the Header test ids and labels, and the backend `DB_PATH`/`STATIC_DIR` env vars that the README uses.

### Prior findings resolved

- **WR-01 (a closed EventSource is never reopened): RESOLVED.** `terminal.ts:60-80` now opens a new EventSource `REOPEN_DELAY_MS` (3 s) after an `onerror` that finds `readyState === CLOSED`. The CONNECTING path still only sets `reconnecting` and leaves retrying to the browser, as amended D-10 requires. Each handler closes over its own `current` instance, so a stale instance cannot write state. A new instance is created only after the previous one is CLOSED, and each instance fires the CLOSED `onerror` once, so at most one timer is ever pending and at most one EventSource is live. Cleanup clears the pending timer and closes the latest instance (`es` is reassigned on each open). I found no race.
- **WR-02 (unanchored `lib/` ignores `frontend/lib/`): RESOLVED.** `lib/`, `lib64/`, `parts/`, `var/`, and `downloads/` are now anchored to `/backend/`. `git check-ignore -v frontend/lib/api.ts test/lib/x` reports no match, and `backend/lib/x` still matches `.gitignore:17`. Some other generic Python rules are still unanchored (see IN-01).

### Prior info items

- Still open and in scope: prior IN-04, IN-05, and IN-06 (all in `terminal.ts`) still apply. They are carried forward below as IN-04, IN-05, and IN-06. IN-05 now has more impact because of the reopen path.
- Not re-reviewed: prior IN-01 (`Watchlist.tsx`/`format.ts` color from the unrounded value), IN-02 (`Watchlist.tsx` no-op hover), IN-03 (`package.json` `start`/`dev` scripts), and IN-07 (`@types/node` major version). Those files are outside this review's scope, so their status is unknown, not resolved.

I found no blockers. One warning concerns the new `.gitignore` rule, which commits a GSD toolchain that cannot run from a fresh clone. The rest are Info items.

## Warnings

### WR-01: `/.claude/**/lib/` leaves the committed GSD tooling unable to run from a fresh clone

**File:** `.gitignore:215-216`
**Issue:** The new rule ignores every `lib/` under `.claude/`, but the entry points that `require` those modules are tracked. `git ls-files .claude` has 548 tracked files, including `.claude/gsd-core/bin/gsd-tools.cjs` and `.claude/hooks/*.js`, and none under any `lib/`. `gsd-tools.cjs:273-276` does `require('./lib/cli-exit.cjs')`, `require('./lib/io.cjs')`, and `require('./lib/project-root.cjs')`, and `.claude/hooks/gsd-context-monitor.js:28` does `require('./lib/hook-exit.js')`. In a fresh clone, every one of these fails with `MODULE_NOT_FOUND`. `.claude/CLAUDE.md` requires all edits to go through GSD commands, so the committed workflow is broken for anyone who clones the repo, such as a course student or a CI agent. The comment says this is intentional ("kept out of commits"), but keeping half of an installed tool in git and dropping the other half is inconsistent either way. The rule also has the same silent-ignore problem as prior WR-02: a future project skill under `.claude/skills/<name>/lib/` would be silently dropped (`git check-ignore` already reports `.claude/skills/cerebras/lib/x` as ignored).
**Fix:** Pick one of these:
```gitignore
# Option A: the GSD install is local-only, so ignore all of it, not only its lib/ dirs
/.claude/gsd-core/
/.claude/hooks/
/.claude/scripts/
```
or delete the `/.claude/**/lib/` rule and commit the `lib/` directories, so the tracked tooling is complete.

## Info

### IN-01: Other generic Python rules are still unanchored and ignore same-named dirs anywhere

**File:** `.gitignore:11-13,16,20,22,52,65,76,141-143`
**Issue:** `build/`, `dist/`, `eggs/`, `sdist/`, `wheels/`, `cover/`, `instance/`, `target/`, `env/`, and `ENV/` still match at any depth. I checked with `git check-ignore -v`: `frontend/dist/x` matches `.gitignore:13:dist/`, and `test/env/x` matches `.gitignore:143:ENV/` (on macOS, `core.ignorecase` makes `ENV/` also match `env/`). These are the same class of problem as prior WR-02, but the names are less likely to be used for frontend source.
**Fix:** Anchor them to `/backend/` the same way `lib/` was, e.g. `/backend/build/`, `/backend/dist/`, `/backend/env/`.

### IN-02: The probe throws away the failure reason and can stall 30 s on failure

**File:** `test/sse-502-probe.mjs:84,112-115`
**Issue:** `catch {` discards the error, so a Playwright timeout, `net::ERR_EMPTY_RESPONSE` (app not running), and the `"single"` assertion all print the same kind of `FAIL stage=...` line. In the catch block, `page.getAttribute(STATUS, ...)` uses Playwright's default 30 s action timeout. `tsla()` (`page.textContent`) inside `until` does the same, so a single call can outlast the probe's own 15 s `TIMEOUT`. The ticker is hard-coded to `TSLA`. If the probe runs against a DB where TSLA was removed, it fails at `connect` after a long wait with no hint why.
**Fix:** Use `catch (e)` and include `e.message` in the FAIL line. Pass `{ timeout: 1_000 }` to `getAttribute`/`textContent`.

### IN-03: The single-stream check is sampled every 100 ms

**File:** `test/sse-502-probe.mjs:77-80`
**Issue:** `__maxLive` is measured by a 100 ms `setInterval`, so an overlap between two live EventSources that lasts less than one sample is not seen. The current store cannot produce such an overlap, but the check is weaker than the invariant it claims to prove.
**Fix:** Measure when each stream is created, which is when any overlap starts:
```js
constructor(...args) {
  super(...args);
  window.__es.push(this);
  window.__maxLive = Math.max(window.__maxLive, window.__es.filter((es) => es.readyState !== 2).length);
}
```

### IN-04: Status labels do not match the connection state (carried forward, prior IN-04)

**File:** `frontend/store/terminal.ts:32,68-69`
**Issue:** The initial `status: "reconnecting"` shows "RECONNECTING" before any connection has been made. With the new reopen path, the status also stays "disconnected" (OFFLINE) while the reopened EventSource is actively connecting, until `onopen` or the next `onerror`.
**Fix:** Accept the wording, or relabel in `Header.tsx` `STATUS_STYLE` (e.g. "CONNECTING").

### IN-05: REST seed is not refreshed when the stream reopens (carried forward, prior IN-05)

**File:** `frontend/store/terminal.ts:47-58,65`
**Issue:** `watchlist`, `cash`, and `totalValue` are fetched once in `connect()`. The new reopen path runs exactly when the backend has restarted or redeployed, yet nothing is resynced when the stream comes back. If `/api/watchlist` failed on first load (the fetch has no retry), the grid stays empty even after the stream shows LIVE, and cash/total value stay stale after a restart with a new DB.
**Fix:** Move the two fetches into a `seed()` helper and call it from `current.onopen`. The existing merge `{ ...seeded, ...s.prices }` already gives live prices priority.

### IN-06: `prices` is only ever merged, never pruned (carried forward, prior IN-06)

**File:** `frontend/store/terminal.ts:74`
**Issue:** `{ ...s.prices, ...JSON.parse(e.data) }` keeps tickers the backend has dropped from its cache. Rows are driven by `watchlist`, so nothing wrong is shown today, but Phase 3 watchlist removal will leave stale entries.
**Fix:** Each SSE payload holds every cached ticker, so replace the map instead: `prices: JSON.parse(e.data)`.

### IN-07: The CLOSED-path recovery is only guarded by a manual script

**File:** `test/sse-502-probe.mjs:1-9`, `test/README.md:38-42`
**Issue:** By plan design (01-05), the probe is outside `test/e2e` and is not run by `docker-compose.test.yml`. `06-sse-reconnect` covers only the CONNECTING path. A regression of prior WR-01 (the Phase SC3 "no reload" recovery after a 502) would not fail the E2E suite, and would be caught only if someone remembers to run the probe by hand.
**Fix:** When the E2E suite can be edited again, port the probe's 502 proxy mode into `06-sse-reconnect.spec.ts` (that spec already uses a proxy), so the Docker E2E run covers both paths.

---

_Reviewed: 2026-09-26T02:26:03Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
