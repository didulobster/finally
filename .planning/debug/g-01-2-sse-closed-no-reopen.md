---
status: diagnosed
trigger: "UAT gap G-01-2: The live price stream must recover without a page reload even when a reconnect attempt gets a non-200 response (e.g. 502 from a proxy during redeploy). User: 'fix it now' (code-review WR-01)."
created: 2026-09-26T02:00:00Z
updated: 2026-09-26T02:40:00Z
goal: find_root_cause_only
---

## Current Focus

bug_class: Bohrbug (deterministic: a non-200 on any stream request always sets readyState CLOSED, and the store has no path out of CLOSED)
hypothesis: CONFIRMED. frontend/store/terminal.ts connect() creates exactly one EventSource and relies only on the browser's built-in retry. The browser retries only from CONNECTING (network errors). A non-200 or non-text/event-stream response "fails the connection": readyState goes to CLOSED, one final error fires, and the browser never retries. onerror then maps CLOSED to "disconnected", and no code ever constructs a new EventSource, so the status and prices stay stuck until a reload.
next_action: diagnosis returned to caller (find_root_cause_only). The fix belongs to plan-phase --gaps.

reasoning_checkpoint:
  hypothesis: "After a non-200 reconnect, Chromium sets the single EventSource to CLOSED (2) and stops retrying. connect() has no reopen path (terminal.ts:54-59), so status stays 'disconnected' and prices freeze until reload."
  confirming_evidence:
    - "Isolated Chromium test: 502/503/500/204/200 text/plain on a reconnect gives error rs=0 then error rs=2, then zero further requests over 5 s of a healthy server. A 502 on the first connect gives a single error rs=2. TCP drop, refused, and EOF give error rs=0 and auto-retry, then open."
    - "App repro against the canonical tree (store byte-identical to HEAD): after a 502 the status is still 'disconnected' 15 s after the server is healthy, with 1 EventSource ever created, 0 new stream requests, TSLA frozen, and opacity 0.5."
    - "Falsification run in a throwaway copy: reopening a fresh EventSource 3 s after readyState===CLOSED makes the status 'connected' ~2 s after the server is back, prices move again, maxLive EventSources = 1. 06-sse-reconnect passes on both the baseline and the patched build."
  falsification_test: "If a CLOSED-triggered reopen did not bring the status back, or if the browser kept retrying after a 502, H1 would be wrong. Neither happened."
  fix_rationale: "The defect is the missing transition out of CLOSED in the store. Reopening only on CLOSED restores the one missing recovery path and leaves the working CONNECTING/auto-retry path untouched."
  blind_spots: "Only Chromium was tested (Playwright/E2E target). Firefox/Safari follow the same WHATWG 'fail the connection' rule but were not run. The Turbopack build could not run in this sandbox (PostCSS IPC port), so the repro used `next build --webpack` from the same sources. The bundler does not affect EventSource runtime semantics. The docker compose path was not rerun; 06 ran locally against uvicorn serving the canonical export."
  candidate_causes:
    - "code: store/terminal.ts has no reopen after CLOSED (CONFIRMED, root cause)"
    - "environment/platform: the WHATWG EventSource spec closes permanently on a non-200 or wrong content type (CONFIRMED, by design; the trigger condition, not a defect)"
    - "config/backend: backend/app/market/stream.py returning non-200 (ELIMINATED as a code defect: it always returns 200 text/event-stream; the non-200 comes from a proxy or router in front)"
    - "test: 06-sse-reconnect only cuts TCP, so it can never reach CLOSED (CONFIRMED, why it was not caught)"
  and_gate: "yes. The stuck state needs (a) some stream attempt answered non-200 or with the wrong content type (environmental: proxy/router 502/503 during redeploy, or a FastAPI 500) AND (b) no reopen path in the store. Only (b) is in our code, and removing it breaks the chain."

## Symptoms

expected: After the server becomes reachable again, the header status dot returns to LIVE and prices resume, with no page reload.
actual: Code-review WR-01 (frontend/store/terminal.ts:54-59): after a non-200 reconnect the EventSource closes for good, onerror sets "disconnected", nothing reopens it, and the dot stays OFFLINE until reload. Phase verifier reproduced: after a 502 the status was still 'disconnected' 15 s after the server came back.
errors: None reported
reproduction: UAT Test 2 (.planning/phases/01-live-terminal-in-docker/01-UAT.md)
started: Discovered during code review/UAT

