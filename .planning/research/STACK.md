# Stack Research

**Domain:** Real-time trading terminal frontend (Next.js static export, served by an existing FastAPI backend)
**Researched:** 2026-09-25
**Confidence:** HIGH

## Context Recap (why this file looks the way it does)

This is a **brownfield, subsequent-milestone** research pass. The backend, Dockerfile, and Playwright E2E contract already exist and are fixed:

- `Dockerfile` stage 1 runs `npm ci` against `frontend/package.json` + `package-lock.json`, then `npm run build`, then copies `frontend/out` into the backend image as static files → the frontend **must** use `npm` (not pnpm/yarn) and **must** produce a `next build` with `output: 'export'` (an `out/` directory).
- `backend/app/main.py` mounts a `SPAStaticFiles` handler that serves `index.html` for any unknown, non-`/api`, extensionless path → the app is effectively a **single-page app with one real route** (`/`); no server-rendered routing needed.
- `test/e2e/*.spec.ts` (already written, Playwright `^1.63.0`) is the frontend contract. Two hard constraints it imposes on library choice, discovered by reading the specs:
  1. **`pnl-chart` and `price-chart` must render an actual `<canvas>` element** — `04-portfolio-viz.spec.ts` does `chart.locator("canvas").first()`. Any SVG-only charting library fails this literally.
  2. **`heatmap-cell-{ticker}` tiles must expose P&L color via `getComputedStyle(el).backgroundColor`** — `04-portfolio-viz.spec.ts` reads `backgroundColor`, a CSS property that only exists on real DOM elements. An SVG `<rect fill="...">` has no `backgroundColor` (it's `rgba(0,0,0,0)` regardless of `fill`), so an SVG-based treemap (e.g. Recharts' `Treemap`) **will fail this test as shipped**. The heatmap must render plain HTML elements (divs) with an inline/class-driven `background-color`.

