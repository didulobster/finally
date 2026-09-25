# Phase 1: Live Terminal in Docker - Pattern Map

**Mapped:** 2026-09-25
**Files analyzed:** 19 (15 new frontend files and scaffold outputs, 1 new doc, 1 modified root config, plus conditional backend fix and test files)
**Analogs found:** 13 / 19. The rest have no in-repo analog because `frontend/` does not exist yet. For those, use RESEARCH.md Code Examples, which were verified against the E2E specs.

All analog paths below are git-tracked (checked with `git ls-files`). The research spike at `/private/tmp/claude-501/spike/frontend` is **not** tracked. Do not reference it in plans.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `frontend/package.json` + `frontend/package-lock.json` | config | build | `test/package.json` + `test/package-lock.json` (npm project with a committed lockfile, consumed by `npm ci`) | role-match |
| `frontend/next.config.ts` | config | build | RESEARCH.md Code Examples §3; `test/playwright.config.ts` (typed `defineConfig` TS config style) | partial |
| `frontend/app/layout.tsx` | component (root layout) | n/a | RESEARCH.md Code Examples §3 | no in-repo analog |
| `frontend/app/globals.css` | config (theme) | n/a | RESEARCH.md Code Examples §3; PLAN.md §2 colors | no in-repo analog |
| `frontend/app/page.tsx` | component (root, client) | event-driven (mounts connect) | RESEARCH.md Code Examples §2 | no in-repo analog |
| `frontend/store/terminal.ts` | store | event-driven (SSE) + request-response (REST seed) | Producer side: `backend/app/market/stream.py`, `backend/app/api.py:38-66`, `backend/app/market/models.py:41-52`. Code: RESEARCH.md Code Examples §1 | data-contract match |
| `frontend/store/format.ts` (or format helpers inside `terminal.ts`) | utility | transform | `test/e2e/helpers.ts:5-8` (`parseNumber`, which is the consumer the formatter must satisfy) | contract match |
| `frontend/components/Header.tsx` | component | store-subscribe | `test/e2e/01-fresh-start.spec.ts:17-18` (contract); RESEARCH §2 `cash !== null &&` | contract match |
| `frontend/components/ConnectionStatus.tsx` | component | store-subscribe | `test/e2e/helpers.ts:16-19`, `test/e2e/06-sse-reconnect.spec.ts:43-51` | contract match |
| `frontend/components/Watchlist.tsx` | component | store-subscribe | `test/e2e/01-fresh-start.spec.ts:12-15` | contract match |
| `frontend/components/WatchlistRow.tsx` | component | store-subscribe (per-ticker selector) | RESEARCH §2 `Row`; `test/e2e/01-fresh-start.spec.ts:21-24` | contract match |
| `frontend/components/Panel.tsx` (placeholder panel) | component | n/a | none | no analog |
| `frontend/components/ChatDrawer.tsx` (placeholder with collapse toggle) | component | local UI state | none | no analog |
| `frontend/components/Terminal.tsx` (D-01 grid; may live in `page.tsx`) | component (layout) | n/a | none. CONTEXT.md `<specifics>` ASCII sketch | no analog |
| `frontend/.gitignore`, `frontend/AGENTS.md`, `frontend/CLAUDE.md` | config/docs | n/a | scaffold output from `create-next-app@16.3.6` (keep as written); compare `test/.gitignore` | role-match |
| `.gitignore` (root, MODIFY) | config | n/a | its own last block, lines 207-210 (`# FinAlly runtime database`) | exact |
| `.planning/phases/01-live-terminal-in-docker/01-BACKEND-VERIFICATION.md` (suggested name) | doc | n/a | RESEARCH.md "Backend Verification Pre-Check" table (lines 401-414) | exact |
| `backend/app/*.py` fix (only if a real gap is found, D-14) | route/service | request-response | `backend/app/api.py:44-51` | exact |
| `backend/tests/test_*.py` regression test (only for a real fix) | test | request-response | `backend/tests/test_api.py:1-24`, `backend/tests/conftest.py` | exact |
| `Dockerfile`, `test/docker-compose.test.yml` | config | build | **unchanged**. Verify only. They already expect `frontend/package.json`, `package-lock.json`, and `out/` | n/a |

## Pattern Assignments

