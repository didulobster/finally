# Phase 1: Live Terminal in Docker - Research

**Researched:** 2026-09-25
**Domain:** Next.js 16 static export served by an existing FastAPI backend in one Docker container, with SSE live prices and a Zustand store
**Confidence:** HIGH. The tracer slice was built and run end to end during research: the E2E `01-fresh-start` (health and fresh start) and `06-sse-reconnect` specs passed, and the Docker image built and served the app.

## Summary

The backend already exists and works. Pytest passes 75/75. The live endpoints return the shapes the frontend needs: `/api/health`, `/api/portfolio` (cash 10000.0), `/api/watchlist` (10 tickers with the full price dict), and `/api/stream/prices` (`retry: 1000`, then one JSON event about every 500ms). FastAPI's `SPAStaticFiles` serves a Next.js `out/` directory correctly, including `/_next/static/*` chunks and the SPA fallback, while unknown `/api/*` paths still return 404. The spot-check found no backend gap that breaks PLAN.md or an E2E spec. The D-13 checklist still has to be run and written up.

Research included a throwaway tracer. It used `create-next-app@16.3.6` with `output: "export"`, one Zustand store, one native `EventSource`, and a page carrying the contract testids. Local Playwright 1.63 ran the binding specs against it through uvicorn, and all 3 target tests passed (health, fresh start, SSE reconnect in 1.8s). The same frontend then built inside the real `Dockerfile` using a macOS-generated `package-lock.json`, and the container served `/` and `/api/health`. The D-10 status mapping (`onopen` gives connected, `onerror` gives reconnecting or disconnected by `readyState`) with native auto-retry is proven against the TCP-proxy test.

The risks are not architectural. They are small traps found during the spike:
1. The `create-next-app` layout imports `next/font/google`, which fails the build without network access.
2. `cash-balance` and `total-value` are read once, not retried, right after `connected`. Render them only after data loads.
3. The root `.gitignore` has a Python `lib/` rule that silently ignores `frontend/lib/`.
4. `Intl` formatting must pin `en-US`.
5. In the agent sandbox, `next build` needs local port binding, npm needs a writable cache, and Docker needs the sandbox off.

**Primary recommendation:** Build the tracer first as one plan: scaffold, store, minimal testid page, local E2E, then Docker. Next, lay out the full D-01 terminal grid around the working tracer. Backend verification (D-13) runs as an independent plan in parallel, because it touches disjoint files.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Terminal layout skeleton
- **D-01:** Use a 2-column layout with a bottom strip. The header holds total value, cash, and the connection indicator. Below it: the watchlist on the left, the main chart with the trade bar under it in the center, and the AI chat as a drawer on the right. A bottom strip spans the width with **Heatmap | P&L chart | Positions table**. — **Reversibility:** costly — every later phase slots its panel into this grid.
- **D-02:** Draw the full grid in Phase 1. Regions not built yet (chart, trade bar, heatmap, P&L, positions, chat) are empty panels with a title and a muted placeholder body. Later phases fill them in, so the layout never shifts.
- **D-03:** The chat drawer starts open on page load and can collapse to a thin edge tab. In Phase 1 it is only a placeholder panel with the collapse toggle.
- **D-04:** The app fills the viewport (100vh) with no page scroll. Panels scroll internally (watchlist, positions, chat). Below tablet width, the layout stacks into one scrolling column.

#### Price & status display
- **D-05:** Each watchlist row's change % uses `session_change_percent` from the SSE payload (change since the stream started). It stands in for PLAN.md's "daily change %" and is not the tick-to-tick `change_percent`.
- **D-06:** The connection indicator is a colored dot plus a short small-caps label: green **LIVE**, yellow **RECONNECTING**, red **OFFLINE**. The element carries `data-testid="connection-status"`, and its `data-status` is `connected` / `reconnecting` / `disconnected`, exactly as the E2E contract requires.
- **D-07:** While the status is not `connected`, watchlist prices keep the last known value at reduced opacity. Full opacity returns on reconnect.
- **D-08:** Rows seed their initial prices from `GET /api/watchlist`, which already returns the latest prices, so no blank or dash appears on load. SSE ticks take over from there.

#### Frontend state approach
- **D-09:** Use Zustand for client state: prices per ticker, connection status, cash and portfolio, watchlist, and the selected ticker in later phases. Components subscribe with per-ticker selectors so each tick re-renders only what changed. Keep it to a single small store and avoid extra abstraction layers. — **Reversibility:** costly — every later phase reads and writes through this store.
- **D-10:** Open exactly one `EventSource('/api/stream/prices')` at the app root. Status follows the native EventSource state: `onopen` gives `connected`; `onerror` with `readyState === CONNECTING` gives `reconnecting`; `readyState === CLOSED` gives `disconnected`. Rely on native auto-retry (the server sends `retry: 1000`), with no custom reconnect timers.
- **D-11:** The toolchain is Next.js 16 (App Router, single route `app/page.tsx`, `output: 'export'`), React 19, Tailwind CSS 4 (CSS-first `@tailwindcss/postcss`), TypeScript **5.9**, and npm with `package-lock.json` committed because the Dockerfile runs `npm ci`. Use TypeScript 5.9 rather than 7 because Next's tooling hasn't confirmed TS 7 support.
- **D-12:** All API and SSE calls use relative `/api/...` paths, never an absolute origin. `06-sse-reconnect` runs through a TCP proxy on a random port.

