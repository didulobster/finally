# Market Data Interface — Design

> **Archived.** Baseline design. Canonical decisions are in `../MARKET_DATA_SUMMARY.md`; this file keeps the full code.

This is the Python API FinAlly uses for live stock prices. One interface has two implementations:

- `MassiveDataSource` polls the Massive REST API. It is used when `MASSIVE_API_KEY` is set and non-empty. See `MASSIVE_API.md`.
- `SimulatorDataSource` generates prices in-process with GBM. This is the default. See `MARKET_SIMULATOR.md`.

Everything downstream (SSE, portfolio valuation, trade execution, LLM context) reads from a shared `PriceCache`. None of it knows which source is running.

All code below was run and checked (Python 3.12, `massive` 2.8.0, `numpy` 2.5, `fastapi` 0.141).

## 1. Data flow

```
                       ┌───────────────────────────┐
  MASSIVE_API_KEY? ──► │ create_market_data_source │
                       └─────────────┬─────────────┘
              ┌──────────────────────┴───────────────────────┐
              ▼                                              ▼
   SimulatorDataSource                            MassiveDataSource
   (GBM step every 0.5s)                          (1 snapshot call every 15s)
              └──────────────────────┬───────────────────────┘
                                     ▼  cache.update(ticker, price)
                               ┌───────────┐
                               │ PriceCache│  latest PriceUpdate per ticker + version counter
                               └─────┬─────┘
          ┌──────────────────────────┼──────────────────────────┐
          ▼                          ▼                          ▼
  GET /api/stream/prices     POST /api/portfolio/trade      /api/chat, /api/portfolio
  (SSE, every 0.5s if        (fill price = cache price)     (valuation, LLM context)
   version changed)
```

Rules:

- Sources are **writers** and everything else is a **reader**. Nothing else writes to the cache.
- Sources push. Readers never call a source to get a price; they read the cache.
- The watchlist in the database decides which tickers are tracked. Watchlist routes call `source.add_ticker` / `source.remove_ticker`.

## 2. Module layout

```
backend/app/market/
├── __init__.py         # re-exports the public API below
├── models.py           # PriceUpdate
├── cache.py            # PriceCache
├── interface.py        # MarketDataSource (ABC)
├── factory.py          # create_market_data_source()
├── massive_client.py   # MassiveDataSource
├── simulator.py        # GBMSimulator, SimulatorDataSource   (see MARKET_SIMULATOR.md)
├── seed_prices.py      # simulator seed prices & parameters  (see MARKET_SIMULATOR.md)
└── stream.py           # create_stream_router() – SSE endpoint
```

Public API (`app/market/__init__.py`):

```python
from .cache import PriceCache
from .factory import create_market_data_source
from .interface import MarketDataSource
from .models import PriceUpdate
from .stream import create_stream_router

__all__ = ["PriceCache", "PriceUpdate", "MarketDataSource", "create_market_data_source", "create_stream_router"]
```

Dependencies: `uv add massive numpy fastapi uvicorn`.

## 3. `PriceUpdate` — models.py

An immutable value object. Derived fields are computed, so they can never disagree with price and previous price.

```python
"""Price data model shared by all market data sources."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class PriceUpdate:
    """One price observation for one ticker."""

    ticker: str
    price: float
    previous_price: float
    timestamp: float  # unix seconds

    @property
    def change(self) -> float:
        return round(self.price - self.previous_price, 4)

    @property
    def change_percent(self) -> float:
        if self.previous_price == 0:
            return 0.0
        return round((self.price - self.previous_price) / self.previous_price * 100, 4)

    @property
    def direction(self) -> str:
        if self.price > self.previous_price:
            return "up"
        if self.price < self.previous_price:
            return "down"
        return "flat"

    def to_dict(self) -> dict:
        return {
            "ticker": self.ticker,
            "price": self.price,
            "previous_price": self.previous_price,
            "timestamp": self.timestamp,
            "change": self.change,
            "change_percent": self.change_percent,
            "direction": self.direction,
        }
```

`previous_price` is the price at the **previous update**, i.e. the tick before this one. It is not the previous day's close. It drives the green/red flash. The frontend works out "change since page load" or daily change itself from the prices it has received.

## 4. `PriceCache` — cache.py

