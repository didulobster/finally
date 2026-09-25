---
phase: 01-live-terminal-in-docker
reviewed: 2026-09-25T00:00:00Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - .gitignore
  - frontend/.gitignore
  - frontend/AGENTS.md
  - frontend/CLAUDE.md
  - frontend/README.md
  - frontend/app/globals.css
  - frontend/app/layout.tsx
  - frontend/app/page.tsx
  - frontend/components/ChatDrawer.tsx
  - frontend/components/Header.tsx
  - frontend/components/Panel.tsx
  - frontend/components/Watchlist.tsx
  - frontend/eslint.config.mjs
  - frontend/next.config.ts
  - frontend/package.json
  - frontend/postcss.config.mjs
  - frontend/store/format.ts
  - frontend/store/terminal.ts
  - frontend/tsconfig.json
  - test/README.md
findings:
  critical: 0
  warning: 2
  info: 7
  total: 9
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-09-25T00:00:00Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

I reviewed the Phase 1 frontend walking skeleton: the Next.js static export config, the root layout and terminal grid, the Header/Watchlist/Panel/ChatDrawer components, the Zustand store with its one EventSource, the formatters, and the repo and frontend ignore files. I checked the store against the backend contracts it uses: `PriceUpdate.to_dict()` in `backend/app/market/models.py`, the SSE payload in `backend/app/market/stream.py`, and `GET /api/watchlist` and `GET /api/portfolio` in `backend/app/api.py` and `backend/app/portfolio.py`. The field names and shapes match. The merge order in `connect()` is correct: live SSE prices take priority over the REST seed. `tsc --noEmit` and `eslint` both pass with no errors.

I found no blockers. There are two warnings:
1. The status dot can get stuck on "disconnected" with no way back except a page reload. Phase success criterion 3 requires recovery without a reload.
2. A leftover Python `lib/` ignore rule silently ignores any `frontend/lib/` directory.

The rest are minor Info items.

## Warnings

### WR-01: A closed EventSource is never reopened, so "disconnected" is permanent

**File:** `frontend/store/terminal.ts:54-59`
**Issue:** The browser only retries an EventSource on network errors. It closes the stream for good (`readyState === CLOSED`) if a reconnect gets a non-200 response or a non-`text/event-stream` content type. That can happen with a 502/503 from a reverse proxy or platform router during a restart or redeploy (the App Runner/Render target in PLAN.md §11), or with a 500 from FastAPI. In that case `onerror` sets `status: "disconnected"` and nothing ever reconnects. The red dot stays, prices freeze, and only a page reload recovers. Phase success criterion 3 says the dot "returns to connected with prices resuming, without a page reload". `06-sse-reconnect` does not catch this because it only cuts TCP, which leaves the stream in `CONNECTING` and lets the browser retry on its own. So "disconnected" is only reachable in the one state the app cannot leave.
**Fix:** When the stream is CLOSED, open a new EventSource after a short delay:
```ts
export function connect(): () => void {
  // ...REST seeding unchanged...
  let es: EventSource;
  let timer: ReturnType<typeof setTimeout>;
  const open = () => {
    es = new EventSource("/api/stream/prices");
    es.onopen = () => useTerminal.setState({ status: "connected" });
    es.onmessage = (e) => useTerminal.setState((s) => ({ prices: { ...s.prices, ...JSON.parse(e.data) } }));
    es.onerror = () => {
      if (es.readyState !== EventSource.CLOSED) return useTerminal.setState({ status: "reconnecting" });
      useTerminal.setState({ status: "disconnected" });
      timer = setTimeout(open, 3000);
    };
  };
  open();
  return () => { clearTimeout(timer); es.close(); };
}
```

### WR-02: The root `.gitignore` rule `lib/` silently ignores `frontend/lib/`