### `frontend/package.json` + `frontend/package-lock.json` (config, build)

**Analog:** `test/package.json` (lines 1-12). This is a small npm project whose committed lockfile is consumed by `npm ci` in `test/docker-compose.test.yml:30`.

**The consumer that must succeed:** `Dockerfile` lines 2-7:
```dockerfile
FROM node:24-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build
```
- Generate the files with `npx create-next-app@16.3.6 frontend --ts --tailwind --app --use-npm --import-alias "@/*" --disable-git --yes`, then `npm install zustand@^5`. Do not hand-write them (RESEARCH "Don't Hand-Roll": the scaffold lockfile includes the linux native binaries).
- Keep `typescript` at `^5` (resolves to 5.9.3). Never `typescript@latest` (D-11).
- The `build` script must stay `next build`. The Dockerfile copies `/frontend/out`.
- `.dockerignore` already excludes `frontend/node_modules`, `frontend/.next`, and `frontend/out`. No change is needed.

---

### `frontend/next.config.ts` (config)

**Analog:** RESEARCH.md Code Examples §3. The in-repo TS config style is `test/playwright.config.ts` lines 1-7 (typed import, single default export, JSDoc explaining why):
```ts
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against an already-running FinAlly container (LLM_MOCK=true).
 * Tests share one backend and one portfolio, so they run serially.
 */
export default defineConfig({
```
Target content:
```ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = { output: "export" };
export default nextConfig;
```
Add no `rewrites`, `basePath`, or `assetPrefix`. `SPAStaticFiles` serves `out/` at `/` (`backend/app/main.py:72-73`).

---

### `frontend/app/layout.tsx` + `frontend/app/globals.css` (root layout, theme)

**Analog:** RESEARCH.md Code Examples §3. No in-repo analog.
- **Remove** `next/font/google` (Pitfall 1: the build fails offline). Numbers use Tailwind `font-mono`.
- Theme tokens come from PLAN.md §2 colors via Tailwind v4 `@theme` (no `tailwind.config.js`):
```css
@import "tailwindcss";
@theme {
  --color-bg: #0d1117;
  --color-panel: #1a1a2e;
  --color-accent: #ecad0a;
  --color-primary: #209dd7;
  --color-submit: #753991;
}
```
- D-04: `html, body` fill 100vh with no page scroll. Panels use `overflow-auto`. Below tablet width, the layout stacks into one column.

---

### `frontend/store/terminal.ts` (store, event-driven + request-response)

**Analog (producer contracts):** the backend endpoints this store consumes.

SSE producer, `backend/app/market/stream.py:28-37`. The first frame is `retry:` only, then one JSON object keyed by ticker whenever `cache.version` changes:
```python
yield "retry: 1000\n\n"
last_version = -1
while not await request.is_disconnected():
    if cache.version != last_version:
        last_version = cache.version
        payload = {t: u.to_dict() for t, u in cache.get_all().items()}
        yield f"data: {json.dumps(payload)}\n\n"
    await asyncio.sleep(interval)
```
Per-ticker object shape, `backend/app/market/models.py:41-52`. The frontend `Price` type mirrors these keys:
```python
"ticker", "price", "previous_price", "timestamp", "change",
"change_percent", "direction", "open_price", "session_change_percent"
```
REST seed producers, `backend/app/api.py:38-41` and `59-66`. Watchlist items can be `{"ticker": T, "price": None}` when the cache has no price yet:
```python
@router.get("/watchlist")
async def get_watchlist(request: Request) -> list[dict]:
    cache, _ = market(request)
    items = []
    for ticker in watchlist.get_tickers():
        update = cache.get(ticker)
        items.append(update.to_dict() if update else {"ticker": ticker, "price": None})
    return items
```
`/api/portfolio` shape, `backend/app/portfolio.py:93-99`: `{cash_balance, positions, positions_value, total_value, unrealized_pnl}`.

