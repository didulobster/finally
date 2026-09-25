# Walking Skeleton — FinAlly (AI Trading Workstation)

**Phase:** 1
**Generated:** 2026-09-25

## Capability Proven End-to-End

One `docker run` serves a dark trading terminal on `:8000` where the 10 default tickers stream live prices over SSE, the header shows $10,000 cash and total value from SQLite, and a connection dot goes green, drops, and recovers without a reload.

The skeleton is built by plan `01-02` (tracer: scaffold, static export, Docker, then the live store and testids). Plan `01-03` lays out the full terminal grid and runs the Docker E2E gate. Plan `01-01` verifies the existing backend first, per D-15.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Frontend framework | Next.js 16.3.6 App Router, single route `app/page.tsx`, `output: "export"`; React 19.2; TypeScript 5.9 (D-11) | Static export gives one origin and one port, served by FastAPI. TS pinned to 5.9 because Next tooling has not confirmed TS 7. |
| Scaffold | `create-next-app@16.3.6` with `--ts --tailwind --app --use-npm --import-alias "@/*" --disable-git --yes`; `package-lock.json` committed | The Dockerfile runs `npm ci`; the scaffold lockfile includes the linux native binaries that `node:24-slim` needs. |
| Styling | Tailwind CSS 4, CSS-first `@theme` tokens in `app/globals.css` (no `tailwind.config.js`); system mono font stack, no Google-hosted fonts | PLAN.md colors as tokens. Google-hosted fonts fail the offline build. |
| Client state | One Zustand store `useTerminal` in `frontend/store/terminal.ts`; components use per-ticker selectors (D-09) | Each tick re-renders only the changed row. Every later phase reads and writes through this store. |
| Realtime | Exactly one native `EventSource("/api/stream/prices")` opened by `connect()` from the root `useEffect`; status from `onopen`/`onerror` + `readyState`; native retry via server `retry: 1000` (D-10) | No custom reconnect code. Proven against the `06-sse-reconnect` TCP proxy. |
| API access | Relative `/api/...` paths only, no absolute origin, no env vars in the frontend (D-12, FND-02) | Same origin behind any host or port, including the E2E proxy. |
| Initial data | Rows and prices seeded from `GET /api/watchlist` (D-08); cash and total value from `GET /api/portfolio`; SSE ticks win over the seed | No blank prices on load. Rows come from the REST list, never from SSE keys. |
| Backend | Existing FastAPI app in `backend/` (uv, Python 3.12), unchanged unless a breaking gap is found (D-14) | The backend already implements PLAN.md; pytest 75/75. |
| Data layer | SQLite at `/app/db/finally.db`, lazy init and seed on startup, Docker volume on `/app/db` | Zero config; data survives container recreation. |
| Auth | None. Single user `"default"` | Out of scope by design (PLAN.md, REQUIREMENTS Out of Scope). |
| Deployment target | Single container on port 8000 (`Dockerfile` stages `frontend` → `backend` → `app`); FastAPI `SPAStaticFiles` serves `frontend/out` copied to `backend/static` | One command, one port, no CORS. |
| Directory layout | `frontend/app/` (layout, page, globals.css), `frontend/components/` (Header, Watchlist, Panel, ChatDrawer), `frontend/store/` (terminal store, format helpers). Never `frontend/lib/` | Root `.gitignore` ignores `lib/`; files there would silently never be committed. |
| Terminal layout | D-01 grid: header; watchlist left, chart over trade bar center, chat drawer right; bottom strip heatmap, P&L, positions across the full width. Fills 100vh at md and up, stacks below md (D-04) | Later phases fill their panels without layout shifts (D-02). |
| E2E contract | `test/e2e/*.spec.ts` testids are binding: `connection-status` (+`data-status`), `cash-balance`, `total-value`, `watchlist-row-{T}`, `watchlist-price-{T}` in Phase 1 | Each phase adds its testids with the behavior, never early. |

## Stack Touched in Phase 1

- [x] Project scaffold: Next.js + TS + Tailwind + ESLint via `create-next-app`, `npm run build` to `out/`; test runners are the existing pytest suite and Playwright E2E (frontend unit tests deferred per REQUIREMENTS.md TEST-01)
- [x] Routing: one real route `/` (`app/page.tsx`), with the SPA fallback in `SPAStaticFiles`
- [x] Database: real reads (cash from `users_profile` via `/api/portfolio`, rows from `watchlist` via `/api/watchlist`) and real writes (startup seed and startup portfolio snapshot), persisted on the `/app/db` volume and checked by recreating the container
- [~] UI wired to the API: the page consumes the API live (REST seed plus SSE stream), and the chat drawer toggle is interactive. The first user-initiated write from the UI is the Phase 2 trade bar (ROADMAP Phase 2)
- [x] Deployment: Docker image on `:8000`, plus a documented local full-stack run (uvicorn serving `frontend/out` with a fresh `DB_PATH`)

## Out of Scope (Deferred to Later Slices)

- Trade bar, positions table, heatmap, P&L chart, live total-value recompute (Phase 2: TRAD-01/02, PORT-01..04, HDR-02)
- Watchlist add/remove, row selection, main price chart (Phase 3: WTCH-02..05, CHRT-01/02)
- AI chat panel behavior and history (Phase 4: CHAT-01..04), full 6-spec Docker suite (DLVR-02)
- Price flash animations, sparklines, frontend unit tests (deferred in REQUIREMENTS.md: PLSH-01, PLSH-02, TEST-01)
- Backend hardening from `.planning/codebase/CONCERNS.md` (D-14)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- Phase 2: the user trades from the trade bar and sees cash, positions, heatmap, P&L chart, and live total value update
- Phase 3: the user adds and removes watchlist tickers that persist, and clicks a ticker to see its live price chart
- Phase 4: the user chats with the AI, which trades and edits the watchlist inline; all 6 E2E specs pass in Docker