#### Backend verification
- **D-13:** Verification method: walk PLAN.md §5–§9 (env vars, market data, SSE, DB schema and seed, API endpoints, LLM/mock) as a checklist against the code. Then start the server and call every endpoint (curl, plus a short SSE sample). Record pass or gap per item in a short verification note in the phase directory. Add a pytest test only where a real gap gets fixed.
- **D-14:** Fix only what breaks PLAN.md behavior or an E2E spec. Leave the soft items in `.planning/codebase/CONCERNS.md` alone: broad `except Exception` in background loops, the avg-cost fallback when a price is missing, and unbounded chat history. The existing 75 pytest tests must stay green (verified passing on 2026-09-25).
- **D-15:** Work order inside the phase, validating each step before the next: (1) verify and fix the backend; (2) build a frontend scaffold that produces a static export and a Docker image that builds and serves it; (3) add the header, watchlist, SSE store, and connection status; (4) run `01-fresh-start` (health and fresh-start tests) and `06-sse-reconnect` against the container.

### Claude's Discretion
- Number formatting: prices as `$` with 2 decimals and thousands separators, change % signed with 2 decimals, green for positive and red for negative. Output must parse with the `parseNumber` helper in `test/e2e/helpers.ts` (no scientific notation; U+2212 minus is fine).
- Exact panel proportions, spacing, fonts (monospace for numbers), and placeholder copy, within the PLAN.md colors: backgrounds `#0d1117`/`#1a1a2e`, accent `#ecad0a`, blue `#209dd7`, purple `#753991` for submit buttons.
- Internal file and component structure under `frontend/`.

### Deferred Ideas (OUT OF SCOPE)
None. The discussion stayed within phase scope. Price flash, sparklines, and frontend unit tests were already deferred to v2 in REQUIREMENTS.md.

Not in this phase: trading, positions, heatmap, P&L chart (Phase 2); watchlist add/remove, ticker selection, main chart (Phase 3); chat (Phase 4). The `01-fresh-start` ticker-selection test belongs to Phase 3.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BACK-01 | Backend verified against PLAN.md end to end | Live probe this session: health, portfolio, watchlist, SSE, static serving, and `/api/*` 404 all pass (see "Backend Verification Pre-Check"). 75/75 pytest. The D-13 checklist template is below. |
| BACK-02 | Gaps that break PLAN.md or E2E fixed, pytest green | The spot-check found no breaking gap. Candidate items to check are listed. Rule: add a test only for a real fix (D-13/D-14). |
| FND-01 | Next.js + TS static export, Tailwind dark theme | `create-next-app@16.3.6` plus `output: "export"` builds to `out/` (verified). Tailwind v4 `@theme` tokens, pattern below. Remove `next/font/google`. |
| FND-02 | Relative `/api/...` paths only | The tracer used `fetch("/api/...")` and `new EventSource("/api/stream/prices")`, and 06 passed through the proxy. |
| HDR-01 | `cash-balance` in header | Render only once `/api/portfolio` has loaded (the E2E reads it once, with no retry). |
| HDR-03 | `connection-status` with `data-status` 3 states | D-10 mapping verified against the HTML spec and the passing 06 spec. |
| HDR-04 | Recover after drop without reload | Native EventSource retry (server `retry: 1000`). 06 passed in 1.8s. |
| WTCH-01 | Exactly 10 default rows with live prices | Rows come from the `/api/watchlist` list, prices from the store. The `watchlist-row-` prefix must be unique to rows. |
| DLVR-01 | Docker image builds and serves on 8000 with the DB volume | The real `Dockerfile` built with the tracer frontend (macOS lockfile, `npm ci` on linux/arm64). The container served `/` and `/api/health`. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Stack is fixed: FastAPI + uv (Python 3.12), Next.js TypeScript static export, Tailwind, SQLite, SSE. One container on port 8000, same origin, no CORS.
- Simple, incremental, no overengineering, no defensive programming, latest APIs. Validate each increment before moving on.
- Python: `uv run` / `uv add` only, never `pip` or `python3`.
- Short modules and functions, clear names, sparse comments, docstrings preferred. Keep README concise.
- Debugging: find and prove the root cause before fixing. No workarounds.
- Dark theme `#0d1117` / `#1a1a2e`, accent `#ecad0a`, blue `#209dd7`, purple `#753991` (submit buttons). No pure black.
- Charts: canvas-based (not used in Phase 1).
- E2E runs with `LLM_MOCK=true` via `test/docker-compose.test.yml`.
- GSD workflow: edits happen inside `/gsd-execute-phase`.
- Backend conventions: `HTTPException` 400/404, custom exceptions subclass `ValueError`, type hints on every signature, `PriceCache` is the only price source.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Live price generation and cache | API / Backend (`PriceCache`, simulator) | — | Exists. The single source of truth for prices. |
| SSE push of prices | API / Backend (`/api/stream/prices`) | Browser (EventSource) | The server sends a snapshot of all cached tickers whenever the cache version changes. |
| Connection status | Browser | — | Derived only from the native EventSource `readyState` (D-10). |
| Watchlist membership (which rows) | Database (`watchlist` table) via `GET /api/watchlist` | Browser store | Rows come from the REST list, not from SSE keys, because SSE also carries held tickers that are not on the watchlist. |
| Cash / total value | Database + API (`GET /api/portfolio`) | Browser store | Phase 1 shows `total_value` from the API. The Phase 2 HDR-02 live recompute reads the same store. |
| Static UI serving | API / Backend (`SPAStaticFiles` at `/`) | CDN/Static (`out/` baked into image) | Single origin, one port. |
| Persistence | Database (SQLite at `/app/db/finally.db`, volume) | — | Lazy init and seed on startup. |