**Core pattern:** copy RESEARCH.md Code Examples §1 verbatim as the base: one `create<TerminalState>()` store and one exported `connect()` that returns a cleanup `() => es.close()`.
- D-10 status mapping: `onopen` gives `connected`; `onerror` gives `es.readyState === EventSource.CLOSED ? "disconnected" : "reconnecting"`. Add no timers and never re-create the EventSource.
- D-08 seed merge: `prices: { ...seeded, ...s.prices }`. SSE ticks that arrived first win.
- SSE merge: `prices: { ...s.prices, ...JSON.parse(e.data) }`. Each ticker's object is replaced on each tick, so per-ticker selectors re-render only changed rows.
- Rows come from `/api/watchlist` (`watchlist: string[]`), **never** from SSE keys. SSE also carries held tickers (`actions.tracked_tickers()` = watchlist + positions).
- Relative paths only: `"/api/watchlist"`, `"/api/portfolio"`, `"/api/stream/prices"` (D-12, FND-02).
- Name the directory `store/`, **not** `lib/` (`git check-ignore -v frontend/lib/x.ts` gives `.gitignore:17:lib/`).

**Doc style to copy:** `test/e2e/helpers.ts` uses one-line JSDoc per exported function, double quotes, and semicolons:
```ts
/** Open the app and wait until the SSE stream is connected. */
export async function openApp(page: Page): Promise<void> {
```

---

### `frontend/store/format.ts` (utility, transform)

**Analog / contract consumer:** `test/e2e/helpers.ts:5-8`. Every E2E-read number must survive this parser:
```ts
/** Parse a money/number string like "$10,000.00" or "−1.5" (U+2212 minus) into a number. */
export function parseNumber(text: string | null): number {
  return Number((text ?? "").replace(/−/g, "-").replace(/[^0-9.-]/g, ""));
}
```
Pattern:
```ts
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const formatPrice = (v: number) => usd.format(v);
export const formatPercent = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
```
- Always pass `"en-US"` (Pitfall 4). A different locale can render `10.000,00`, which the parser reads as 10.
- Never use scientific notation. Output must never mix two numbers in one testid element.

---

### `frontend/components/Header.tsx` (component, store-subscribe)

**Contract analog:** `test/e2e/01-fresh-start.spec.ts:17-18`. This is a **one-shot** read right after `openApp`, with no retry:
```ts
expect(await readNumber(page.getByTestId("cash-balance"))).toBe(10000);
expect(await readNumber(page.getByTestId("total-value"))).toBeCloseTo(10000, 0);
```
Pattern (RESEARCH §2 plus Pattern 3): render the testid element only once its value has loaded, so Playwright's auto-wait covers the fetch:
```tsx
const cash = useTerminal((s) => s.cash);
{cash !== null && <span data-testid="cash-balance">{formatPrice(cash)}</span>}
```
Use the same pattern for `total-value` with `s.totalValue` (Phase 1 shows the API `total_value`; the HDR-02 live recompute is Phase 2). Put no placeholder text such as "—" inside these testid elements. Hosts `<ConnectionStatus />`.

---

### `frontend/components/ConnectionStatus.tsx` (component, store-subscribe)

**Contract analog:** `test/e2e/helpers.ts:18` and `test/e2e/06-sse-reconnect.spec.ts:43-51`:
```ts
await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
...
proxy.drop();
await expect(status).not.toHaveAttribute("data-status", "connected");
proxy.restore();
await expect(status).toHaveAttribute("data-status", "connected", { timeout: 20_000 });
```
Pattern: one element with `data-testid="connection-status"` and `data-status={status}`, where `status` is `connected | reconnecting | disconnected`. It shows a dot plus a small-caps label: green LIVE, yellow RECONNECTING, red OFFLINE (D-06). Use a single primitive selector: `useTerminal((s) => s.status)`.

---

### `frontend/components/Watchlist.tsx` + `WatchlistRow.tsx` (component, per-ticker selector)

**Contract analog:** `test/e2e/01-fresh-start.spec.ts:12-15, 21-24`:
```ts
await expect(page.getByTestId(`watchlist-row-${ticker}`)).toBeVisible();
await expect(page.locator('[data-testid^="watchlist-row-"]')).toHaveCount(DEFAULT_TICKERS.length);
...
(await Promise.all(DEFAULT_TICKERS.map((t) => readNumber(page.getByTestId(`watchlist-price-${t}`))))).join(",");
```
and `test/e2e/helpers.ts:22-25` (`waitForPrice` waits for `/\d/` inside `watchlist-price-{T}`).

