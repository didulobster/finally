# Market Data — Summary

**Status:** designed and prototyped; **not yet implemented** (there is no `backend/` code). This is the canonical design. The detailed sources are in `planning/archive/` (§10). Where they disagree, this document wins.

Scope: `backend/app/market/`, which covers the data-source interface, the GBM simulator, the Massive REST poller, the shared price cache and `GET /api/stream/prices`.

## 1. Decisions

The archive holds two designs of the same component: a hardened one (`MARKET_DATA_DESIGN.md`) and a simpler one (`MARKET_INTERFACE.md` + `MARKET_SIMULATOR.md`). The **simpler one is the baseline**. A few cheap correctness points are taken from the hardened one.

| Topic | Decision | Source |
|---|---|---|
| Overall shape | One `MarketDataSource` ABC, two implementations, one `PriceCache`. Sources write, everyone else reads | both |
| Shock probability | `0.0001` per tick per ticker (≈1 visible jump every 8 min across 10 tickers). `0.001` was measured as too wild | SIMULATOR |
| Correlation | Same sector 0.6 (tech, finance); cross-sector and unknown 0.3; TSLA 0.3 with everything | SIMULATOR |
| Time acceleration | None: real-time GBM. `dt` is a constructor arg, so it can be added later if demos look too static | SIMULATOR |
| Daily change % | Frontend computes it from the first price it received since page load. No `session_open` field | INTERFACE |
| Config | Only `MASSIVE_API_KEY` (whitespace-only counts as empty). Optional `MASSIVE_POLL_INTERVAL` if needed | INTERFACE |
| Massive poll | Every 15 s, one `get_snapshot_all` call for all tickers, run via `asyncio.to_thread` | both |
| Massive plan | **Starter or higher required.** The free Basic plan has no snapshot endpoint, so free users should use the simulator | MASSIVE_API |
| Held tickers | Tracked set = watchlist ∪ open positions. Only call `remove_ticker` when both are gone | both |
| `massive` version | `>=2.0.1` (there is no 1.x release) | DESIGN |
| SSE tests | Test the generator directly. `httpx.ASGITransport` buffers and hangs on endless streams | DESIGN |
| Packaging | pyproject needs `[tool.hatch.build.targets.wheel] packages = ["app"]` or `uv sync` fails | DESIGN |

## 2. Architecture

```
MASSIVE_API_KEY? ─► create_market_data_source(cache)
        ├── no  → SimulatorDataSource  (GBM step every 0.5 s)
        └── yes → MassiveDataSource    (1 snapshot call every 15 s)
                         │ cache.update(ticker, price[, timestamp])
                    PriceCache  (latest PriceUpdate per ticker + version counter)
                         │
   SSE /api/stream/prices · trade fill price · portfolio valuation · LLM context
```

```
backend/app/market/
├── __init__.py        # exports PriceCache, PriceUpdate, MarketDataSource,
│                      #         create_market_data_source, create_stream_router
├── models.py          # PriceUpdate
├── cache.py           # PriceCache
├── interface.py       # MarketDataSource (ABC)
├── factory.py         # create_market_data_source()
├── seed_prices.py     # seed prices, (mu, sigma), sectors, correlations
├── simulator.py       # GBMSimulator (pure, sync) + SimulatorDataSource (asyncio)
├── massive_client.py  # snapshot_price() + MassiveDataSource
└── stream.py          # create_stream_router()
```

Dependencies: `uv add fastapi uvicorn numpy massive`.

## 3. Contracts

**`PriceUpdate`** is a frozen dataclass with fields `ticker`, `price`, `previous_price`, `timestamp` (unix seconds). The properties `change`, `change_percent` and `direction` (`up`/`down`/`flat`) are derived and never stored. `previous_price` is the **previous tick**, not the previous close.

**`PriceCache`**:
- `update(ticker, price, timestamp=None)` rounds to cents and takes `previous_price` from the cached entry (on the first update it equals `price`). Bumps `version`.
- `get`, `get_price`, `get_all`, and `remove`, which also bumps `version`.
- Guarded by a `threading.Lock`, because the Massive client writes from a worker thread.

**`MarketDataSource`** (async `start`/`stop`/`add_ticker`/`remove_ticker`, sync `get_tickers`):

| Method | Behaviour |
|---|---|
| `start(tickers)` | Seeds the cache **before returning**, then launches one asyncio task |
| `stop()` | Cancels and awaits the task. Safe to call twice |
| `add_ticker` | Idempotent. Simulator prices it immediately; Massive prices it on the next poll |
| `remove_ticker` | Idempotent. Also removes the ticker from the cache |
| loop | A failed iteration is logged and skipped. The loop never dies |

**Factory:** unset, empty or whitespace key → simulator; otherwise Massive.

**SSE `GET /api/stream/prices`:** headers `Cache-Control: no-cache`, `X-Accel-Buffering: no`. The stream starts with `retry: 1000`. Every 0.5 s, if `cache.version` changed, it sends one event holding **all** tickers:

```
data: {"AAPL": {"ticker":"AAPL","price":190.03,"previous_price":190.04,"timestamp":1789986430.67,
                "change":-0.01,"change_percent":-0.0053,"direction":"down"}, "GOOGL": {...}}
```

The client does `JSON.parse(e.data)` and merges the result into its state. `direction` drives the flash.

## 4. Simulator