## Standard Stack

### Core (frontend: new in this phase)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.3.6 | App Router, `output: "export"` | Locked (D-11). Builds with Turbopack by default. [VERIFIED: npm registry + spike build] |
| react / react-dom | 19.2.8 (as pinned by create-next-app 16.3.6; latest is 19.3.0) | UI | Keep the version the scaffold pins, since Next 16.3.6 ships with it. [VERIFIED: spike package.json] |
| typescript | 5.9.3 (scaffold writes `^5`, which resolves to 5.9.3) | Types | Locked to 5.9 (D-11). npm `latest` is 7.0.2, so do not run `npm i typescript@latest`. [VERIFIED: npm registry dist-tags, `npm ls`] |
| tailwindcss + @tailwindcss/postcss | 4.3.3 | Styling, CSS-first `@theme` | Locked (D-11). The scaffold wires up `postcss.config.mjs`. [VERIFIED: npm registry; CITED: tailwindcss.com/docs/installation/framework-guides/nextjs] |
| zustand | 5.0.15 | Single client store | Locked (D-09). [VERIFIED: npm registry; CITED: Context7 /pmndrs/zustand v5.0.12] |

### Supporting (scaffold defaults, keep)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| eslint + eslint-config-next | ^9 / 16.3.6 | `npm run lint` | The scaffold includes them. `next build` no longer runs lint, so they are harmless. |
| @types/node, @types/react, @types/react-dom | ^20 / ^19 / ^19 | Types | Scaffold defaults. |

### Backend (existing, unchanged)
FastAPI ≥0.141.1, uvicorn[standard] ≥0.53.0, pydantic ≥2.13.5, numpy, litellm, massive, and python-dotenv, per `backend/pyproject.toml`. No new Python packages are needed in Phase 1.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `create-next-app` scaffold, then trim | Hand-writing package.json and configs | The scaffold produces a verified lockfile with all linux native binaries (`@next/swc-linux-*`, `@tailwindcss/oxide-linux-*`, `lightningcss-linux-*`). Hand-written setups risk missing them. Use the scaffold. |
| Local dev via `next dev` + proxy | Build `out/`, then serve it with uvicorn `STATIC_DIR=frontend/out` | `rewrites` are unsupported with `output: export`. Serving the real export through FastAPI matches production and needs no proxy config. Use it for E2E runs. |

**Installation:**
```bash
# from repo root (see Environment notes: sandbox needs a writable npm cache + registry access)
npx create-next-app@16.3.6 frontend --ts --tailwind --app --use-npm --import-alias "@/*" --disable-git --yes
cd frontend && npm install zustand@^5
```

## Package Legitimacy Audit

The `gsd-tools package-legitimacy check` seam returned `null` for every signal (its lookup failed in this environment). That is **no observation**, not a SUS finding. The signals below were collected by hand with `npm view` (registry.npmjs.org) and `api.npmjs.org` last-week downloads. Every package also appears in official docs (Next.js, Tailwind, and Zustand via Context7). No `postinstall` scripts were found (`npm view <pkg> scripts.postinstall` was empty for next, react, typescript, tailwindcss, @tailwindcss/postcss, and zustand).

| Package | Registry | Age | Downloads/wk | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| next | npm | since 2011 | 42.7M | github.com/vercel/next.js | OK (manual) | Approved |
| react / react-dom | npm | since 2011 / 2014 | 132.7M / 125.3M | github.com/react/react | OK (manual) | Approved |
| typescript | npm | since 2012 | 209.2M | github.com/microsoft/TypeScript | OK (manual) | Approved (pin 5.9) |
| tailwindcss | npm | since 2017 | 95.6M | github.com/tailwindlabs/tailwindcss | OK (manual) | Approved |
| @tailwindcss/postcss | npm | since 2024 | 27.0M | github.com/tailwindlabs/tailwindcss | OK (manual) | Approved |
| postcss | npm | since 2013 | 229.7M | github.com/postcss/postcss | OK (manual) | Approved |
| zustand | npm | since 2019 | 39.8M | github.com/pmndrs/zustand | OK (manual) | Approved |
| @types/react, @types/react-dom, @types/node | npm | since 2016 | 102M–320M | DefinitelyTyped | OK (manual) | Approved |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none. The seam's SUS output came from a failed lookup, not from signals, and the manual signals above are clean.