**Core pattern:** RESEARCH.md Code Examples §2 `Row`:
```tsx
function Row({ ticker }: { ticker: string }) {
  const p = useTerminal((s) => s.prices[ticker]);
  return (
    <div data-testid={`watchlist-row-${ticker}`}>
      {ticker} <span data-testid={`watchlist-price-${ticker}`}>{p ? usd.format(p.price) : "—"}</span>
    </div>
  );
}
```
- Guard with `p?.price != null`. `/api/watchlist` can return `price: null` (`backend/app/api.py:65`).
- `watchlist-price-{T}` contains **only** the formatted price. Change % goes in a sibling element (e.g. `watchlist-change-{T}`) and uses `session_change_percent` (D-05), colored green or red by sign.
- The `watchlist-row-` prefix belongs only to the 10 rows. The list container and header must not use it.
- D-07: when `status !== "connected"`, apply reduced opacity to the price cells and keep the last value.
- Selectors return an existing object or primitive. Never build a new object or array in a selector without `useShallow` (Zustand v5 infinite-loop trap).
- Leave room for later testids without adding them now: `watchlist-remove-{T}` and `data-selected` (Phase 3).

---

### `frontend/components/Panel.tsx`, `ChatDrawer.tsx`, terminal grid (layout, no data)

**Analog:** none in the repo. Follow D-01 to D-04 and the CONTEXT.md `<specifics>` sketch:
```
Header: value · cash · ●
Watchlist | Main chart + Trade bar | Chat drawer (open, collapses to edge tab)
Heatmap | P&L chart | Positions table   (bottom strip)
```
- Placeholder panels have a title and a muted body, and **no** future E2E testids. Do not add `main-chart`, `trade-ticker`, `heatmap`, `pnl-chart`, `positions-empty`, `chat-input`, and so on in Phase 1. The phases that implement those panels add them together with the behavior, so later specs cannot false-pass on an empty placeholder.
- The chat drawer collapse toggle uses local `useState` only (D-03). It does not go in the store.

---

### `frontend/app/page.tsx` (root client component)

**Analog:** RESEARCH.md Code Examples §2:
```tsx
"use client";
import { useEffect } from "react";
import { connect, useTerminal } from "@/store/terminal";
...
export default function Page() {
  useEffect(connect, []);
```
- Exactly one `connect()` call, from the root `useEffect` (D-10). Browser APIs run only inside `useEffect`, because the page is prerendered at build time.
- Import alias `@/*` comes from the scaffold (`--import-alias "@/*"`).

---

### Root `.gitignore` (MODIFY)

**Analog:** its own final block, lines 207-210:
```gitignore
# FinAlly runtime database
db/*.db
db/*.db-journal
!db/.gitkeep
```
Append to this block: `backend/static/` (the local copy of the build output; currently not ignored). Optionally add `!frontend/lib/` if a `lib/` directory is ever needed, but the recommendation is to not create `frontend/lib/`. `frontend/.gitignore` from the scaffold already covers `node_modules`, `.next`, `out`, and `next-env.d.ts`.

---

### `.planning/phases/01-live-terminal-in-docker/01-BACKEND-VERIFICATION.md` (doc)

**Analog:** RESEARCH.md "Backend Verification Pre-Check" (lines 401-414). Reuse the same 3-column table:
```markdown
| PLAN.md item | Observed | Result |
|---|---|---|
| §8 `GET /api/health` | `{"status":"ok"}` 200 | PASS |
```
Walk PLAN.md §5 to §9 per D-13: env handling (`backend/app/market/factory.py`, `LLM_MOCK`), simulator, SSE, schema vs `backend/app/db/schema.sql`, seed (`backend/app/db/database.py:15`), every endpoint in `backend/app/api.py`, and chat in mock mode. Record PASS or GAP per row. Record CONCERNS.md soft items as "out of scope (D-14)" and do not fix them.

---

### Backend fix + regression test (CONDITIONAL, only for a real gap)