```python
"""In-memory store of the latest price per ticker."""

import time
from threading import Lock

from .models import PriceUpdate


class PriceCache:
    """Latest price per ticker; the single source of truth for live prices."""

    def __init__(self) -> None:
        self._prices: dict[str, PriceUpdate] = {}
        self._lock = Lock()
        self.version = 0

    def update(self, ticker: str, price: float, timestamp: float | None = None) -> PriceUpdate:
        """Record a new price; the previous price is taken from the cache."""
        with self._lock:
            prev = self._prices.get(ticker)
            update = PriceUpdate(
                ticker=ticker,
                price=round(price, 2),
                previous_price=prev.price if prev else round(price, 2),
                timestamp=timestamp or time.time(),
            )
            self._prices[ticker] = update
            self.version += 1
            return update

    def get(self, ticker: str) -> PriceUpdate | None:
        return self._prices.get(ticker)

    def get_price(self, ticker: str) -> float | None:
        update = self._prices.get(ticker)
        return update.price if update else None

    def get_all(self) -> dict[str, PriceUpdate]:
        with self._lock:
            return dict(self._prices)

    def remove(self, ticker: str) -> None:
        with self._lock:
            self._prices.pop(ticker, None)
            self.version += 1
```

- The cache stores prices rounded to cents. The simulator keeps full precision internally, so rounding does not add up over time.
- `version` goes up on every write. The SSE loop compares it so it only sends when something changed. When Massive polls every 15s, that means no duplicate events.
- A `Lock` is cheap, and it keeps the cache safe if a source ever writes from a worker thread.

## 5. `MarketDataSource` — interface.py

```python
"""Abstract interface implemented by every market data source."""

from abc import ABC, abstractmethod


class MarketDataSource(ABC):
    """Produces prices for a set of tickers and writes them into a PriceCache."""

    @abstractmethod
    async def start(self, tickers: list[str]) -> None:
        """Begin producing prices for the given tickers (starts a background task)."""

    @abstractmethod
    async def stop(self) -> None:
        """Stop the background task."""

    @abstractmethod
    async def add_ticker(self, ticker: str) -> None:
        """Start tracking a ticker."""

    @abstractmethod
    async def remove_ticker(self, ticker: str) -> None:
        """Stop tracking a ticker and drop it from the cache."""

    @abstractmethod
    def get_tickers(self) -> list[str]:
        """Tickers currently tracked."""
```

Contract that both implementations follow:

| Method | Behaviour |
|---|---|
| `start` | Seeds the cache **before returning**, so the first request after startup has prices, then launches one asyncio task |
| `stop` | Cancels and awaits the task. Safe to call twice |
| `add_ticker` | Idempotent. Simulator: priced immediately. Massive: priced on the next poll (≤15s) |
| `remove_ticker` | Idempotent. Also removes the ticker from the cache |
| background loop | One failed iteration is logged and skipped; the loop never dies |

## 6. `MassiveDataSource` — massive_client.py

```python
"""Market data source that polls the Massive (formerly Polygon.io) REST API."""

import asyncio
import logging

from massive import RESTClient
from massive.rest.models import SnapshotMarketType, TickerSnapshot

from .cache import PriceCache
from .interface import MarketDataSource

logger = logging.getLogger(__name__)


def snapshot_price(snap: TickerSnapshot) -> tuple[float, float] | None:
    """Best available (price, unix-seconds timestamp) from a snapshot, or None."""
    if snap.last_trade and snap.last_trade.price:
        return snap.last_trade.price, snap.last_trade.sip_timestamp / 1e9
    if snap.min and snap.min.close:
        return snap.min.close, snap.min.timestamp / 1e3
    if snap.day and snap.day.close:
        return snap.day.close, snap.updated / 1e9
    if snap.prev_day and snap.prev_day.close:
        return snap.prev_day.close, snap.updated / 1e9
    return None


class MassiveDataSource(MarketDataSource):
    """Polls the full-market snapshot endpoint for all tracked tickers in one call."""

    def __init__(self, api_key: str, cache: PriceCache, poll_interval: float = 15.0) -> None:
        self._client = RESTClient(api_key=api_key)
        self._cache = cache
        self._poll_interval = poll_interval
        self._tickers: list[str] = []
        self._task: asyncio.Task | None = None

    async def start(self, tickers: list[str]) -> None:
        self._tickers = list(tickers)
        await self._poll_once()
        self._task = asyncio.create_task(self._run(), name="massive-poller")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)
            self._task = None

    async def add_ticker(self, ticker: str) -> None:
        if ticker not in self._tickers:
            self._tickers.append(ticker)

    async def remove_ticker(self, ticker: str) -> None:
        if ticker in self._tickers:
            self._tickers.remove(ticker)
        self._cache.remove(ticker)

    def get_tickers(self) -> list[str]:
        return list(self._tickers)

    async def _run(self) -> None:
        while True:
            await asyncio.sleep(self._poll_interval)
            await self._poll_once()

    async def _poll_once(self) -> None:
        if not self._tickers:
            return
        try:
            snapshots = await asyncio.to_thread(
                self._client.get_snapshot_all, SnapshotMarketType.STOCKS, tickers=self._tickers
            )
        except Exception:
            logger.exception("Massive snapshot poll failed")
            return
        for snap in snapshots:
            result = snapshot_price(snap)
            if result:
                price, timestamp = result
                self._cache.update(snap.ticker, price, timestamp)
```