## Architecture Patterns

### System Architecture Diagram

```
                         Docker container :8000 (uvicorn)
 ┌───────────────────────────────────────────────────────────────────────────┐
 │ lifespan: init_db() ─► SQLite /app/db/finally.db (seed 10 tickers, $10k)  │
 │           source.start(tracked) ─► Simulator (0.5s GBM) ─► PriceCache     │
 │                                                             │ version++   │
 │  GET /api/stream/prices ◄── poll cache.version every 0.5s ──┘             │
 │     "retry: 1000" then data: {TICKER: {...price dict...}}                 │
 │  GET /api/watchlist ─► [ {ticker, price, ..., session_change_percent} ]   │
 │  GET /api/portfolio ─► {cash_balance, total_value, positions, ...}        │
 │  GET /api/health    ─► {"status":"ok"}                                    │
 │  /*  SPAStaticFiles(STATIC_DIR=/app/backend/static = Next out/)           │
 └───────────────────────────────────────────────────────────────────────────┘
           ▲ same origin, relative /api/... (may be via TCP proxy in 06)
           │
 Browser: index.html ─► page.tsx ("use client") ─► useEffect(connect)
    connect():  fetch /api/watchlist ──► store.watchlist + store.prices (seed, D-08)
                fetch /api/portfolio ──► store.cash, store.totalValue
                EventSource /api/stream/prices
                   onopen    ─► status=connected
                   onerror   ─► readyState CLOSED ? disconnected : reconnecting
                   onmessage ─► store.prices merged (per-ticker objects)
    Header  ◄── selectors: status, cash, totalValue
    Row(T)  ◄── selector: s.prices[T]   (only that row re-renders)
```

### Recommended Project Structure
```
frontend/
├── app/
│   ├── layout.tsx        # html/body, globals.css, metadata. NO next/font/google
│   ├── page.tsx          # "use client"; useEffect(connect); renders Terminal grid
│   └── globals.css       # @import "tailwindcss"; @theme color tokens; mono font
├── components/           # Header, ConnectionStatus, Watchlist, WatchlistRow, Panel (placeholder)
├── store/                # terminal.ts: the one Zustand store + connect() + format helpers
│   └── terminal.ts       #   (do NOT name this folder lib/: root .gitignore ignores lib/)
├── next.config.ts        # output: "export"
├── package.json / package-lock.json (committed)
├── AGENTS.md / CLAUDE.md # written by create-next-app; tells agents to read node_modules/next/dist/docs
└── .gitignore            # scaffold's: node_modules, .next, out, next-env.d.ts
```
Delete the scaffold's `public/*.svg` and the demo page content.

### Pattern 1: One store, one EventSource, seeded from REST (verified by spike)
**What:** A module-level Zustand store plus a `connect()` function, called once from `page.tsx`'s `useEffect`. It returns a cleanup that closes the EventSource.
**When to use:** Always. It is the D-09/D-10 contract every later phase builds on.
**Example:** see Code Examples §1. It passed `01` (health, fresh start) and `06` in the spike.

### Pattern 2: Per-ticker selectors
**What:** `useTerminal((s) => s.prices[ticker])` returns the same object reference until that ticker's entry is replaced, so only changed rows re-render. Select primitives or single existing objects. Never build a new object or array inside a selector without `useShallow`.
[CITED: Context7 /pmndrs/zustand v5 migration guide, "selectors returning new references can cause infinite loops"]

### Pattern 3: Render E2E-read values only when loaded
**What:** `{cash !== null && <span data-testid="cash-balance">…</span>}`. Playwright's `locator.textContent()` auto-waits for the element to attach, so conditional rendering turns a racy one-shot read into a wait.

### Pattern 4: Serve the real export for local E2E
```bash
cd frontend && npm run build                                   # -> frontend/out
DB_PATH=$TMPDIR/e2e.db STATIC_DIR=$PWD/frontend/out LLM_MOCK=true MASSIVE_API_KEY= \
  uv run --directory backend uvicorn app.main:app --port 8000
cd test && npx playwright test e2e/01-fresh-start.spec.ts e2e/06-sse-reconnect.spec.ts --grep-invert "clicking a ticker"
```
Use a fresh `DB_PATH`. `db/finally.db` already exists in the repo working tree, and `01` expects a fresh DB.