- **Exact GBM step:** `S·exp((μ − σ²/2)·Δt + σ·√Δt·Z)`, with `Δt = 0.5 / (252·6.5·3600) ≈ 8.48e-8`. At σ 0.22, AAPL's per-tick std dev is about 1 cent.
- **Correlation:** `Z = L·z`, where `L` is the Cholesky factor of the sector matrix. `L` is rebuilt only when tickers change. The matrix is positive-definite for any ticker mix (λ_min ≥ 0.4).
- **Shocks:** with probability `p = 0.0001` per tick, multiply the price by `1 ± U(0.02, 0.05)`.
- **Seeds:** AAPL 190, GOOGL 175, MSFT 420, AMZN 185, TSLA 250, NVDA 800, META 500, JPM 195, V 280, NFLX 600. Unknown tickers start at a uniform random price in $50–300 with σ 0.25 and μ 0.05.
- **Volatilities σ:** AAPL .22, GOOGL .25, MSFT .20, AMZN .28, TSLA .50, NVDA .40, META .30, JPM .18, V .17, NFLX .35. μ is 0.03–0.08.
- **Precision:** full precision is kept internally and rounded only in the cache.
- **Randomness:** uses the global `random`/`np.random` state. Seed both for reproducible tests.
- **Validated:** realised σ was within 1%, and ρ was 0.60 for tech, 0.59 for finance and 0.30 cross-sector. The median 1-hour range was 2.4%.

## 5. Massive API

- Base URL `https://api.massive.com`. Python client `massive` (synchronous, 3 retries by default). Tickers are upper-case.
- Endpoint: `GET /v2/snapshot/locale/us/markets/stocks/tickers?tickers=A,B,C` via `client.get_snapshot_all(SnapshotMarketType.STOCKS, tickers=[...])`.
- Price fallback: `last_trade.price` (timestamp `sip_timestamp`, **ns**) → `min.close` (timestamp in **ms**) → `day.close` → `prev_day.close`. The last two use `updated` (ns). `LastTrade` has **no** `.timestamp` attribute.
- Unknown tickers are simply missing from the response.
- Errors: a bad key, a plan that doesn't include the endpoint, or a 429 all raise `BadResponse`. The poll catches the error, logs it and tries again next interval.
- Outside market hours prices stop changing. This is expected.
- The free tier can only get end-of-day closes (Grouped Daily, 1 call). It is not used by FinAlly.

## 6. App wiring

- Create `cache` and `source` once. In the FastAPI `lifespan`, call `await source.start(tickers)` with the watchlist tickers plus the tickers of held positions. Call `await source.stop()` on exit.
- `app.include_router(create_stream_router(cache))`. Build the router inside the factory function, not at module level.
- `POST /api/watchlist`: validate the ticker (1–5 letters) → DB insert → `source.add_ticker`.
- `DELETE /api/watchlist/{ticker}`: DB delete → `source.remove_ticker` **only if no open position** exists.
- `POST /api/portfolio/trade`: fills at `cache.get_price(ticker)`. If there is no price, add the ticker to the source first. If there is still no price, return 400.

## 7. Testing (`backend/tests/market/`)

- `PriceUpdate`: up, down and flat cases, and `previous_price == 0`.
- `PriceCache`: first-update semantics, `previous_price` carry-over, version bumps, remove.
- Simulator: every price > 0. Realised σ within ±5% over 20k steps with seeded RNG and events off. Tech/tech ρ ≈ 0.6 and tech/finance ≈ 0.3 (±0.05). `p=1` gives a 2–5% jump. Unknown-ticker seed is in [50, 300]. Empty set works. **Don't assert μ**: it is statistically unmeasurable at this sample size.
- `snapshot_price`: `TickerSnapshot.from_dict(...)` fixtures covering full data, no `lastTrade`, and pre-market zeros. No network needed.
- `MassiveDataSource`: patch `_client.get_snapshot_all` to return fixtures or to raise `BadResponse`. The loop must survive.
- Factory: key unset, blank and set.
- One interface contract test run against both sources: start → cache filled → add/remove → stop.
- SSE: drive the async generator with a fake `request.is_disconnected()`. Real HTTP is covered by the E2E tests.

## 8. Deferred hardening (from `MARKET_DATA_DESIGN.md`, add only if a real problem shows up)

| Item | Trigger to add it |
|---|---|
| `session_open` / true daily change vs previous close | Users want broker-style daily change instead of "since page load" |
| `SIM_TIME_ACCELERATION` (e.g. 30×) | Demos look too static |
| SSE `: keepalive` heartbeat every 15 s | A proxy drops idle streams under the 15 s Massive poll |
| Exponential backoff (cap 300 s) on poll failure | Log spam or bans from a bad key |
| Immediate poll on `add_ticker` (Massive) | A 15 s blank row bothers users |
| Chunking 100 tickers per request | Watchlists grow past about 100 tickers |
| `asyncio.Lock` around `step()` and ticker changes | Only needed if `step()` ever gains an await point. It is sync today, so no interleaving is possible |
| Injectable RNGs, `MarketConfig` env validation | Global seeding proves insufficient |

## 9. Open questions

1. Is "daily change %" as *since page load* acceptable for v1? (§1)
2. Should the frontend show a staleness indicator (from `timestamp`) when Massive is used outside market hours?

## 10. Source documents (`planning/archive/`)

| File | Contents |
|---|---|
| `MARKET_INTERFACE.md` | Full code for the baseline models, cache, interface, Massive source, factory, SSE and wiring |
| `MARKET_SIMULATOR.md` | Full simulator code, math, validation results and tuning knobs |
| `MASSIVE_API.md` | Massive endpoints, plans, response shapes, client usage and errors |
| `MARKET_DATA_DESIGN.md` | Hardened alternative design (§8 above) with verified API corrections and measurements |
| `review_1.md` | Obsolete review of the since-removed marketplace plugin config |