Notes:

- There is one HTTP call per poll for the whole watchlist.
- The synchronous client runs in `asyncio.to_thread`, so it never blocks the event loop.
- An unknown ticker is simply missing from the response, so it never appears in the cache. The watchlist API can check `cache.get(ticker)` after the next poll to warn the user.
- Requires the Stocks **Starter** plan or higher. On a free Basic key, every poll logs `BadResponse` (not authorized) and no prices appear. Tell free-tier users to leave `MASSIVE_API_KEY` empty and use the simulator.
- `poll_interval` defaults to 15s. Make it configurable with an optional `MASSIVE_POLL_INTERVAL` env var in the factory if needed.

## 7. Factory — factory.py

```python
"""Selects the market data source from the environment."""

import os

from .cache import PriceCache
from .interface import MarketDataSource
from .massive_client import MassiveDataSource
from .simulator import SimulatorDataSource


def create_market_data_source(cache: PriceCache) -> MarketDataSource:
    """Massive if MASSIVE_API_KEY is set and non-empty, otherwise the simulator."""
    api_key = os.getenv("MASSIVE_API_KEY", "").strip()
    if api_key:
        return MassiveDataSource(api_key=api_key, cache=cache)
    return SimulatorDataSource(cache=cache)
```

Tested: unset → simulator; `"  "` → simulator; `"abc"` → Massive.

## 8. SSE endpoint — stream.py

```python
"""SSE endpoint that pushes cached prices to the browser."""

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from .cache import PriceCache


def create_stream_router(cache: PriceCache, interval: float = 0.5) -> APIRouter:
    router = APIRouter(prefix="/api/stream")

    @router.get("/prices")
    async def stream_prices(request: Request) -> StreamingResponse:
        return StreamingResponse(
            _price_events(cache, request, interval),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return router


async def _price_events(cache: PriceCache, request: Request, interval: float) -> AsyncIterator[str]:
    """Yield one SSE event with all prices whenever the cache has changed."""
    yield "retry: 1000\n\n"
    last_version = -1
    while not await request.is_disconnected():
        if cache.version != last_version:
            last_version = cache.version
            payload = {t: u.to_dict() for t, u in cache.get_all().items()}
            yield f"data: {json.dumps(payload)}\n\n"
        await asyncio.sleep(interval)
```

Wire format, as captured from a running server:

```
retry: 1000

data: {"AAPL": {"ticker": "AAPL", "price": 190.03, "previous_price": 190.04, "timestamp": 1789986430.67, "change": -0.01, "change_percent": -0.0053, "direction": "down"}, "GOOGL": {...}}

data: {"AAPL": {...}, "GOOGL": {...}}
```

Each event is one object keyed by ticker, holding every tracked ticker. The client does `JSON.parse(event.data)` and merges it into its state. `retry: 1000` tells `EventSource` to reconnect after 1s.

## 9. Wiring into the FastAPI app

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.market import PriceCache, create_market_data_source, create_stream_router

cache = PriceCache()
source = create_market_data_source(cache)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await source.start(load_watchlist_tickers())   # from the DB, after lazy init/seed
    yield
    await source.stop()


app = FastAPI(lifespan=lifespan)
app.include_router(create_stream_router(cache))
```

Other routes get `cache` and `source` from module scope or `app.state`:

```python
# POST /api/watchlist
await source.add_ticker(ticker)          # after inserting into the watchlist table

# DELETE /api/watchlist/{ticker}
await source.remove_ticker(ticker)       # after deleting from the watchlist table

# POST /api/portfolio/trade
price = cache.get_price(ticker)
if price is None:
    raise HTTPException(400, f"No price available for {ticker}")
```

**Held positions not on the watchlist:** PLAN.md says the source tracks the watchlist. If a user removes a ticker they still hold, the position has no live price. Simplest rule: the tracked set is the watchlist **plus** any ticker with an open position. Only call `remove_ticker` when both are gone.

## 10. Testing

- `PriceUpdate`: direction, change and change_percent for up, down and flat cases, and for `previous_price == 0`.
- `PriceCache`: the first update has `previous_price == price`; the second update carries the first price as `previous_price`; `version` increments; `remove` works.
- `snapshot_price`: build `TickerSnapshot.from_dict({...})` fixtures for full data, no `lastTrade`, and pre-market zeros (falls back to `prevDay.c`). No network needed.
- `MassiveDataSource`: patch `_client.get_snapshot_all` to return fixtures, or to raise `BadResponse`. After `start()`, the cache is filled, or empty with the error logged, and the task is still running.
- Factory: env var unset, blank and set.
- Both sources: run the same interface test against each (start → cache filled → add/remove → stop).