### Anti-Patterns to Avoid
- **Rows from SSE keys:** SSE sends every tracked ticker, including positions that are not on the watchlist (`actions.tracked_tickers()` = watchlist + held). Build rows from `/api/watchlist`.
- **`data-testid` prefix collisions:** `[data-testid^="watchlist-row-"]` must count exactly 10. Never give a header, container, or placeholder a `watchlist-row-*` testid.
- **Extra text in price cells:** `watchlist-price-{T}` must contain only the formatted price. Put change % in a sibling element, or `parseNumber` will concatenate the digits.
- **Custom reconnect timers / re-creating EventSource:** forbidden by D-10. Chromium retries network errors natively. The spike's 06 run reconnected in about 1s.
- **`next/font/google`:** the build fetches from fonts.googleapis.com and fails offline (proven, see Pitfall 1).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE reconnection | backoff timers, heartbeat watchdog | native `EventSource` + server `retry: 1000` | The spec requires UA reconnection on network errors. Verified by 06. |
| Project scaffold/lockfile | hand-written package.json | `create-next-app@16.3.6` | Its lockfile includes the linux native binaries that `npm ci` in `node:24-slim` needs. |
| Currency/number formatting | string concatenation | `Intl.NumberFormat("en-US", …)` | Thousands separators, negatives, no exponent. |
| Re-render isolation | React Context split per ticker | Zustand selectors | Locked (D-09). |
| Static serving / SPA fallback | new FastAPI routes | existing `SPAStaticFiles` | Verified serving `out/` correctly. |

## Common Pitfalls

### Pitfall 1: `next/font/google` in the scaffolded layout breaks the build
**What goes wrong:** `next build` fails with "Failed to fetch Geist from Google Fonts" when fonts.googleapis.com is unreachable (sandbox, offline, CI proxy). [VERIFIED: spike build output this session]
**How to avoid:** Replace `layout.tsx` with a version that has no font imports. Use Tailwind's default `font-mono` stack (`ui-monospace, SFMono-Regular, Menlo, …`) for numbers. [CITED: tailwindcss.com/docs/theme]
**Warning signs:** `import { Geist } from "next/font/google"` is still present.

### Pitfall 2: Header numbers read before `/api/portfolio` resolves
**What goes wrong:** `01-fresh-start.spec.ts:17-18` does `expect(await readNumber(page.getByTestId("cash-balance"))).toBe(10000)`, a one-shot read right after `openApp` sees `connected`. If the element exists with empty text, `parseNumber("")` returns `0` and the test fails intermittently.
**How to avoid:** Only render the `cash-balance` / `total-value` elements once their value is non-null (Pattern 3).
**Warning signs:** Placeholder text such as "—" or "" inside a testid element that the E2E reads with `readNumber`.

### Pitfall 3: Root `.gitignore` ignores `frontend/lib/`
**What goes wrong:** `git check-ignore -v frontend/lib/store.ts` gives `.gitignore:17:lib/`. The file works locally and in a local `docker build`, because the build context includes ignored files. It is never committed, though, so it disappears in worktree merges (`use_worktrees: true`) and clean clones. [VERIFIED: git check-ignore this session]
**How to avoid:** Don't create `frontend/lib/`. Use `store/`, `components/`, or `utils/`. Alternatively, add `!frontend/lib/` to the root `.gitignore`. Also add `backend/static/` to the root `.gitignore`, since it is currently not ignored.
**Warning signs:** `git status` does not list a new file you just created.

### Pitfall 4: Locale-dependent formatting
**What goes wrong:** `toLocaleString()` without a locale can produce `10.000,00`, which `parseNumber` reads as `10.00000` = 10.
**How to avoid:** Always write `new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })`. For percents: `${v > 0 ? "+" : ""}${v.toFixed(2)}%`.

### Pitfall 5: Agent sandbox blocks the build and test tools
**What goes wrong (all observed this session):**
- `npm view/install` fails with `EPERM … ~/.npm/_cacache` (misreported as "root-owned files"). Fix: `export npm_config_cache=$TMPDIR/npm-cache` plus network access to `registry.npmjs.org`.
- `next build` fails with `TurbopackInternalError … binding to a port … Operation not permitted`, because Turbopack's PostCSS worker binds a local port. It must run with local binding allowed (outside the sandbox or `sandbox.network.allowLocalBinding: true`).
- A failed build caches its error in `.next/`, and re-runs replay it. Run `rm -rf frontend/.next` before retrying.
- `create-next-app` prints `RangeError: Maximum call stack size exceeded … Aborting installation` at the very end inside the sandbox, after it has already written all files and installed packages. Check that `frontend/package-lock.json` exists and continue.
- uvicorn, Playwright, and `docker` (socket permission denied) all need the sandbox off. pytest needs `UV_CACHE_DIR=$TMPDIR/uvcache`.

### Pitfall 6: Running the full compose suite in Phase 1
**What goes wrong:** `test/docker-compose.test.yml`'s default command runs all 6 specs, and specs 02–05 plus 01's third test fail until later phases.
**How to avoid:** Override the command for the phase gate (see Validation Architecture), then run `down -v` so the next run gets a fresh tmpfs DB.

### Pitfall 7: Status stuck `disconnected` after a bad HTTP response
**What goes wrong:** Under the spec, a non-200 or non-`text/event-stream` response *fails* the connection (readyState CLOSED, no retry). Only network errors retry. [CITED: html.spec.whatwg.org/multipage/server-sent-events.html]
**How to avoid:** Nothing in Phase 1 (the E2E proxy drops TCP, which is a network error, so it retries). This is simply why D-10 maps CLOSED to `disconnected`. Do not add recovery timers (D-10).

## Code Examples