**File:** `.gitignore:17` (also `:11-22`: `build/`, `dist/`, `downloads/`, `parts/`, `var/`)
**Issue:** The Python template's unanchored `lib/` (and `lib64/`, `var/`, `parts/`, `downloads/`) matches directories at any depth. `git check-ignore -v frontend/lib/api.ts` reports `.gitignore:17:lib/`. `frontend/lib/` is the conventional Next.js home for API helpers and chart utilities. If a later phase adds `frontend/lib/*.ts`, the files will build locally but never get committed. The Docker build (`COPY frontend/ ./` from a clean checkout or CI) then fails with missing imports, and `git status` shows nothing wrong.
**Fix:** Anchor the Python packaging patterns to the backend, or drop the ones that don't apply:
```gitignore
/backend/lib/
/backend/lib64/
/backend/var/
/backend/parts/
/backend/downloads/
```

## Info

### IN-01: Change color comes from the unrounded value, so "0.00%" can show green or red

**File:** `frontend/components/Watchlist.tsx:22-23` and `frontend/store/format.ts:2-6`
**Issue:** `color` checks `change > 0`, but `formatPercent` rounds to 2 decimals with `signDisplay: "exceptZero"`. I checked this in Node: `0.004` formats as `"0.00"`, so the row shows an unsigned `0.00%` in green (and `-0.004` shows it in red). Shortly after startup, `session_change_percent` sits near zero, so this is visible.
**Fix:** Pick the color from the rounded value, e.g. `const change = Math.round((p?.session_change_percent ?? 0) * 100)`, then compare that to 0.

### IN-02: Row hover background has no effect

**File:** `frontend/components/Watchlist.tsx:27`
**Issue:** `hover:bg-panel` sets the same color the row already has (the enclosing `Panel` `<section>` is `bg-panel`), so hovering does nothing.
**Fix:** Use a different shade, e.g. `hover:bg-white/5`, or remove the class.

### IN-03: `npm start` always throws, and `npm run dev` has no backend

**File:** `frontend/package.json:6-8`
**Issue:** With `output: "export"`, `next start` throws `"next start" does not work with "output: export" configuration` (see `node_modules/next/dist/server/next.js:246`). `next dev` also serves no `/api/*`, and rewrites are not supported with export, so `connect()`'s fetches and the EventSource fail in dev.
**Fix:** Remove the `start` script. Either note in `frontend/README.md` that the app runs against FastAPI via `STATIC_DIR` (as in `test/README.md`), or drop `dev` as well.

### IN-04: First page load shows "RECONNECTING" before the first connection

**File:** `frontend/store/terminal.ts:32`
**Issue:** The initial `status: "reconnecting"` shows a yellow "RECONNECTING" label before any connection has been made or lost. This is harmless but mislabeled.
**Fix:** Keep the enum but change the label to something like "CONNECTING" in `STATUS_STYLE` (`Header.tsx:8`), or accept the wording.

### IN-05: REST seed data is fetched once and never refreshed

**File:** `frontend/store/terminal.ts:41-52`
**Issue:** `watchlist`, `cash` and `totalValue` are loaded once when the component mounts. If the `/api/watchlist` fetch fails, the grid stays empty for good, even after the SSE stream connects and prices arrive: rows come from `watchlist`, and there is no `.catch` and no refetch. After a backend restart, cash and total value also stay stale. `totalValue` never tracks live prices, which Phase 2 HDR-02 needs to address.
**Fix:** Move the two fetches into a `refresh()` helper and call it from `es.onopen`. This also covers resyncing after a reconnect.

### IN-06: The `prices` map is only ever merged, never pruned

**File:** `frontend/store/terminal.ts:58`
**Issue:** `{ ...s.prices, ...payload }` keeps tickers that the backend has dropped from its cache (`PriceCache.remove`). Rows are driven by `watchlist`, so nothing is shown wrong today. Once Phase 3 adds removal, though, the store will keep stale entries, and a ticker that is re-added briefly shows its old price.
**Fix:** The SSE payload already contains every cached ticker, so replace the map instead of merging: `prices: JSON.parse(e.data)`. The REST seed in `connect()` would then merge under it as it does today.

### IN-07: `@types/node` major version does not match the build runtime

**File:** `frontend/package.json:19`
**Issue:** `@types/node` is `^20`, but the Dockerfile builds on `node:24-slim`. This only affects types, but it can hide or misreport Node APIs.
**Fix:** Bump it to `^24` to match the runtime.

---

_Reviewed: 2026-09-25T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