## Eliminated

- hypothesis: The backend SSE endpoint itself returns a non-200 or wrong content type, so the fault is server-side
  evidence: backend/app/market/stream.py always returns StreamingResponse(media_type="text/event-stream") with `retry: 1000`. In the repro the backend was always healthy; the 502 came only from the proxy. A backend that is down produces a TCP error (CONNECTING, auto-retry), never CLOSED.
  timestamp: 2026-09-26T02:25Z

- hypothesis: Chromium keeps retrying after a failed (non-200) reconnect and the store just mislabels the state
  evidence: The server-side request count stays flat after `error rs=2` (isolated: 2 total over 5 s healthy; app: 502 count stays 1 and pass count unchanged over 15 s). The browser truly stops.
  timestamp: 2026-09-26T02:25Z

- hypothesis: The stuck state is also reachable via a plain TCP drop / server kill (the 06 scenario)
  evidence: TCP drop, socket destroyed on accept, connection refused, and clean EOF all keep readyState 0 and auto-reopen (S1, S2, S5; app Phase A; 06 passes on the baseline). Only non-200 or wrong content type reaches CLOSED.
  timestamp: 2026-09-26T02:25Z

## Evidence

- timestamp: 2026-09-26T02:02Z
  checked: Phase 0 knowledge base (.planning/debug/knowledge-base.md)
  found: file does not exist, and MemPalace was not used. No known-pattern candidate.
  implication: proceed with open investigation.

- timestamp: 2026-09-26T02:03Z
  checked: frontend/store/terminal.ts (full), git log for it, frontend/app/page.tsx mount, frontend/components/Header.tsx, backend/app/market/stream.py
  found: terminal.ts is unchanged since d378e90. connect() runs once via `useEffect(connect, [])` in app/page.tsx:14. It creates ONE `const es = new EventSource("/api/stream/prices")` (line 54). onopen sets "connected" (55). onerror maps readyState: CLOSED -> "disconnected", otherwise "reconnecting" (56-57). The cleanup is `es.close()` (59). No code path creates a second EventSource or retries. Header STATUS_STYLE maps disconnected -> red dot "OFFLINE". The backend sends `retry: 1000` first, then `data:` every 0.5 s while the cache changes, with media_type text/event-stream.
  implication: once the browser sets readyState CLOSED, nothing in the app can leave "disconnected". Recovery depends entirely on the browser's own retry, which only happens in the CONNECTING state.

- timestamp: 2026-09-26T02:08Z
  checked: Chromium (Playwright chromium-1243) EventSource semantics, using a minimal Node SSE server (scratchpad/es-semantics.mjs, retry: 500). readyState was logged on every open/error, and the server counted stream requests.
  found: |
    S1 TCP drop, then sockets destroyed on accept for 3 s: error rs=0 every ~500 ms (6 retries), then open rs=1 when healthy. 7 requests. Auto-recovers.
    S5 connection refused (listener closed 4 s): error rs=0 every ~500 ms, then open rs=1 after the listener is back. Auto-recovers.
    S2 a 200 stream that ends cleanly (EOF): error rs=0 -> open rs=1. Auto-recovers.
    S3 reconnect answered with 502 / 503 / 500 / 204 / 200 text/plain: the sequence is `error rs=0` (drop), then `error rs=2` (the failed reconnect). After that there are NO further events and NO further requests (server count = 2 total) through 5 s of a healthy server.
    S4b first connect answered 502: a single `error rs=2`, and 1 request total. Never retries.
  implication: CONFIRMS the browser half of H1. A non-200 or wrong content type on ANY attempt (initial or reconnect) permanently CLOSES the EventSource. Network-level failures (drop, RST, refused, EOF) keep it in CONNECTING and auto-retry. One outage produces two error events (rs=0, then rs=2), so a fix must act only on rs=2 (CLOSED). The old instance is already dead then, so creating a replacement never leaves two live streams.