### 1. Store + connect (spike-verified: 01 health/fresh-start and 06 passed)
```ts
// frontend/store/terminal.ts
import { create } from "zustand";

export type Status = "connected" | "reconnecting" | "disconnected";
export type Price = {
  ticker: string; price: number; previous_price: number;
  change_percent: number; session_change_percent: number; direction: "up" | "down" | "flat";
};

type TerminalState = {
  status: Status;
  prices: Record<string, Price>;
  watchlist: string[];
  cash: number | null;
  totalValue: number | null;
};

export const useTerminal = create<TerminalState>()(() => ({
  status: "reconnecting",
  prices: {},
  watchlist: [],
  cash: null,
  totalValue: null,
}));

/** Seed from REST, then keep prices and status live from one EventSource. Returns cleanup. */
export function connect(): () => void {
  fetch("/api/watchlist").then((r) => r.json()).then((items: Price[]) =>
    useTerminal.setState((s) => ({
      watchlist: items.map((i) => i.ticker),
      prices: { ...Object.fromEntries(items.map((i) => [i.ticker, i])), ...s.prices },
    })),
  );
  fetch("/api/portfolio").then((r) => r.json()).then((p) =>
    useTerminal.setState({ cash: p.cash_balance, totalValue: p.total_value }),
  );
  const es = new EventSource("/api/stream/prices");
  es.onopen = () => useTerminal.setState({ status: "connected" });
  es.onerror = () =>
    useTerminal.setState({ status: es.readyState === EventSource.CLOSED ? "disconnected" : "reconnecting" });
  es.onmessage = (e) => useTerminal.setState((s) => ({ prices: { ...s.prices, ...JSON.parse(e.data) } }));
  return () => es.close();
}
```
The initial `status: "reconnecting"` (yellow while the first connection opens) is the recommended default and is Claude's discretion. The prerendered HTML carries this initial `data-status`. The seed merge keeps any SSE ticks that arrived first (`...s.prices` wins).

### 2. Page usage (spike-verified)
```tsx
"use client";
import { useEffect } from "react";
import { connect, useTerminal } from "@/store/terminal";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function Row({ ticker }: { ticker: string }) {
  const p = useTerminal((s) => s.prices[ticker]);
  return (
    <div data-testid={`watchlist-row-${ticker}`}>
      {ticker} <span data-testid={`watchlist-price-${ticker}`}>{p ? usd.format(p.price) : "—"}</span>
    </div>
  );
}

export default function Page() {
  useEffect(connect, []);
  const status = useTerminal((s) => s.status);
  const watchlist = useTerminal((s) => s.watchlist);
  const cash = useTerminal((s) => s.cash);
  return (
    <main>
      <div data-testid="connection-status" data-status={status}>{status}</div>
      {cash !== null && <div data-testid="cash-balance">{usd.format(cash)}</div>}
      {watchlist.map((t) => <Row key={t} ticker={t} />)}
    </main>
  );
}
```
(`/api/watchlist` may return `{"ticker": T, "price": null}` when the cache has no price yet, for example Massive before its first poll: `backend/app/api.py:65`. The `p ? … : "—"` check covers that real contract case. With the simulator it never happens.)

### 3. next.config.ts / layout / theme
```ts
// next.config.ts   [CITED: Context7 /vercel/next.js docs/01-app/02-guides/static-exports.mdx]
import type { NextConfig } from "next";
const nextConfig: NextConfig = { output: "export" };
export default nextConfig;
```
```tsx
// app/layout.tsx: no next/font/google
import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "FinAlly" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
```
```css
/* app/globals.css   [CITED: tailwindcss.com/docs/colors, /docs/theme] */
@import "tailwindcss";
@theme {
  --color-bg: #0d1117;
  --color-panel: #1a1a2e;
  --color-accent: #ecad0a;
  --color-primary: #209dd7;
  --color-submit: #753991;
}
body { background: var(--color-bg); color: #e6edf3; }
```
Browser-only APIs (`EventSource`, `fetch` to relative paths) must run inside `useEffect`, because client components are prerendered at build time. [CITED: Context7 /vercel/next.js static-exports.mdx]

## E2E Contract Values (verbatim)

From `test/e2e/helpers.ts:3`: `export const DEFAULT_TICKERS = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "JPM", "V", "NFLX"];` [VERIFIED: read this session]
From `test/e2e/helpers.ts:7`: `return Number((text ?? "").replace(/−/g, "-").replace(/[^0-9.-]/g, ""));`
From `test/e2e/helpers.ts:18`: `await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");`
From `test/e2e/01-fresh-start.spec.ts:13-18`: `` page.getByTestId(`watchlist-row-${ticker}`) ``, `page.locator('[data-testid^="watchlist-row-"]')).toHaveCount(DEFAULT_TICKERS.length)`, `readNumber(page.getByTestId("cash-balance"))).toBe(10000)`, `readNumber(page.getByTestId("total-value"))).toBeCloseTo(10000, 0)`
From `test/e2e/01-fresh-start.spec.ts:22`: `` readNumber(page.getByTestId(`watchlist-price-${t}`)) ``, polled with `{ timeout: 15_000 }` until it changes.
From `test/e2e/06-sse-reconnect.spec.ts:42-55`: `` page.goto(`http://127.0.0.1:${port}/`) ``, `toHaveAttribute("data-status", "connected")`, `not.toHaveAttribute("data-status", "connected")`, reconnect `{ timeout: 20_000 }`, `watchlist-price-TSLA` must change within `15_000`.
From `backend/app/market/models.py:41-52`, SSE/watchlist per-ticker keys: `"ticker"`, `"price"`, `"previous_price"`, `"timestamp"`, `"change"`, `"change_percent"`, `"direction"`, `"open_price"`, `"session_change_percent"`. [VERIFIED: read this session]
From `backend/app/market/stream.py:30`: `yield "retry: 1000\n\n"`
From `backend/app/db/database.py:15`: `DEFAULT_WATCHLIST = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "JPM", "V", "NFLX"]`
From `Dockerfile`: `COPY frontend/package.json frontend/package-lock.json ./`, `RUN npm ci`, `RUN npm run build`, `STATIC_DIR=/app/backend/static`, `DB_PATH=/app/db/finally.db`, `COPY --from=frontend /frontend/out ./static`.