**Route/error analog:** `backend/app/api.py:44-51`:
```python
@router.post("/portfolio/trade")
async def trade(req: TradeRequest, request: Request) -> dict:
    cache, source = market(request)
    try:
        result = await actions.trade(cache, source, req.ticker, req.side, req.quantity)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"trade": result, "portfolio": portfolio.get_portfolio(cache)}
```
**Test analog:** `backend/tests/test_api.py:1-14`. `TestClient(create_app())` runs the lifespan, and `conftest.py` gives every test a fresh DB with `LLM_MOCK=true`:
```python
@pytest.fixture
def client():
    with TestClient(create_app()) as c:
        yield c

def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}
```
`backend/tests/conftest.py:4-9` is an autouse fixture that sets `DB_PATH` to `tmp_path` and `LLM_MOCK=true`, and removes `MASSIVE_API_KEY`. For SSE-level fixes, copy the `FakeRequest` and `anext(events)` pattern from `backend/tests/market/test_stream.py:8-34`. Run with `UV_CACHE_DIR=$TMPDIR/uvcache uv run --directory backend pytest -q`. All 75 existing tests must stay green.

## Shared Patterns

### Same-origin relative URLs (FND-02, D-12)
**Source:** `test/e2e/06-sse-reconnect.spec.ts:42` (the app is loaded through a random-port proxy: `page.goto(\`http://127.0.0.1:${port}/\`)`)
**Apply to:** `store/terminal.ts` and any component that fetches. Only `"/api/..."` strings. Check: `grep -rn "http://\|https://" frontend/app frontend/components frontend/store` returns nothing.

### E2E testid contract
**Source:** `test/e2e/helpers.ts`, `test/e2e/01-fresh-start.spec.ts`, `test/e2e/06-sse-reconnect.spec.ts`
**Apply to:** Header, ConnectionStatus, WatchlistRow. Phase 1 testids, exactly: `connection-status` (+ `data-status`), `cash-balance`, `total-value`, `watchlist-row-{T}`, `watchlist-price-{T}`. Elements read with `readNumber` contain one number only and render only once loaded.

### One store, per-ticker selectors (D-09)
**Source:** RESEARCH.md Code Examples §1 and §2 (`useTerminal((s) => s.prices[ticker])`)
**Apply to:** every component. Primitive or existing-object selectors only. Note that `.planning/research/ARCHITECTURE.md:60,127` proposes a React-context `PriceStream`. **D-09 supersedes that proposal. Use Zustand, not context.**

### Formatting
**Source:** `test/e2e/helpers.ts:6-8` (`parseNumber`)
**Apply to:** all rendered prices, cash, and percents. Use `Intl.NumberFormat("en-US", …)` and signed `toFixed(2)` percents.

### Backend conventions (only if a fix is needed)
**Source:** `backend/app/api.py` (HTTPException 400/404, Pydantic models, type-hinted signatures), `backend/app/main.py:43-50` (the broad except in the background loop stays, per D-14)
**Apply to:** any backend fix. Use `uv run` only.

### Static serving (no change)
**Source:** `backend/app/main.py:27-40, 72-73` (`SPAStaticFiles`, mounted when `STATIC_DIR` exists). The Dockerfile sets `STATIC_DIR=/app/backend/static` and runs `COPY --from=frontend /frontend/out ./static`. For local E2E, run `STATIC_DIR=$PWD/frontend/out DB_PATH=$TMPDIR/e2e.db LLM_MOCK=true MASSIVE_API_KEY= uv run --directory backend uvicorn app.main:app --port 8000` (RESEARCH Pattern 4).

## No Analog Found

Planner should use the RESEARCH.md Code Examples for these files.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `frontend/app/layout.tsx` | root layout | n/a | No frontend exists. RESEARCH §3 (no `next/font/google`) |
| `frontend/app/globals.css` | theme | n/a | RESEARCH §3 `@theme` tokens |
| `frontend/app/page.tsx` | root client component | event-driven | RESEARCH §2 |
| `frontend/store/terminal.ts` | store | SSE + REST | No client store exists. RESEARCH §1; the backend producers above define the data contract |
| `frontend/components/Panel.tsx`, `ChatDrawer.tsx`, grid | layout | n/a | No UI exists. Follow CONTEXT.md D-01 to D-04 and the sketch |
| `frontend/next.config.ts` | config | build | RESEARCH §3 |

## Metadata

**Analog search scope:** `backend/app/**`, `backend/tests/**`, `test/**`, `Dockerfile`, `.dockerignore`, `.gitignore`, `docker-compose.yml`, `scripts/`, `.planning/research/ARCHITECTURE.md`
**Files scanned:** 22
**Pattern extraction date:** 2026-09-25
