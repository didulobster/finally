---
status: diagnosed
trigger: "UAT G-02-1: i could not buy any ticker with the trade bar, as the trade bar is not available in UI"
created: 2026-09-26T14:20:00Z
updated: 2026-09-26T14:25:00Z
goal: find_root_cause_only
---

## Current Focus

bug_class: Bohrbug (deterministic per server/viewport)
hypothesis: |
  PRIMARY (environment): two servers share port 8000. The orchestrator's uvicorn (fresh Phase 2 build) binds only IPv4 127.0.0.1:8000,
  while a Docker Desktop container publishes IPv6 *:8000. The user's browser resolves `localhost` to ::1 first and so loads the
  Docker container's frontend. That container was left untouched by the Phase 1/2 gates and most likely still runs a pre-Phase-2
  image whose Trade panel is only the placeholder "The trade bar arrives in Phase 2." (no inputs, no buttons).
  SECONDARY (code, confirmed latent): at md widths ~768-~850 px with the chat drawer open, the fixed `md:h-24` Trade panel
  (66 px body) clips Buy/Sell after the bar wraps; only the inputs stay visible.
candidate_causes:
  - "environment: port 8000 double-bound (Docker IPv6 *:8000 + uvicorn IPv4 127.0.0.1:8000); localhost -> ::1 -> stale container"
  - "code: fixed md:h-24 Trade panel + 624 px of fixed side columns clip the wrapped bar at 768-~850 px"
  - "config/build: stale frontend/out (eliminated)"
and_gate: "no - either cause alone hides trade controls; the primary alone explains 'not available in UI' verbatim"
test: user/orchestrator confirms which server the browser hit (see next_action)
expecting: http://[::1]:8000 shows the "trade bar arrives in Phase 2" placeholder; http://127.0.0.1:8000 shows the trade bar
next_action: "Outside the sandbox: `docker ps --format '{{.Names}} {{.Image}} {{.CreatedAt}} {{.Ports}}'` and `curl -s 'http://[::1]:8000/' | grep -c 'trade bar arrives in Phase 2'` vs `curl -s http://127.0.0.1:8000/ | grep -c trade-ticker`; ask the user which URL and window width they used"

## Symptoms

expected: The trade bar (ticker field, quantity field, Buy, Sell) is visible in the UI, so the user can buy positions (needed for UAT test 1, heatmap legibility at 1600x1000 with 3-6 positions).
actual: "i could not buy any ticker with the trade bar, as the trade bar is not available in UI"
errors: none reported
reproduction: UAT test 1. Frontend built with `npm run build` (static export in frontend/out); backend `uv run uvicorn app.main:app --port 8000` with STATIC_DIR=../frontend/out, fresh temp DB, LLM_MOCK=true. User's own browser window, size unknown.
started: discovered during Phase 02 UAT (2026-09-26). Later in the same session the user reported a green sell line "SOLD 1 FIG @ 54.00" (UAT test 3), so they reached a working trade bar at some point.

## Eliminated

- hypothesis: The TradeBar is conditionally rendered or hidden by a breakpoint class (`hidden md:flex`, etc.).
  evidence: page.tsx renders `<TradeBar />` unconditionally; TradeBar root is `flex h-full flex-wrap`; no hidden/display rules in globals.css; headless render finds all controls in the DOM at every viewport.
  timestamp: 2026-09-26T14:15:00Z

- hypothesis: frontend/out on disk is a stale Phase 1 export.
  evidence: out/index.html contains `trade-ticker` and not the "trade bar arrives in Phase 2" placeholder; out/ mtime 13:42Z is after all Phase 2 frontend commits.
  timestamp: 2026-09-26T14:16:00Z

- hypothesis: The md+ flex layout pushes the Trade panel below the fold / to zero height at the UAT viewport (1600x1000) or any common desktop size.
  evidence: headless measurement shows the Trade panel at y=580, 976x96, all controls hit-testable at 1600x1000; all controls visible down to 1440x250 and 900x700; below md the panel is 192 px tall and visible.
  timestamp: 2026-09-26T14:21:00Z

## Evidence

- timestamp: 2026-09-26T14:15:00Z
  checked: frontend/app/page.tsx, components/Panel.tsx, components/TradeBar.tsx, components/ChatDrawer.tsx, components/Header.tsx, app/globals.css
  found: TradeBar is rendered inside `<Panel title="Trade" className="min-h-48 md:min-h-0 md:h-24 md:shrink-0">` in the middle column under the Chart panel (`md:flex-1`, min-h-0). No `hidden`, `display:none`, breakpoint-only rendering or conditional render wraps it. globals.css only sets theme tokens and body colors.
  implication: The trade bar is always in the DOM; if it is invisible it must be clipped by layout sizing, or the browser is not showing this build at all.