## Backend Verification Pre-Check (live probe, this session)

The server was started with `DB_PATH=<tmp> STATIC_DIR=<spike out> LLM_MOCK=true MASSIVE_API_KEY= uv run uvicorn app.main:app`.

| PLAN.md item | Observed | Result |
|---|---|---|
| §8 `GET /api/health` | `{"status":"ok"}` 200 | PASS |
| §7 seed | `/api/portfolio` → `{"cash_balance":10000.0,"positions":[],"positions_value":0,"total_value":10000.0,"unrealized_pnl":0}` | PASS |
| §7/§8 watchlist | `/api/watchlist` → 10 tickers in seed order, each with the full price dict incl. `session_change_percent` | PASS |
| §6 SSE | `retry: 1000`, then `data:` events about every 0.5s keyed by ticker. Headers `content-type: text/event-stream`, `cache-control: no-cache`, `x-accel-buffering: no` | PASS |
| §3 static | `/` 200 html, `/foo` 200 (SPA fallback), `/_next/static/chunks/*.js` 200 `text/javascript`, `/api/nope` 404 | PASS |
| §12 pytest | 75 passed | PASS |

Still to walk per D-13, from the code: §5 env handling (`factory.py` Massive vs simulator, `LLM_MOCK`), simulator properties, §7 schema vs PLAN.md columns (`schema.sql` matches on read-through), trade, watchlist POST/DELETE, `/api/portfolio/history`, and `POST /api/chat` in mock mode. A read-through of `actions.py`, `portfolio.py`, `watchlist.py`, `chat/*`, and `schema.sql` found nothing that breaks PLAN.md or the Phase 1 specs. Candidate soft items stay out of scope under D-14.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tailwind.config.js` + `content` globs | CSS-first `@theme` in globals.css | Tailwind v4 | No config file |
| `next export` command | `output: "export"` in next.config | Next 13.3+ | `next build` writes `out/` |
| webpack build | Turbopack default for `next build` | Next 16 | Needs local port binding in sandbox (Pitfall 5) |
| `next lint` during build | separate `eslint` script | Next 16 | Build does not lint |
| Zustand v4 selector + `shallow` equality arg | `useShallow` wrapper | Zustand v5 | New-reference selectors loop |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Docker-compose E2E gate command (`docker compose … run --rm playwright sh -c "npm ci && npx playwright test <files> --grep-invert …"`) works with this compose file. The `run` flags were confirmed from `docker compose run --help`, but the full command was not executed against the repo, since the repo has no `frontend/` yet. | Validation Architecture | Low. Fall back to `up` with a temporary command edit, or run Playwright locally against the container on :8000. |
| A2 | Chromium keeps retrying at the `retry` interval without exponential backoff. Only one short drop was observed. | Pitfalls | Low. The test allows 20s. |

## Open Questions (RESOLVED)

1. **Keep `frontend/AGENTS.md` + `frontend/CLAUDE.md` from the scaffold?** (RESOLVED)
   - Known: they tell agents to read `node_modules/next/dist/docs/` for Next 16 APIs, and `next dev` re-adds the block.
   - Recommendation: keep and commit them. They are harmless and help later executors.
   - **RESOLVED: keep.** Adopted in plan 01-02 Task 1 (step 9): both files stay unchanged and are committed; they are listed in 01-02 `files_modified`.
2. **Initial `data-status` before the first `onopen`?** (RESOLVED)
   - Recommendation: `reconnecting` (yellow). The E2E only checks `connected` and not-`connected`.
   - **RESOLVED: `reconnecting`.** Adopted in plan 01-02 (`frontend/store/terminal.ts`): the zustand store's initial `status` is `"reconnecting"`, and threat T-01-08 relies on it.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node / npm | frontend build | ✓ | 24.16.0 / 11.13.0 | — |
| uv | backend, pytest | ✓ | 0.12.5 | — |
| Docker engine + compose | DLVR-01, E2E gate | ✓ (sandbox off) | 29.8.0 server, compose v5.5.1 | — |
| Playwright + Chromium (local, `test/node_modules`) | fast E2E loop | ✓ | 1.63.0, chromium-1243 | Docker playwright image `v1.63.0-noble` is cached |
| registry.npmjs.org | npm install/ci | ✓ (declare in allowed_domains) | — | — |
| fonts.googleapis.com | next/font/google | ✗ in sandbox | — | Don't use next/font/google |

**Missing dependencies with no fallback:** none.
**Sandbox notes:** npm needs `npm_config_cache=$TMPDIR/npm-cache`. `next build`, uvicorn, Playwright, and docker need local binding or the docker socket, so run them outside the sandbox. pytest needs `UV_CACHE_DIR=$TMPDIR/uvcache`.

## Validation Architecture

(`workflow.nyquist_validation` is `false` in `.planning/config.json`. The commands below are kept because they are the phase gate.)

| Property | Value |
|----------|-------|
| Backend | `UV_CACHE_DIR=$TMPDIR/uvcache uv run --directory backend pytest -q` (75 tests, ~2s) |
| Frontend build | `cd frontend && rm -rf .next && npm run build` gives `frontend/out/index.html` |
| Fast E2E | Pattern 4 (uvicorn serving `frontend/out` + local Playwright, `--grep-invert "clicking a ticker"`) |
| Phase gate (Docker) | `docker compose -f test/docker-compose.test.yml build finally && docker compose -f test/docker-compose.test.yml run --rm playwright sh -c "npm ci && npx playwright test e2e/01-fresh-start.spec.ts e2e/06-sse-reconnect.spec.ts --grep-invert 'clicking a ticker'"; docker compose -f test/docker-compose.test.yml down -v` |
| DLVR-01 volume check | `docker build -t finally . && docker run -d --name finally -p 8000:8000 -v finally-data:/app/db finally` → `curl localhost:8000/api/health`. Restart the container and confirm `db/finally.db` persists in the volume |

| Req ID | Behavior | Test Type | Command |
|--------|----------|-----------|---------|
| BACK-01/02 | Backend matches PLAN.md | pytest + curl checklist | pytest command above + verification note |
| FND-01 | Static export builds | build | `npm run build` gives `out/index.html` |
| FND-02 | Relative URLs | grep | `grep -rn "http://\|https://" frontend/app frontend/components frontend/store` returns nothing |
| HDR-01, WTCH-01 | Fresh start | e2e | `01-fresh-start` tests 1–2 |
| HDR-03/04 | Status + reconnect | e2e | `06-sse-reconnect` |
| DLVR-01 | Image builds and serves | docker | Phase gate above |

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication / V3 Session / V4 Access | no | Single-user by design (PLAN.md, Out of Scope) |
| V5 Input Validation | yes (existing) | Pydantic request models, `normalize_ticker` (1–5 letters). Phase 1 adds no new inputs. |
| V6 Cryptography | no | — |
| V14 Configuration | yes | `.env` is excluded by `.dockerignore` and not tracked in git. No secrets or absolute origins in the frontend bundle. |

| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| XSS via rendered data | Tampering | React escapes text. No `dangerouslySetInnerHTML`. |
| Secret leakage into static bundle | Information disclosure | No `NEXT_PUBLIC_*` env vars. The frontend reads nothing from env. |
| SSE JSON injection | Tampering | Same-origin, server-generated data parsed with `JSON.parse` only |

## Sources

### Primary (HIGH)
- Spike this session (`/private/tmp/claude-501/spike/frontend`, disposable): create-next-app 16.3.6 scaffold, static build, uvicorn serving, local Playwright run (3/3 passed), and a Docker build of the real `Dockerfile` with the tracer frontend (success, container served `/` and `/api/health`)
- Repo files read this session: `test/e2e/01-fresh-start.spec.ts`, `06-sse-reconnect.spec.ts`, `helpers.ts`, `test/docker-compose.test.yml`, `test/playwright.config.ts`, `Dockerfile`, `.dockerignore`, `backend/app/{main,api,actions,portfolio,watchlist}.py`, `backend/app/market/{stream,models,cache,simulator,factory,interface}.py`, `backend/app/db/{database.py,schema.sql}`, `backend/app/chat/{service,llm}.py`, `backend/tests/conftest.py`
- Context7 `/vercel/next.js` (static exports, browser APIs in client components), `/pmndrs/zustand/v5.0.12` (v5 migration, useShallow), `/websites/tailwindcss` (Next install, @theme)
- npm registry (`npm view`) and api.npmjs.org: versions, dist-tags, repos, downloads, postinstall

### Secondary (MEDIUM)
- WHATWG HTML spec, Server-sent events: reestablish vs. fail semantics, readyState, optional backoff
- `.planning/research/SUMMARY.md`, `STACK.md`, `PITFALLS.md` (prior project research, consistent with these findings)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Registry-verified, and the spike scaffold built.
- Architecture: HIGH. The tracer passed the binding E2E specs and the Docker build.
- Pitfalls: HIGH. Each one was observed directly this session, except A2.

**Research date:** 2026-09-25
**Valid until:** 2026-10-25 (Next 16.x moves fast. Re-check `create-next-app` pins if scaffolding later.)