- timestamp: 2026-09-26T02:20Z
  checked: App-level repro (scratchpad/app-repro.mjs). Canonical tree (app/components/store) copied to $TMPDIR/g012-fe with tsconfig @/* -> ./* and zustand ^5.0.15 restored; store/terminal.ts byte-identical to HEAD (cmp). Built with `next build --webpack`; the Turbopack PostCSS worker cannot bind its IPC port here, which is an environment issue. Served by the real backend (uv run uvicorn, simulator, DB_PATH in $TMPDIR, port 18712) behind a TCP proxy with pass/drop/502 modes. Playwright Chromium wraps window.EventSource to count constructions and log readyState, and polls data-status.
  found: |
    Phase A (control, same as 06-sse-reconnect): TCP drop 3 s -> status reconnecting, es#1 error rs=0 x3 -> restore -> es#1 open rs=1, status connected, TSLA price moving ($249.89 -> $249.93). EventSources created = 1.
    Phase B (bug): proxy answers the stream reconnect with 502 -> es#1 error rs=0, then es#1 error rs=2 -> status disconnected at 12.6 s. Proxy healthy again for 15 s -> status STILL disconnected, 0 new stream requests (502 count stays 1, pass count unchanged), EventSources created still 1, TSLA frozen at $249.93, price opacity 0.5.
    Status trace: connected -> reconnecting -> connected -> reconnecting -> disconnected (terminal).
  implication: CONFIRMS H1 end to end against the canonical tree. It matches the verifier probe ("still disconnected 15 s after server back"). The app's only recovery mechanism is the browser's built-in retry, and the browser has stopped retrying.

- timestamp: 2026-09-26T02:30Z
  checked: test/e2e/06-sse-reconnect.spec.ts run locally (BASE_URL=http://127.0.0.1:18713, --reporter=list, --output in $TMPDIR) against the baseline canonical build
  found: 1 passed (2.1s). The spec's proxy only destroys sockets and refuses new ones (TCP level), so the stream never reaches CLOSED.
  implication: the binding spec is green on the buggy code, so it structurally cannot catch this class. This is why WR-01 survived the Phase 1 gate.

- timestamp: 2026-09-26T02:35Z
  checked: Falsification experiment in a SECOND THROWAWAY copy ($TMPDIR/g012-fe-fix; repo untouched). store/terminal.ts connect() was rewritten to the WR-01 shape: `let es; let timer; open()` creates the EventSource. onerror: if readyState !== CLOSED -> "reconnecting"; else -> "disconnected" + `timer = setTimeout(open, 3000)`. Cleanup: clearTimeout(timer); es.close(). TypeScript passed. The same app repro was run with an 8 s 502 window and live-instance counting (live = instances with readyState !== 2).
  found: |
    Phase A unchanged (es#1 only, recovers).
    Phase B during 8 s of 502: es#1 error rs=2, es#2 error rs=2, es#3 error rs=2 (one replacement every ~3 s, each already CLOSED before the next is created). live=0, maxLive=1.
    Server healthy: es#4 open rs=1, status connected at 21.6 s (~2 s after restore, bounded by the 3 s timer), TSLA moving ($250.00 -> $249.79), opacity 1. maxLive=1 for the whole run.
    06-sse-reconnect against this build: 1 passed (1.9s).
  implication: the missing CLOSED -> reopen transition is sufficient to close the gap, and it never produces two live EventSources. Consistent with H1 as the sole in-code cause.

- timestamp: 2026-09-26T02:38Z
  checked: cleanup
  found: removed $TMPDIR/g012-fe, g012-fe-fix, g012*.db, g012-pw-out, backend log. No uvicorn left on 18712/18713. `git status` shows only the pre-existing .gsd sentinel change and .planning/debug/.
  implication: no repo or environment residue.

## Resolution

root_cause: "frontend/store/terminal.ts connect() (lines 54-59) opens a single EventSource and depends only on the browser's built-in retry. Per the WHATWG spec, confirmed in Chromium, a stream response that is non-200 (502/503/500/204) or not text/event-stream 'fails the connection': readyState becomes CLOSED (2), one final error fires, and the browser never retries. onerror (56-57) then sets status 'disconnected', and no code path ever constructs a new EventSource. So the status dot stays OFFLINE, prices freeze and dim, and only a page reload recovers. Network-level failures (TCP drop, refused, EOF) stay in CONNECTING and auto-retry, which is why 06-sse-reconnect (TCP only) passes and never exercises this path. Trigger (AND-gate): a non-200 from a proxy/router/redeploy in front of the backend; the backend itself always returns 200 text/event-stream."
fix: (not applied; find_root_cause_only)
verification: (n/a; the fix direction was validated only in a throwaway copy: recovers after a 502, maxLive=1, 06 passes)
files_changed: []