These two constraints, not aesthetic preference, are the deciding factor between Lightweight Charts vs. Recharts and between a treemap *library* vs. a treemap *layout algorithm*. Both are addressed below.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | **16.3.x** (npm `latest` = 16.3.6 as of this research) | React framework, static export build | Current stable major; `output: 'export'` is a first-class, documented mode (confirmed via official docs). App Router is the current default; since this app has exactly one route and no server runtime after export, App Router adds no complexity over Pages Router here — use it because it's what `create-next-app` and all current docs assume. |
| React | **19.x** (latest 19.3.0) | UI library | Next 16's peer range accepts `^19.0.0` (and 18 for back-compat, but there is no reason to pin old React on a new build). React 19 is required by current `@testing-library/react` 16.x and is what Next 16 ships/tests against. |
| TypeScript | **5.9.x** (latest 5.9.3), **not** 7.0.2 | Type checking, DX | See "TypeScript 7" note below — deliberately choosing the previous major over the absolute-latest release. |
| Tailwind CSS | **4.x** (latest 4.3.3) via `@tailwindcss/postcss` | Styling, dark theme | v4 is CSS-first: no `tailwind.config.js`/`content: []` needed — colors and theme tokens are declared with `@theme` directly in CSS. This is strictly *simpler* to set up than v3 and is the current documented installation path for Next.js. Matches "no overengineering." |
| Lightweight Charts | **5.2.x** (latest 5.2.1) | Main price chart, P&L line/area chart | HTML5-canvas-based (satisfies the E2E `canvas` requirement directly), built by TradingView specifically for financial time-series, tiny (~45KB), no React wrapper dependency needed — wrap it yourself with `useRef`/`useEffect` per the official React tutorial. |
| Zustand | **5.0.x** (latest 5.0.15) | Global store for streaming price state | The SSE stream pushes updates for all watched tickers roughly every 500ms. Only the row(s) whose price actually changed should re-render — not the whole watchlist, not the chat panel. Zustand's `useStore(selector)` re-renders only components whose selected slice changed, with zero provider boilerplate. React Context does not give you this for free (every consumer re-renders on any context value change unless you hand-split contexts) — Zustand is simpler to reach for than doing that split yourself. |
| d3-hierarchy | **3.1.x** (latest 3.1.2) | Treemap **layout math only** for the portfolio heatmap | You need the squarified-treemap rectangle-packing algorithm (`d3.hierarchy` + `d3.treemap().tile(d3.treemapSquarify)`), not a rendering library. Feed it `{ticker, value: weight}` data, get back `{x0,y0,x1,y1}` per node, and render each node as a plain positioned `<div>` with Tailwind classes for color — this is what makes `getComputedStyle(el).backgroundColor` work in the E2E test. Do not reach for a "treemap component" library (see What NOT to Use). |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tailwindcss/postcss` + `postcss` | 4.3.x | Tailwind v4's PostCSS plugin | Required peer for Tailwind v4 with Next.js; installed alongside `tailwindcss`. |
| Native `fetch` | (browser/Node built-in) | All REST calls (`/api/portfolio`, `/api/watchlist`, `/api/chat`, `/api/portfolio/history`) | There are only 4-5 simple REST endpoints and one SSE stream. No caching/retry/dedup library is warranted — see What NOT to Use (TanStack Query / SWR). |
| Native `EventSource` | (browser built-in) | `/api/stream/prices` SSE connection | PLAN.md already specifies this; it has built-in auto-reconnect (with backoff), which is exactly what `06-sse-reconnect.spec.ts` exercises. No SSE client library needed. |
| Hand-rolled inline SVG sparkline (no dependency) | — | Per-row watchlist sparkline | A sparkline here is a bare polyline over accumulated in-memory price points with no axes, no crosshair, no zoom, no tooltip. A single `<svg><polyline points="..."/></svg>` computed from a normalized array is ~20 lines and needs zero renders of a full charting engine per row. Do **not** instantiate 10 Lightweight Charts instances (one per watchlist row) just for sparklines — that's real canvas/animation-frame overhead for a decorative element, and overkill per the "simple" mandate. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Vitest | **5.0.x** (latest 5.0.1) + `@vitejs/plugin-react` | Unit test runner for components (this is the official Next.js-documented path, replacing Jest for new projects) | Config: `vitest.config.mts` with `plugins: [tsconfigPaths(), react()]`, `test.environment: 'jsdom'`. Because this app is effectively all Client Components (static export has no per-request server runtime, so there's nothing gained from Server Components at build time beyond the initial HTML shell), the one real limitation Next.js calls out — "Vitest doesn't support async Server Components yet" — never applies here. |
| React Testing Library | **16.3.x** (`@testing-library/react`) + `@testing-library/dom` | Component rendering/interaction assertions | Peer-compatible with React 19. |
| `@testing-library/jest-dom` | **7.0.x** | Custom matchers (`toBeVisible`, `toHaveTextContent`, etc.) in Vitest | Import its Vitest-compatible entry (`@testing-library/jest-dom/vitest` or a `setupFiles` matcher extension) in the Vitest setup file. |
| jsdom | **30.x** (latest) | DOM environment for Vitest | Declared as a Vitest peer; install explicitly. |
| `vite-tsconfig-paths` | latest | Resolve `tsconfig.json` path aliases (e.g. `@/*`) inside Vitest | Only needed if you set up `@/*` import aliases, which is the Next.js default `create-next-app` convention — include it. |
| ESLint + `eslint-config-next` | ESLint **10.x**, `eslint-config-next` **16.3.x** (pin to your Next.js version) | Linting | `eslint-config-next` is versioned in lockstep with Next.js; current major ESLint (10.x, flat config `eslint.config.mjs`) is what current `create-next-app` scaffolds — don't hand-roll `.eslintrc.json` (legacy format). |
| Playwright (`@playwright/test`) | **1.63.x** — already pinned in `test/package.json`, do not change | E2E (existing, out of scope for this file except for compatibility confirmation) | Confirmed current npm `latest` matches what's already pinned — no action needed. |

## Installation

```bash
# In frontend/ (npm — required to match the existing Dockerfile's `npm ci`)
npm install next@^16.3 react@^19 react-dom@^19

# Styling
npm install tailwindcss@^4 @tailwindcss/postcss postcss

# Charts + treemap layout
npm install lightweight-charts@^5.2
npm install d3-hierarchy@^3

# State
npm install zustand@^5

# Dev dependencies
npm install -D typescript@^5.9 @types/react @types/react-dom @types/node
npm install -D vitest@^5 @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom vite-tsconfig-paths
npm install -D eslint eslint-config-next@^16.3
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| Lightweight Charts | Recharts | PLAN.md itself lists both as acceptable. Recharts is SVG-based (`<svg>`/`<rect>`/`<path>`, not `<canvas>`), so it fails the existing E2E assertion `chart.locator("canvas")` unless the test is changed. Recharts is the better pick only if you don't need canvas rendering and want simpler declarative React composition for many small charts — not the case here since the contract already demands canvas. |
| d3-hierarchy (layout only) + plain divs | Full `d3` package, or a packaged "React treemap" component (e.g. `react-treemap`, `nivo`'s `ResponsiveTreeMap`) | Only if the E2E heatmap-color assertion changes to check SVG `fill` instead of CSS `backgroundColor`. Packaged React treemap components generally render SVG for crisp text/labels and would need the same rework. Pulling in all of `d3` (vs. the single `d3-hierarchy` submodule) adds unused code for no benefit here. |
| Zustand | React Context + `useReducer` | Fine for a much smaller app with infrequent updates. At ~500ms SSE cadence across up to 10+ tickers, Context re-renders every consumer on every tick unless you manually split into one context per ticker — more code than just using Zustand's selector API. |
| Zustand | Redux Toolkit / RTK Query | Only if the app were going to grow multi-slice server-cache complexity (auth, pagination, optimistic multi-entity mutations). This app has one SSE stream and 4-5 REST endpoints; RTK's boilerplate (slices, thunks, store composition) is unjustified overhead here. |
| Native `fetch` | TanStack Query / SWR | Reach for one of these only if you need request deduplication, background refetch-on-focus, or complex cache invalidation across many endpoints. With 4-5 simple, mostly-imperative calls (trade submit, watchlist add/remove, chat send) triggered by explicit user actions, plain `fetch` + a Zustand action or `useState` is less code and equally correct. |
| TypeScript 5.9.x | TypeScript 7.0.2 (npm `latest`) | See dedicated note below — use TS7 once its JS API (targeted for 7.1) lands and the toolchain around it (ESLint type-aware rules, editor tooling, Vitest type-checking) has caught up. |
| npm | pnpm / yarn | Never for this project's `frontend/` — the existing `Dockerfile` runs `npm ci` against `package-lock.json`; switching package managers would require changing the Dockerfile for no functional gain. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| Recharts (or any SVG-only chart lib) for `price-chart`/`pnl-chart` | Existing E2E spec asserts a literal `<canvas>` element inside these containers; SVG output fails that assertion outright | Lightweight Charts (canvas-native) |
| A packaged treemap **component** (Recharts `Treemap`, Nivo, `react-treemap`) for the heatmap | These render SVG `<rect fill>`; the existing E2E spec reads `getComputedStyle(el).backgroundColor`, which SVG `fill` does not populate | `d3-hierarchy`'s layout functions + your own `<div>` rendering with Tailwind/inline `background-color` |
| TypeScript 7.0.2 (bleeding-edge "latest") for this project right now | GA'd July 2026; intentionally ships without the JS/programmatic API (targeted for 7.1), which several tools (type-aware ESLint rules, some editor/test integrations) depend on — a two-month-old major version change to the compiler internals is not where a course capstone project should absorb tooling risk | TypeScript 5.9.x (latest 5.x, fully supported by the entire current toolchain) |
| pnpm or yarn for `frontend/` | Breaks the existing `npm ci` step in `Dockerfile` | npm (already wired in) |
| TanStack Query / SWR / Redux Toolkit | Unneeded abstraction for ~4 REST endpoints plus one SSE stream — adds a learning-curve and boilerplate cost with no corresponding benefit at this scale | native `fetch` + Zustand |
| A full charting-library instance (Lightweight Charts or otherwise) per watchlist row for sparklines | 10 live canvas/animation-frame contexts refreshing at 2Hz for a purely decorative element is real, avoidable overhead | one hand-rolled `<svg><polyline>` sparkline component reused per row |
| Tailwind v3-style `tailwind.config.js` + `content: []` globs | Tailwind v4's CSS-first `@theme` config is the current documented setup and is simpler (no config file, automatic content detection) | `@import "tailwindcss";` + `@theme { --color-*: ... }` in `globals.css` |

## Stack Patterns by Variant

**If you later need multiple pages/routes (e.g. a settings page):**
- Stay on Next.js App Router; add more `app/<route>/page.tsx` files.
- Because `output: 'export'` prerenders everything at build time, any new route must be fully static (no dynamic server data fetching at request time) — all data still comes from client-side calls to the FastAPI backend after hydration, exactly as the current single page does.

**If Lightweight Charts' bundle size or feature set ever becomes a constraint (unlikely at this scope):**
- Recharts remains the documented PLAN.md fallback, but only if the E2E `canvas` assertions in `04-portfolio-viz.spec.ts` are updated too (e.g. to check for an `<svg>` instead) — don't silently diverge from the test contract.

**If TypeScript 7's JS API ships (7.1) and the ecosystem (ESLint type-aware rules, `@testing-library`/Vitest tooling) confirms support:**
- Revisit and upgrade from 5.9.x to 7.x in a dedicated, isolated step — don't couple it to feature work.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| next@16.3.x | react@^19.0.0, react-dom@^19.0.0 | Verified via npm registry peerDependencies for `next@16.3.6`; Next 16 also technically accepts React 18, but there's no reason to pin old React for a new build. |
| next@16.3.x | node >=20.9.0 | Verified via npm registry `engines`; the existing `Dockerfile` frontend stage uses `node:24-slim`, well above the floor. |
| vitest@5.0.x | vite@^6.4.0 \|\| ^7.0.0 \|\| ^8.0.0, jsdom@* | `@vitejs/plugin-react` pulls in a compatible Vite automatically via npm's dependency resolution; no manual Vite pin needed. |
| @testing-library/react@16.3.x | react@^18.0.0 \|\| ^19.0.0 | Confirmed via npm registry peerDependencies. |
| tailwindcss@4.x | @tailwindcss/postcss@ (matching 4.x) | Must be installed as a matched pair; v4 is a from-scratch rewrite of the v3 PostCSS plugin, not a drop-in. |
| lightweight-charts@5.x | — | v5 changed the series-creation API from `chart.addLineSeries()` (v4) to `chart.addSeries(LineSeries, options)` (v5) — if you copy any v4-era tutorial code, update the call site. |

## Sources

- `/vercel/next.js` (Context7) — `output: 'export'` static export configuration, unsupported-features caveats, App Router `force-dynamic` incompatibility with export, official Vitest setup guide (`docs/01-app/02-guides/testing/vitest.mdx`)
- `/websites/tailwindcss` (Context7) — Tailwind v4 `@theme`-based custom color configuration, Next.js install guide (`@tailwindcss/postcss`)
- `/tradingview/lightweight-charts` (Context7) — v5 `addSeries(SeriesType, options)` API, React integration tutorial, canvas-based rendering confirmation
- `registry.npmjs.org` (direct registry queries, HIGH confidence — ground truth for exact current versions and peerDependencies) — `next`, `react`, `react-dom`, `typescript`, `tailwindcss`, `@tailwindcss/postcss`, `lightweight-charts`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `zustand`, `d3-hierarchy`, `eslint`, `eslint-config-next`, `@playwright/test` — dist-tags, peerDependencies, engines, and publish timestamps checked directly, 2026-09-25
- Web search (MEDIUM confidence, cross-checked across multiple independent posts plus a `vercel/next.js` GitHub discussion) — TypeScript 7.0 GA'd 2026-07-08 as a from-scratch Go rewrite; ships without a JS/programmatic API until a planned 7.1, which Next.js's own 16.3 changelog and a Vercel engineer's public statement both cite as the reason Next.js had to change how it invokes `tsc` for TS7 support
- Read directly (repo, HIGH confidence): `Dockerfile`, `test/docker-compose.test.yml`, `test/package.json`, `test/playwright.config.ts`, `test/e2e/*.spec.ts`, `backend/app/main.py`, `.planning/PROJECT.md`, `planning/PLAN.md` — established the npm/Docker/E2E constraints this file's recommendations are built around

---
*Stack research for: real-time trading terminal frontend (Next.js static export + FastAPI backend)*
*Researched: 2026-09-25*