- timestamp: 2026-09-26T14:16:00Z
  checked: frontend/out/index.html (grep) and file mtimes; git log -- frontend
  found: out/index.html contains `trade-ticker` and a `Trade</h2>` panel; it does NOT contain the Phase 1 placeholder "The trade bar arrives in Phase 2.". out/ mtime 2026-09-26 21:42:25 +0800 (13:42Z), after the TradeBar commit 74e353a (14:53 +0800) and after the last frontend commit ec8bca7 (16:07 +0800).
  implication: The static export on disk is current. A stale frontend/out is ruled out as of now (cannot prove what was on disk before 13:42Z).

- timestamp: 2026-09-26T14:17:00Z
  checked: .playwright-mcp/uat-1600.png and page-2026-09-26T02-38-28-093Z.yml (Phase 1 UAT, 10:38 +0800)
  found: The Phase 1 build shows a Trade panel whose body is the placeholder "The trade bar arrives in Phase 2."; FIG was on that (Docker-volume) watchlist.
  implication: Any browser that is served the Phase 1 build sees a Trade panel with no inputs or buttons, which matches "the trade bar is not available in UI" word for word.

- timestamp: 2026-09-26T14:18:00Z
  checked: lsof -nP -iTCP:8000 -sTCP:LISTEN
  found: TWO listeners on port 8000: `com.docker` PID 30981 on IPv6 `*:8000` (Docker Desktop port publish for a container), and `python3.12` PID 79103 on IPv4 `127.0.0.1:8000` (cwd /Users/wilsonsmacmini/Documents/Code/finally/backend, i.e. the orchestrator's uvicorn).
  implication: `http://localhost:8000` is ambiguous on macOS. Browsers resolve localhost to ::1 first (then 127.0.0.1); ::1 is only served by the Docker container's `*:8000` IPv6 wildcard, while 127.0.0.1 goes to the more specific uvicorn bind. The user's browser very likely reached the Docker container, not the freshly built uvicorn app. Which image that container runs (Phase 1 vs Phase 2) could not be checked: curl to both listeners is blocked by the sandbox and the unsandboxed retry was denied.

- timestamp: 2026-09-26T14:19:00Z
  checked: STATE.md decisions for Phase 01-06 and 02-03
  found: "gate touches only throwaway containers; user container compared via docker inspect, not the docker ps Image column" (01-06) and "finally tag rebuilt at HEAD aa8cf44" (02-03). Rebuilding a tag does not change the image of an already running container.
  implication: The user's long-lived `finally` container on port 8000 was deliberately left alone by both gates, so it most likely still runs the image it was created from (Phase 1, whose Trade panel is the "arrives in Phase 2" placeholder). Unverified: needs `docker ps` / `docker inspect` or a browser load of http://[::1]:8000.

- timestamp: 2026-09-26T14:21:00Z
  checked: headless Chromium (Playwright 1.63, chromium_headless_shell-1243) rendering frontend/out via page.route (no server), empty portfolio, 10-ticker watchlist, chat drawer open (default); measured the Trade panel and each control with elementFromPoint at 12 viewports (script: scratchpad/measure.mjs)
  found: |
    1600x1000: panel 296,580 976x96, ticker/qty/buy/sell all VISIBLE, body 66/66 (no overflow)
    1440x900, 1280x720, 1024x768, 1009x700, 1440x400, 1440x250: all four VISIBLE on one row
    900x700: wraps to 2 rows, body 72/66, all four VISIBLE (6 px clipped)
    800x600: middle column 176 px wide, 4 rows, body 136/66, ticker+qty VISIBLE, buy+sell HIDDEN (clipped inside panel body)
    768x600: column 144 px, body 152/66, ticker+qty VISIBLE, buy+sell HIDDEN
    767x800 and 390x844 (below md, stacked): panel 192 px tall, all four VISIBLE, page scrolls
  implication: The layout never hides the whole trade bar. At the UAT viewport (1600x1000) and at every width >= ~900 px it is fully visible. There is a real latent defect at md widths ~768-~850 px (chat open): the fixed `md:h-24` Trade panel (66 px body) clips Buy/Sell, reachable only by scrolling inside the panel (macOS overlay scrollbars hide the cue). Even there, the Ticker and Qty inputs stay visible, which does not match "the trade bar is not available in UI".

## Resolution

root_cause: "UAT environment, not TradeBar code: port 8000 was double-bound (Docker Desktop IPv6 *:8000 and the orchestrator's uvicorn on IPv4 127.0.0.1:8000), so the user's browser at http://localhost:8000 (resolved to ::1) was served by the long-lived Docker container, which most likely still runs a pre-Phase-2 image whose Trade panel is the placeholder 'The trade bar arrives in Phase 2.' (final link not verified from the sandbox). Secondary, confirmed latent layout defect: at md widths ~768-~850 px with the chat drawer open, the fixed md:h-24 Trade panel clips the wrapped Buy/Sell buttons."
fix:
verification:
files_changed: []
