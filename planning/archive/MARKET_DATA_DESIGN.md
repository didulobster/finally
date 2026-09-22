# Market Data Backend — Detailed Design

> **Archived.** Alternative, hardened design; **not the baseline**. `../MARKET_DATA_SUMMARY.md` §1 and §8 list which parts were adopted and which are deferred. Where they differ (shock probability 0.001 vs 0.0001, finance correlation 0.5 vs 0.6, `session_open`, `MarketConfig`, locks, backoff, heartbeat), the summary wins.

**Status:** design, ready to implement. Every code block below was executed and
asserted against `massive` 2.8.0, `numpy` 2.4.6 and `fastapi` 0.141.1 before
being written down; §14 lists what was measured and how.

**Scope:** everything behind `backend/app/market/` — the unified data-source
interface, the GBM simulator, the Massive (Polygon.io) REST client, the shared
price cache, and the SSE endpoint at `GET /api/stream/prices`. Portfolio
valuation, trade execution and the LLM layer are downstream consumers; they
appear here only where they touch the cache.

---

## Table of Contents

1. [Architecture](#1-architecture)
2. [File layout](#2-file-layout)
3. [Data model — `PriceUpdate`](#3-data-model--priceupdate)
4. [`PriceCache`](#4-pricecache)
5. [`MarketDataSource` — the unified interface](#5-marketdatasource--the-unified-interface)
6. [Configuration](#6-configuration)
7. [The simulator](#7-the-simulator)
8. [The Massive API client](#8-the-massive-api-client)
9. [Factory](#9-factory)
10. [SSE streaming endpoint](#10-sse-streaming-endpoint)
11. [Application wiring](#11-application-wiring)
12. [Watchlist coordination](#12-watchlist-coordination)
13. [Testing strategy](#13-testing-strategy)
14. [Verified facts and open decisions](#14-verified-facts-and-open-decisions)

---

## 1. Architecture

One producer writes, many consumers read, and a cache sits between them so that
neither side knows the other exists.

```
      MASSIVE_API_KEY set?
              │
      ┌───────┴────────┐
      no               yes
      │                 │
┌─────▼──────────┐  ┌───▼────────────────┐
│ SimulatorData  │  │ MassiveDataSource  │   both implement
│ Source (GBM,   │  │ (REST poll, 15s)   │   MarketDataSource
│ 500 ms tick)   │  │                    │
└─────┬──────────┘  └───┬────────────────┘
      └────────┬────────┘
               │ .update(ticker, price, timestamp, session_open)
        ┌──────▼────────────────────────┐
        │  PriceCache                   │   thread-safe, O(tickers)
        │  latest PriceUpdate + version │   single source of truth
        └──────┬────────────────────────┘
               │ .snapshot() / .get_price()
     ┌─────────┼──────────────┬──────────────────┐
     │         │              │                  │
┌────▼─────┐ ┌─▼───────────┐ ┌▼───────────────┐ ┌▼──────────────┐
│ SSE      │ │ Portfolio   │ │ Trade          │ │ LLM chat      │
│ /api/    │ │ valuation   │ │ execution      │ │ context       │
│ stream/  │ │             │ │ (fill price)   │ │               │
│ prices   │ └─────────────┘ └────────────────┘ └───────────────┘
└──────────┘
```

Three rules hold the design together:

1. **Nothing downstream ever calls a data source for a price.** Sources push
   into the cache; consumers read the cache. Swapping the simulator for
   Massive changes one factory branch and nothing else.
2. **The cache is the only mutable shared state.** It owns its lock. No other
   module needs one.
3. **A data source never raises into its own loop.** A poll failure or a bad
   snapshot degrades to a stale price, never to a dead background task.

---

## 2. File layout

```
backend/app/market/
├── __init__.py          # public surface (re-exports)
├── models.py            # PriceUpdate
├── cache.py             # PriceCache
├── interface.py         # MarketDataSource ABC
├── config.py            # MarketConfig.from_env()
├── seed_prices.py       # seed prices, GBM params, correlation structure
├── simulator.py         # GBMSimulator + SimulatorDataSource
├── massive_client.py    # MassiveDataSource (+ extract_quote, normalize_timestamp)
├── factory.py           # create_market_data_source()
└── stream.py            # create_stream_router() — SSE

backend/tests/market/
├── test_models.py  test_cache.py  test_simulator.py  test_gbm_stats.py
├── test_massive.py test_factory.py test_config.py    test_stream.py
```

`__init__.py` — the whole surface other packages should import:

```python
"""Market data subsystem for FinAlly."""

from .cache import PriceCache
from .config import MarketConfig
from .factory import create_market_data_source
from .interface import MarketDataSource
from .models import PriceUpdate
from .stream import create_stream_router

__all__ = [
    "MarketConfig",
    "MarketDataSource",
    "PriceCache",
    "PriceUpdate",
    "create_market_data_source",
    "create_stream_router",
]
```

Note `massive_client` is deliberately **not** re-exported: importing it pulls in
the `massive` package, which a simulator-only deployment never needs. The
factory imports it lazily (§9).

---

## 3. Data model — `PriceUpdate`

The one subtlety in this module is that "change" means two different things in
the UI, and conflating them is the easiest way to ship a wrong number.

- **Tick change** — versus the previous update, some hundreds of milliseconds
  ago. This drives the green/red flash. It is a tiny number (§7.4).
- **Session change** — versus a per-ticker anchor (`session_open`). This is the
  **"daily change %"** column `PLAN.md` §10 requires in the watchlist. Nothing
  in the plan's SSE field list supplies it, so the model carries the anchor.

```python
"""Data models for market data."""

from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class PriceUpdate:
    """Immutable snapshot of a single ticker's price at a point in time.

    Two independent notions of "change" live here and must not be confused:

    * tick change  (`change`, `change_percent`, `direction`) - versus the
      immediately preceding update. Drives the green/red flash animation.
    * session change (`day_change`, `day_change_percent`) - versus
      `session_open`, the reference price for the trading session. Drives the
      "daily change %" column in the watchlist.
    """

    ticker: str
    price: float
    previous_price: float
    session_open: float
    timestamp: float = field(default_factory=time.time)  # Unix seconds (float)

    # --- tick-over-tick: drives the flash animation ---

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

    # --- session-over-session: drives the watchlist "daily change %" ---

    @property
    def day_change(self) -> float:
        return round(self.price - self.session_open, 4)

    @property
    def day_change_percent(self) -> float:
        if self.session_open == 0:
            return 0.0
        return round((self.price - self.session_open) / self.session_open * 100, 4)

    def to_dict(self) -> dict:
        return {
            "ticker": self.ticker,
            "price": self.price,
            "previous_price": self.previous_price,
            "session_open": self.session_open,
            "timestamp": self.timestamp,
            "change": self.change,
            "change_percent": self.change_percent,
            "direction": self.direction,
            "day_change": self.day_change,
            "day_change_percent": self.day_change_percent,
        }
```

### Design notes

| Choice | Why |
|---|---|
| `frozen=True, slots=True` | A value handed to many readers; freezing removes a whole class of aliasing bug, and slots keeps it cheap at ~20 objects/sec. |
| Derived values as properties | `change` can never disagree with `price - previous_price`, because it isn't stored. |
| Prices rounded to 2dp **in the cache**, not here | One rounding site. `PriceUpdate` trusts its inputs. |
| Percentages rounded to 4dp | Enough for `-0.0088%`; the frontend formats for display. |
| `timestamp` is Unix **seconds** as a float | One unit everywhere internally. Massive's various epoch units are normalised at the boundary (§8.2). |
| `session_open` required, not optional | An optional anchor becomes `None` in a template somewhere. The cache always supplies one. |

**Where `session_open` comes from:**

| Source | Anchor |
|---|---|
| Massive | `snap.prev_day.close` — the previous session's close, which is how brokers quote daily change. Falls back to `snap.day.open`. |
| Simulator | The ticker's seed price, pinned when the ticker enters the simulation. |

This matches Massive's own figures: for the test snapshot, `day_change_percent`
computes to `0.7139` against Massive's reported `todaysChangePerc` of `0.71`
(§14).

---

## 4. `PriceCache`

```python
"""Thread-safe in-memory price cache."""

from __future__ import annotations

import time
from threading import Lock

from .models import PriceUpdate


class PriceCache:
    """Thread-safe store of the latest PriceUpdate per ticker."""

    def __init__(self) -> None:
        self._prices: dict[str, PriceUpdate] = {}
        self._session_open: dict[str, float] = {}
        self._lock = Lock()
        self._version: int = 0

    def update(
        self,
        ticker: str,
        price: float,
        timestamp: float | None = None,
        session_open: float | None = None,
    ) -> PriceUpdate:
        """Record a new price. Returns the stored PriceUpdate.

        `session_open` anchors the daily-change calculation. It is remembered
        per ticker: pass it when known (Massive supplies prev_day.close), and
        it is inferred from the first price seen otherwise.
        """
        with self._lock:
            ts = timestamp if timestamp is not None else time.time()
            price = round(price, 2)

            prev = self._prices.get(ticker)
            previous_price = prev.price if prev is not None else price

            if session_open is not None:
                self._session_open[ticker] = round(session_open, 2)
            elif ticker not in self._session_open:
                self._session_open[ticker] = price
            anchor = self._session_open[ticker]

            update = PriceUpdate(
                ticker=ticker,
                price=price,
                previous_price=previous_price,
                session_open=anchor,
                timestamp=ts,
            )
            self._prices[ticker] = update
            self._version += 1
            return update

    def get(self, ticker: str) -> PriceUpdate | None:
        with self._lock:
            return self._prices.get(ticker)

    def get_price(self, ticker: str) -> float | None:
        with self._lock:
            update = self._prices.get(ticker)
            return update.price if update else None

    def get_all(self) -> dict[str, PriceUpdate]:
        with self._lock:
            return dict(self._prices)

    def snapshot(self) -> tuple[int, dict[str, PriceUpdate]]:
        """Version and prices read under a single lock acquisition.

        SSE uses this so the version it records always matches the payload it
        sends; reading them separately can drop an update.
        """
        with self._lock:
            return self._version, dict(self._prices)

    def remove(self, ticker: str) -> None:
        with self._lock:
            self._prices.pop(ticker, None)
            self._session_open.pop(ticker, None)
            self._version += 1

    @property
    def version(self) -> int:
        with self._lock:
            return self._version

    def __len__(self) -> int:
        with self._lock:
            return len(self._prices)

    def __contains__(self, ticker: str) -> bool:
        with self._lock:
            return ticker in self._prices
```

### Why a version counter

The SSE endpoint must answer "has anything changed since my last frame?"
without diffing dictionaries every 500 ms. A monotonic counter, bumped on every
write and every removal, answers it in one integer comparison.

`snapshot()` exists because reading `version` and `get_all()` separately is a
race: a writer landing between the two reads makes the endpoint record a
version newer than the payload it sends, and that update is then never
transmitted. One lock acquisition, both values, no gap.

`remove()` bumps the version too — otherwise a ticker dropped from the
watchlist lingers on the client until the next price tick.

### Thread safety

The Massive client runs blocking HTTP in a worker thread via
`asyncio.to_thread`, so the cache genuinely faces more than one thread and a
`threading.Lock` (not an `asyncio.Lock`) is the correct primitive. Every read
takes the lock, including `version` — on CPython an `int` read is atomic today,
but the consistency is worth more than the nanoseconds, and free-threaded
builds (PEP 703) make the assumption false.

Memory is bounded at O(tickers): one `PriceUpdate` and one float per symbol, no
history. Sparkline history is accumulated on the frontend from the SSE stream,
per `PLAN.md` §2.

---

## 5. `MarketDataSource` — the unified interface

```python
"""Abstract interface for market data sources."""

from __future__ import annotations

from abc import ABC, abstractmethod


class MarketDataSource(ABC):
    """Contract for market data providers.

    Implementations push price updates into a shared PriceCache on their own
    schedule. Downstream code never calls the data source directly for prices -
    it reads from the cache.

    Lifecycle:
        source = create_market_data_source(cache)
        await source.start(["AAPL", "GOOGL", ...])
        # ... app runs ...
        await source.add_ticker("TSLA")
        await source.remove_ticker("GOOGL")
        # ... app shutting down ...
        await source.stop()
    """

    @abstractmethod
    async def start(self, tickers: list[str]) -> None:
        """Begin producing price updates for the given tickers.

        Seeds the cache synchronously so the first SSE frame has data, then
        starts the background task. Raises RuntimeError if called twice.
        """

    @abstractmethod
    async def stop(self) -> None:
        """Stop the background task and release resources.

        Idempotent. After stop() the source must not write to the cache again.
        """

    @abstractmethod
    async def add_ticker(self, ticker: str) -> None:
        """Add a ticker to the active set, and give it a cache entry promptly.

        No-op if already present.
        """

    @abstractmethod
    async def remove_ticker(self, ticker: str) -> None:
        """Remove a ticker from the active set and from the cache.

        No-op if not present.
        """

    @abstractmethod
    def get_tickers(self) -> list[str]:
        """Current actively tracked tickers. Synchronous - it only reads state."""
```

### Contract points both implementations must honour

| Guarantee | Why it matters |
|---|---|
| `start()` seeds the cache **before** returning | The first SSE frame carries prices; no empty watchlist flash on page load. |
| `start()` twice raises `RuntimeError` | Silently leaking a background task is worse than a loud failure. |
| `stop()` is idempotent and awaits cancellation | Clean shutdown under uvicorn's lifespan; no "task was destroyed but it is pending" noise. |
| `add_ticker()` gives the ticker a price promptly | The user adds a symbol and expects a row, not a 15-second blank. |
| `remove_ticker()` also clears the cache | Otherwise a removed ticker keeps streaming. |
| The background loop never dies on an exception | A market data outage must not require a restart. |

`get_tickers()` is synchronous on purpose: it reads a list, and making it async
would force `await` into request handlers that have no other reason to be async.

---

## 6. Configuration

`PLAN.md` §5 specifies `MASSIVE_API_KEY`. Poll interval is described as
"configurable", and §7.5 below argues for a simulator time knob, so both get
environment variables with validation and safe fallbacks — a typo in `.env`
should log a warning, not crash the container.

```python
"""Environment-driven configuration for the market data subsystem."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

logger = logging.getLogger(__name__)


def _float_env(name: str, default: float, minimum: float, maximum: float) -> float:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        logger.warning("%s=%r is not a number; using %s", name, raw, default)
        return default
    if not (minimum <= value <= maximum):
        logger.warning("%s=%s outside [%s, %s]; using %s", name, value, minimum, maximum, default)
        return default
    return value


@dataclass(frozen=True, slots=True)
class MarketConfig:
    massive_api_key: str = ""
    sim_interval: float = 0.5
    sim_time_acceleration: float = 1.0
    sim_event_probability: float = 0.001
    massive_poll_interval: float = 15.0

    @property
    def use_massive(self) -> bool:
        return bool(self.massive_api_key)

    @classmethod
    def from_env(cls) -> MarketConfig:
        return cls(
            massive_api_key=os.environ.get("MASSIVE_API_KEY", "").strip(),
            sim_interval=_float_env("SIM_INTERVAL_SECONDS", 0.5, 0.05, 10.0),
            sim_time_acceleration=_float_env("SIM_TIME_ACCELERATION", 1.0, 0.1, 5000.0),
            sim_event_probability=_float_env("SIM_EVENT_PROBABILITY", 0.001, 0.0, 1.0),
            massive_poll_interval=_float_env("MASSIVE_POLL_SECONDS", 15.0, 1.0, 600.0),
        )
```

| Variable | Default | Effect |
|---|---|---|
| `MASSIVE_API_KEY` | *(empty)* | Non-empty selects the Massive client; empty or whitespace selects the simulator. |
| `SIM_INTERVAL_SECONDS` | `0.5` | Simulator tick cadence. |
| `SIM_TIME_ACCELERATION` | `1.0` | Simulated trading time per real second. See §7.5. |
| `SIM_EVENT_PROBABILITY` | `0.001` | Per-tick, per-ticker shock chance. `0.0` disables shocks. |
| `MASSIVE_POLL_SECONDS` | `15.0` | Poll cadence. 15 s respects the free tier's 5 req/min. |

Note the `.strip()` on the API key: a `.env` line of `MASSIVE_API_KEY= ` would
otherwise select the Massive client with a blank key and produce 401s forever.

---

## 7. The simulator

### 7.1 Seed prices and parameters

```python
"""Seed prices, per-ticker GBM parameters, and correlation structure."""

from __future__ import annotations

SEED_PRICES: dict[str, float] = {
    "AAPL": 190.00, "GOOGL": 175.00, "MSFT": 420.00, "AMZN": 185.00,
    "TSLA": 250.00, "NVDA": 800.00, "META": 500.00, "JPM": 195.00,
    "V": 280.00, "NFLX": 600.00,
}

# sigma: annualized volatility. mu: annualized drift.
TICKER_PARAMS: dict[str, dict[str, float]] = {
    "AAPL": {"sigma": 0.22, "mu": 0.05},
    "GOOGL": {"sigma": 0.25, "mu": 0.05},
    "MSFT": {"sigma": 0.20, "mu": 0.05},
    "AMZN": {"sigma": 0.28, "mu": 0.05},
    "TSLA": {"sigma": 0.50, "mu": 0.03},
    "NVDA": {"sigma": 0.40, "mu": 0.08},
    "META": {"sigma": 0.30, "mu": 0.05},
    "JPM":  {"sigma": 0.18, "mu": 0.04},
    "V":    {"sigma": 0.17, "mu": 0.04},
    "NFLX": {"sigma": 0.35, "mu": 0.05},
}

DEFAULT_PARAMS: dict[str, float] = {"sigma": 0.25, "mu": 0.05}

CORRELATION_GROUPS: dict[str, frozenset[str]] = {
    "tech": frozenset({"AAPL", "GOOGL", "MSFT", "AMZN", "META", "NVDA", "NFLX"}),
    "finance": frozenset({"JPM", "V"}),
}

INTRA_GROUP_CORR: dict[str, float] = {"tech": 0.6, "finance": 0.5}
CROSS_GROUP_CORR = 0.3          # between sectors, and for unknown tickers
INDEPENDENT_TICKERS = frozenset({"TSLA"})   # correlate at CROSS_GROUP_CORR with everything

FALLBACK_PRICE_RANGE = (50.0, 300.0)   # unknown tickers get a random seed here
```

The volatilities are ordered the way the real ones are — TSLA at 0.50 against
V at 0.17 — so the watchlist reads plausibly: the payment processor sits still
while the EV maker jumps.

### 7.2 The GBM engine

Prices follow the standard log-normal discretisation:

```
S(t+dt) = S(t) · exp( (μ − σ²/2)·dt  +  σ·√dt·Z )
```

`Z` is a correlated standard normal, obtained by multiplying a vector of
independent draws by the Cholesky factor `L` of the correlation matrix: if
`Z_ind ~ N(0, I)` then `L·Z_ind ~ N(0, L·Lᵀ) = N(0, C)`.

`dt` converts a wall-clock tick into a fraction of a trading year:

```
TRADING_SECONDS_PER_YEAR = 252 × 6.5 × 3600 = 5,896,800
dt = tick_seconds × time_acceleration / TRADING_SECONDS_PER_YEAR
   = 0.5 / 5,896,800 = 8.479 × 10⁻⁸      (at 1× acceleration)
```

```python
"""GBM-based market simulator."""

from __future__ import annotations

import asyncio
import logging
import math
import random

import numpy as np

from .cache import PriceCache
from .interface import MarketDataSource
from .seed_prices import (
    CORRELATION_GROUPS, CROSS_GROUP_CORR, DEFAULT_PARAMS, FALLBACK_PRICE_RANGE,
    INDEPENDENT_TICKERS, INTRA_GROUP_CORR, SEED_PRICES, TICKER_PARAMS,
)

logger = logging.getLogger(__name__)

TRADING_SECONDS_PER_YEAR = 252 * 6.5 * 3600  # 5,896,800


class GBMSimulator:
    """Correlated Geometric Brownian Motion price paths.

        S(t+dt) = S(t) * exp((mu - sigma^2/2)*dt + sigma*sqrt(dt)*Z)

    Z is a correlated standard normal, obtained by multiplying independent
    draws by the Cholesky factor of the ticker correlation matrix.
    """

    def __init__(
        self,
        tickers: list[str],
        tick_seconds: float = 0.5,
        time_acceleration: float = 1.0,
        event_probability: float = 0.001,
        rng: random.Random | None = None,
        np_rng: np.random.Generator | None = None,
    ) -> None:
        self._dt = (tick_seconds * time_acceleration) / TRADING_SECONDS_PER_YEAR
        self._event_prob = event_probability
        self._rng = rng or random.Random()
        self._np_rng = np_rng or np.random.default_rng()

        self._tickers: list[str] = []
        self._prices: dict[str, float] = {}
        self._params: dict[str, dict[str, float]] = {}
        self._cholesky: np.ndarray | None = None

        for ticker in tickers:
            self._add_ticker_internal(ticker)
        self._rebuild_cholesky()

    @property
    def dt(self) -> float:
        return self._dt

    def get_tickers(self) -> list[str]:
        return list(self._tickers)

    def get_price(self, ticker: str) -> float | None:
        return self._prices.get(ticker)

    def step(self) -> dict[str, float]:
        """Advance every ticker one tick. Returns {ticker: new_price}."""
        n = len(self._tickers)
        if n == 0:
            return {}

        z = self._np_rng.standard_normal(n)
        if self._cholesky is not None:
            z = self._cholesky @ z

        result: dict[str, float] = {}
        for i, ticker in enumerate(self._tickers):
            p = self._params[ticker]
            mu, sigma = p["mu"], p["sigma"]

            drift = (mu - 0.5 * sigma * sigma) * self._dt
            diffusion = sigma * math.sqrt(self._dt) * float(z[i])
            price = self._prices[ticker] * math.exp(drift + diffusion)

            if self._rng.random() < self._event_prob:
                magnitude = self._rng.uniform(0.02, 0.05)
                sign = self._rng.choice((-1, 1))
                price *= 1 + magnitude * sign
                logger.debug("Shock on %s: %+.1f%%", ticker, magnitude * 100 * sign)

            self._prices[ticker] = price
            result[ticker] = round(price, 2)

        return result

    def add_ticker(self, ticker: str) -> None:
        if ticker in self._prices:
            return
        self._add_ticker_internal(ticker)
        self._rebuild_cholesky()

    def remove_ticker(self, ticker: str) -> None:
        if ticker not in self._prices:
            return
        self._tickers.remove(ticker)
        del self._prices[ticker]
        del self._params[ticker]
        self._rebuild_cholesky()

    # --- internals ---

    def _add_ticker_internal(self, ticker: str) -> None:
        if ticker in self._prices:
            return
        self._tickers.append(ticker)
        self._prices[ticker] = SEED_PRICES.get(ticker) or self._rng.uniform(*FALLBACK_PRICE_RANGE)
        self._params[ticker] = dict(TICKER_PARAMS.get(ticker, DEFAULT_PARAMS))

    def _rebuild_cholesky(self) -> None:
        n = len(self._tickers)
        if n <= 1:
            self._cholesky = None
            return

        corr = np.eye(n)
        for i in range(n):
            for j in range(i + 1, n):
                rho = self._pairwise_correlation(self._tickers[i], self._tickers[j])
                corr[i, j] = corr[j, i] = rho

        try:
            self._cholesky = np.linalg.cholesky(corr)
        except np.linalg.LinAlgError:
            # Unreachable with the shipped constants (see S7.3), but a bad edit
            # must degrade to uncorrelated moves, not crash the loop.
            logger.error("Correlation matrix not positive definite; using independent moves")
            self._cholesky = None

    @staticmethod
    def _pairwise_correlation(t1: str, t2: str) -> float:
        if t1 in INDEPENDENT_TICKERS or t2 in INDEPENDENT_TICKERS:
            return CROSS_GROUP_CORR
        for name, members in CORRELATION_GROUPS.items():
            if t1 in members and t2 in members:
                return INTRA_GROUP_CORR[name]
        return CROSS_GROUP_CORR
```

Notes on the details that matter:

- **Injectable RNGs.** `rng` and `np_rng` parameters make every statistical
  test reproducible. Without them the test suite is a coin flip.
- **Unrounded internal state.** `self._prices` holds full precision; only the
  returned value is rounded. Rounding the state would let the drift term get
  swallowed by the 2dp grid and pin prices in place.
- **`dict(TICKER_PARAMS.get(...))`.** The copy stops a later per-ticker tweak
  from mutating the shared module-level default.
- **`SEED_PRICES.get(ticker) or ...`.** A missing symbol gets a random seed in
  `FALLBACK_PRICE_RANGE`, so a user adding `PYPL` gets a plausible price
  immediately.

### 7.3 Why the Cholesky decomposition cannot fail

`np.linalg.cholesky` raises unless the matrix is positive definite, and the
matrix is rebuilt from arbitrary user-added tickers. That is exactly the kind of
thing that works for the ten default symbols and blows up in a demo, so it is
worth proving rather than hoping.

Write the correlation matrix by group. Every cross-pair is the same constant
`c = 0.3`, so:

```
C = c·J + blockdiag(B_tech, B_finance, B_rest)

B_tech    = (0.6 − c)·J + (1 − 0.6)·I    →  min eigenvalue 0.4
B_finance = (0.5 − c)·J + (1 − 0.5)·I    →  min eigenvalue 0.5
B_rest    =               (1 − c)·I      →  min eigenvalue 0.7
```

`J` (the all-ones matrix) is positive semi-definite, so
`λ_min(C) ≥ 0 + min(0.4, 0.5, 0.7) = 0.4 > 0` for **any** composition. The
bound is `1 − max(intra-group correlation)`.

Measured: `λ_min = 0.400000` for the default ten, and `0.400000` is also the
worst value across a sweep of 3,400 compositions (0–25 tech, 0–12 finance,
TSLA present or not, 0–25 unknown symbols) and for all-tech sets of 2, 10, 50
and 200 tickers (§14).

The guarantee holds only while `0 ≤ CROSS_GROUP_CORR ≤ min(INTRA_GROUP_CORR.values()) < 1`.
Break that invariant when editing `seed_prices.py` and the matrix can stop being
positive definite — hence the `try/except` fallback to uncorrelated moves, and
a test that asserts the invariant directly (§13).

### 7.4 What a tick actually looks like

A 1σ move per tick, at 1× acceleration, computed as `price × σ × √dt`:

| Ticker | σ | 1σ tick move | P(tick moves ≥ 1 cent) |
|---|---|---|---|
| JPM | 0.18 | 1.02¢ | 62.5% |
| AAPL | 0.22 | 1.22¢ | 68.1% |
| GOOGL | 0.25 | 1.27¢ | 69.5% |
| V | 0.17 | 1.39¢ | 71.8% |
| AMZN | 0.28 | 1.51¢ | 74.0% |
| MSFT | 0.20 | 2.45¢ | 83.8% |
| TSLA | 0.50 | 3.64¢ | 89.1% |
| META | 0.30 | 4.37¢ | 90.9% |
| NFLX | 0.35 | 6.11¢ | 93.5% |
| NVDA | 0.40 | 9.32¢ | 95.7% |

So 62–96% of ticks produce a visible cent-level change — the flash animation
fires often enough to feel alive without strobing. (The archived design
described these as "sub-cent" moves; they are cent-scale.)

### 7.5 The demo-pacing problem — a decision to make

Calibrated to real time, the simulator is faithful and **visually static**.
Expected 1σ price movement over a demo session:

| Ticker | 1 min | 10 min | 60 min |
|---|---|---|---|
| JPM | 0.06% | 0.18% | 0.44% |
| AAPL | 0.07% | 0.22% | 0.54% |
| NVDA | 0.13% | 0.40% | 0.99% |
| TSLA | 0.16% | 0.50% | 1.24% |

Ten minutes of watching AAPL moves it about 42 cents. The P&L chart is close to
a flat line and the portfolio heatmap barely changes colour — which is at odds
with `PLAN.md`'s stated goal of a data-rich terminal with visual drama. The
shock events supply the only real movement, roughly one every 50 seconds across
ten tickers.

`SIM_TIME_ACCELERATION` multiplies `dt`, compressing trading time. At 60× (one
real minute ≈ one trading hour):

| Ticker | 1 min | 10 min | 60 min |
|---|---|---|---|
| JPM | 0.44% | 1.41% | 3.45% |
| AAPL | 0.54% | 1.72% | 4.21% |
| NVDA | 0.99% | 3.13% | 7.66% |
| TSLA | 1.24% | 3.91% | 9.57% |

Per-tick moves scale by √60 ≈ 7.75×, so AAPL goes from ~1.2¢ to ~9.5¢ a tick —
livelier, still not absurd.

**Recommendation:** ship the default at `1.0` (faithful to the spec, which says
nothing about acceleration) and set `SIM_TIME_ACCELERATION=30` in
`.env.example` with a comment, so demos and screenshots are lively out of the
box while the physics stays honest. This is a product call, not a technical
one — it is flagged here rather than decided.

### 7.6 The async wrapper

```python
class SimulatorDataSource(MarketDataSource):
    """MarketDataSource driving GBMSimulator on a fixed-cadence asyncio task."""

    def __init__(
        self,
        price_cache: PriceCache,
        update_interval: float = 0.5,
        time_acceleration: float = 1.0,
        event_probability: float = 0.001,
    ) -> None:
        self._cache = price_cache
        self._interval = update_interval
        self._acceleration = time_acceleration
        self._event_prob = event_probability
        self._sim: GBMSimulator | None = None
        self._task: asyncio.Task | None = None
        self._lock = asyncio.Lock()

    async def start(self, tickers: list[str]) -> None:
        if self._task is not None:
            raise RuntimeError("SimulatorDataSource.start() called twice")

        self._sim = GBMSimulator(
            tickers=tickers,
            tick_seconds=self._interval,
            time_acceleration=self._acceleration,
            event_probability=self._event_prob,
        )
        # Seed the cache so the first SSE frame has data, and pin each
        # ticker's session_open to its seed price.
        for ticker in tickers:
            price = self._sim.get_price(ticker)
            if price is not None:
                self._cache.update(ticker, round(price, 2), session_open=round(price, 2))

        self._task = asyncio.create_task(self._run_loop(), name="simulator-loop")
        logger.info("Simulator started: %d tickers, %.0fms tick, %.0fx time",
                    len(tickers), self._interval * 1000, self._acceleration)

    async def stop(self) -> None:
        task, self._task = self._task, None
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        logger.info("Simulator stopped")

    async def add_ticker(self, ticker: str) -> None:
        async with self._lock:
            if not self._sim:
                return
            self._sim.add_ticker(ticker)
            price = self._sim.get_price(ticker)
            if price is not None:
                self._cache.update(ticker, round(price, 2), session_open=round(price, 2))

    async def remove_ticker(self, ticker: str) -> None:
        async with self._lock:
            if self._sim:
                self._sim.remove_ticker(ticker)
            self._cache.remove(ticker)

    def get_tickers(self) -> list[str]:
        return self._sim.get_tickers() if self._sim else []

    async def _run_loop(self) -> None:
        """Fixed-cadence loop: a monotonic deadline keeps the tick from drifting."""
        deadline = asyncio.get_running_loop().time()
        while True:
            deadline += self._interval
            try:
                async with self._lock:
                    prices = self._sim.step() if self._sim else {}
                for ticker, price in prices.items():
                    self._cache.update(ticker, price)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Simulator step failed; continuing")

            sleep_for = deadline - asyncio.get_running_loop().time()
            if sleep_for < 0:          # fell behind: resync rather than spin
                deadline = asyncio.get_running_loop().time()
                sleep_for = 0
            await asyncio.sleep(sleep_for)
```

Three things here are not incidental:

1. **`asyncio.Lock` around `step()` and ticker mutation.** `add_ticker` rebuilds
   the Cholesky factor and appends to `self._tickers`. If that interleaves with
   `step()` at an await point, the `z` vector and the ticker list disagree on
   length and prices land on the wrong symbols. The lock makes each an atomic
   unit.
2. **Deadline scheduling.** `await asyncio.sleep(interval)` gives a period of
   *interval + work time*, so the stream drifts slowly behind wall clock. Adding
   `interval` to a monotonic deadline and sleeping the remainder holds the
   cadence, with a resync if the loop ever falls behind.
3. **`except asyncio.CancelledError: raise` before the general handler.** Without
   it, the bare `except Exception` is fine (`CancelledError` derives from
   `BaseException` on 3.8+), but stating it makes the shutdown path explicit and
   survives someone later widening the handler to `BaseException`.

---

## 8. The Massive API client

### 8.1 Correcting the record on the API surface

The archived `planning/archive/MASSIVE_API.md` documents a response shape that
**does not match the shipped client**, and the previous implementation was built
against it. Verified against `massive` 2.8.0 (and confirmed identical in 2.0.1,
the oldest release on PyPI — no 1.x ever shipped):

| Archived doc / old code | Reality in `massive` 2.0.1 – 2.8.0 |
|---|---|
| `snap.last_trade.timestamp` | **Does not exist.** `LastTrade` has `sip_timestamp`, `participant_timestamp`, `trf_timestamp`. |
| timestamp in **milliseconds** | SIP timestamps are **nanoseconds**. |
| `snap.day.change_percent` | Does not exist. `day` is an `Agg`: `open/high/low/close/volume/vwap/timestamp/transactions/otc`. |
| `snap.day.previous_close` | Does not exist. Use `snap.prev_day.close` (an `Agg`). |
| — | Day change is available directly as `snap.todays_change` / `snap.todays_change_percent`. |

This was not a cosmetic error. The old `_poll_once` read
`snap.last_trade.timestamp / 1000.0` inside a `try/except (AttributeError, TypeError)`
that logged a warning and continued. Every snapshot would have raised
`AttributeError`, every ticker would have been skipped, and **Massive mode would
have written nothing to the cache at all** — while logging warnings rather than
failing. Reproduced: `AttributeError` (§14).

Confirmed `TickerSnapshot` fields in 2.8.0:

```
day, last_quote, last_trade, min, prev_day, ticker,
todays_change, todays_change_percent, updated, fair_market_value
```

and the call signature:

```python
client.get_snapshot_all(
    market_type: Union[str, SnapshotMarketType],
    tickers: Optional[Union[str, List[str]]] = None,
    ...
) -> Union[List[TickerSnapshot], HTTPResponse]
```

### 8.2 Timestamp normalisation

Massive mixes epoch units across fields — trade SIP timestamps in nanoseconds,
aggregate bar timestamps in milliseconds. Hard-coding a divisor per field is how
the previous version went wrong, and the failure is silent: a 10⁶ error puts a
price somewhere in the year 3.5 million, and the chart's x-axis quietly breaks.

Pick the divisor from the magnitude instead. There is no ambiguity in practice —
the four candidate interpretations of any real timestamp are 10³ apart, and only
one lands inside a plausible date window.

```python
def normalize_timestamp(raw: float | int | None) -> float | None:
    """Coerce a Massive epoch timestamp to Unix seconds.

    Massive returns epoch integers whose unit varies by field: `updated` and
    the trade SIP timestamps are nanoseconds, aggregate bar timestamps are
    milliseconds. Rather than hard-code a divisor per field - the mistake is
    silent, and a 1e6 error puts prices in the year 3.5 million - pick the
    divisor from the magnitude. Bounds are generous; anything outside them is
    rejected as unusable rather than guessed at.
    """
    if raw is None:
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    if value <= 0:
        return None

    for divisor in (1.0, 1e3, 1e6, 1e9):          # s, ms, us, ns
        seconds = value / divisor
        if 1e9 < seconds < 4e9:                    # 2001-09-09 .. 2096-10-02
            return seconds
    return None
```

### 8.3 Snapshot extraction

Snapshots degrade in normal operation: pre-market there is no `last_trade`,
thinly traded symbols have stale ones, and a bad symbol comes back nearly empty.
Extraction walks a fallback chain and returns `None` rather than raising, so one
bad symbol never costs the whole poll.

```python
@dataclass(frozen=True, slots=True)
class Quote:
    """The three fields FinAlly needs out of a snapshot."""

    ticker: str
    price: float
    timestamp: float | None      # Unix SECONDS, or None if unavailable
    session_open: float | None   # previous close, anchors daily change


def extract_quote(snap: TickerSnapshot) -> Quote | None:
    """Pull a Quote out of a snapshot, or None if it carries no usable price.

    Field names verified against massive 2.8.0 `TickerSnapshot`:
      - snap.last_trade   -> massive.rest.models.trades.LastTrade
                             (.price, .sip_timestamp, .participant_timestamp;
                              there is NO .timestamp attribute)
      - snap.min          -> MinuteSnapshot (.close, .timestamp)
      - snap.prev_day     -> Agg (.close)
      - snap.day          -> Agg (.open, .close) - .close is 0 pre-market
    """
    ticker = getattr(snap, "ticker", None)
    if not ticker:
        return None

    price: float | None = None
    timestamp: float | None = None

    trade = getattr(snap, "last_trade", None)
    if trade is not None and getattr(trade, "price", None):
        price = float(trade.price)
        timestamp = normalize_timestamp(
            getattr(trade, "sip_timestamp", None)
            or getattr(trade, "participant_timestamp", None)
        )

    if price is None:  # pre-market / thin tape: fall back to the minute bar
        minute = getattr(snap, "min", None)
        if minute is not None and getattr(minute, "close", None):
            price = float(minute.close)
            timestamp = normalize_timestamp(getattr(minute, "timestamp", None))

    if price is None:  # last resort: today's close so far
        day = getattr(snap, "day", None)
        if day is not None and getattr(day, "close", None):
            price = float(day.close)

    if price is None or price <= 0:
        return None

    if timestamp is None:
        timestamp = normalize_timestamp(getattr(snap, "updated", None))

    # Daily change anchors on the previous session's close, matching how every
    # broker quotes it. Fall back to today's open, then to nothing (the cache
    # then anchors on the first price it sees).
    session_open: float | None = None
    prev_day = getattr(snap, "prev_day", None)
    if prev_day is not None and getattr(prev_day, "close", None):
        session_open = float(prev_day.close)
    else:
        day = getattr(snap, "day", None)
        if day is not None and getattr(day, "open", None):
            session_open = float(day.open)

    return Quote(ticker=ticker, price=price, timestamp=timestamp, session_open=session_open)
```

Price fallback order: **last trade → current minute bar close → today's close**.
Anchor order: **previous day's close → today's open → none** (the cache then
anchors on the first price it sees, giving 0% until the next session).

`getattr(x, "price", None)` rather than `x.price` throughout: every field on
these models is `Optional`, and a truthiness check also rejects the `0.0` that
Massive returns for a symbol that has not traded yet.

### 8.4 The poller

```python
class MassiveDataSource(MarketDataSource):
    """Polls the Massive snapshot endpoint and writes into the PriceCache."""

    def __init__(
        self,
        api_key: str,
        price_cache: PriceCache,
        poll_interval: float = 15.0,
    ) -> None:
        self._api_key = api_key
        self._cache = price_cache
        self._interval = poll_interval
        self._tickers: list[str] = []
        self._task: asyncio.Task | None = None
        self._client: RESTClient | None = None
        self._lock = asyncio.Lock()
        self._consecutive_failures = 0

    async def start(self, tickers: list[str]) -> None:
        if self._task is not None:
            raise RuntimeError("MassiveDataSource.start() called twice")
        self._client = RESTClient(api_key=self._api_key)
        self._tickers = [t.upper().strip() for t in tickers]
        await self._poll_once()                       # data before the first frame
        self._task = asyncio.create_task(self._poll_loop(), name="massive-poller")
        logger.info("Massive poller started: %d tickers, %.1fs interval",
                    len(self._tickers), self._interval)

    async def stop(self) -> None:
        task, self._task = self._task, None
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._client = None
        logger.info("Massive poller stopped")

    async def add_ticker(self, ticker: str) -> None:
        ticker = ticker.upper().strip()
        async with self._lock:
            if ticker not in self._tickers:
                self._tickers.append(ticker)
        await self._poll_once()   # don't make the user wait up to a full interval

    async def remove_ticker(self, ticker: str) -> None:
        ticker = ticker.upper().strip()
        async with self._lock:
            self._tickers = [t for t in self._tickers if t != ticker]
        self._cache.remove(ticker)

    def get_tickers(self) -> list[str]:
        return list(self._tickers)

    # --- internals ---

    async def _poll_loop(self) -> None:
        while True:
            await asyncio.sleep(self._backoff_interval())
            await self._poll_once()

    def _backoff_interval(self) -> float:
        """Back off on repeated failures, capped at 5 minutes."""
        if self._consecutive_failures == 0:
            return self._interval
        return min(self._interval * 2 ** min(self._consecutive_failures, 5), 300.0)

    async def _poll_once(self) -> None:
        async with self._lock:
            tickers = list(self._tickers)
        if not tickers or self._client is None:
            return

        try:
            snapshots = await asyncio.to_thread(self._fetch_snapshots, tickers)
        except Exception as exc:
            self._consecutive_failures += 1
            logger.error("Massive poll failed (%d in a row, next in %.0fs): %s",
                         self._consecutive_failures, self._backoff_interval(), exc)
            return

        self._consecutive_failures = 0
        wanted = set(tickers)
        applied = 0
        for snap in snapshots:
            quote = extract_quote(snap)
            if quote is None or quote.ticker not in wanted:
                continue
            self._cache.update(
                ticker=quote.ticker,
                price=quote.price,
                timestamp=quote.timestamp,
                session_open=quote.session_open,
            )
            applied += 1

        if applied < len(tickers):
            logger.warning("Massive poll: %d/%d tickers updated", applied, len(tickers))
        else:
            logger.debug("Massive poll: %d tickers updated", applied)

    def _fetch_snapshots(self, tickers: list[str]) -> list[TickerSnapshot]:
        """Blocking REST call(s). Runs in a worker thread."""
        results: list[TickerSnapshot] = []
        for i in range(0, len(tickers), MAX_TICKERS_PER_REQUEST):
            chunk = tickers[i:i + MAX_TICKERS_PER_REQUEST]
            results.extend(
                self._client.get_snapshot_all(
                    market_type=SnapshotMarketType.STOCKS,
                    tickers=chunk,
                )
            )
        return results
```

with the module header:

```python
from massive import RESTClient
from massive.rest.models import SnapshotMarketType, TickerSnapshot

# get_snapshot_all sends the ticker list as a query parameter; keep each
# request well inside URL-length limits and the documented 250-symbol cap.
MAX_TICKERS_PER_REQUEST = 100
```

Decisions worth defending:

| Decision | Reason |
|---|---|
| Imports at module top, not lazy inside methods | Lazy imports are what made the old tests unpatchable (`patch("...RESTClient")` on a name that did not exist). Optionality belongs in the **factory** (§9), which is the one place that knows whether Massive is in play. |
| `asyncio.to_thread` for the REST call | `RESTClient` is synchronous urllib3. Calling it on the event loop would stall the SSE stream for the duration of the request. |
| Exponential backoff, capped at 300 s | A bad key returns 401 forever. Hammering it every 15 s fills the log and risks a ban; the cap keeps recovery bounded once the key is fixed. |
| `wanted` set filter | The endpoint can return symbols that were not asked for; without the filter a removed ticker could reappear in the cache. |
| Chunking at 100 symbols | The ticker list rides in the query string. One request per 100 keeps URLs sane and stays inside the 250 cap. Free tier (5 req/min) gets one chunk in practice. |
| Snapshot the ticker list under the lock, then release | The HTTP call must not hold a lock that `add_ticker` needs. |
| `add_ticker` triggers an immediate poll | Otherwise the new row is blank for up to 15 s. It costs one request against the rate limit, which is the right trade for a user-initiated action. |

**Market hours.** Outside the session, snapshots stop changing and the cache
goes static — correct behaviour, but the UI will look frozen. The `timestamp`
field carries the real trade time, so the frontend can show staleness. The
simulator has no such notion and runs continuously; that asymmetry is inherent
to the two sources and is not worth papering over.

---

## 9. Factory

```python
"""Selects the market data source from configuration."""

from __future__ import annotations

import logging

from .cache import PriceCache
from .config import MarketConfig
from .interface import MarketDataSource
from .simulator import SimulatorDataSource

logger = logging.getLogger(__name__)


def create_market_data_source(
    price_cache: PriceCache,
    config: MarketConfig | None = None,
) -> MarketDataSource:
    """Return an unstarted MarketDataSource. Caller awaits source.start(tickers)."""
    config = config or MarketConfig.from_env()

    if config.use_massive:
        # Imported here so a simulator-only deployment - and every unit test -
        # never needs the `massive` package installed.
        from .massive_client import MassiveDataSource

        logger.info("Market data: Massive REST API (%.0fs poll)", config.massive_poll_interval)
        return MassiveDataSource(
            api_key=config.massive_api_key,
            price_cache=price_cache,
            poll_interval=config.massive_poll_interval,
        )

    logger.info("Market data: GBM simulator (%.0fms tick, %.0fx time)",
                config.sim_interval * 1000, config.sim_time_acceleration)
    return SimulatorDataSource(
        price_cache=price_cache,
        update_interval=config.sim_interval,
        time_acceleration=config.sim_time_acceleration,
        event_probability=config.sim_event_probability,
    )
```

The function-level import of `MassiveDataSource` is the **only** lazy import in
the subsystem, and it is here rather than inside `massive_client` on purpose:
one deferral point, in the one function that knows whether Massive is wanted,
leaves `massive_client`'s own module namespace fully populated and therefore
patchable by tests.

`config` is an injectable parameter so tests configure the factory without
mutating `os.environ`.

---

## 10. SSE streaming endpoint

```python
"""SSE streaming endpoint for live price updates."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from .cache import PriceCache

logger = logging.getLogger(__name__)

PUSH_INTERVAL = 0.5        # seconds between change checks
HEARTBEAT_INTERVAL = 15.0  # max seconds of silence before a keepalive comment
RETRY_MS = 1000            # EventSource reconnect delay advertised to the client


def create_stream_router(
    price_cache: PriceCache,
    push_interval: float = PUSH_INTERVAL,
    heartbeat_interval: float = HEARTBEAT_INTERVAL,
) -> APIRouter:
    """Build the SSE router. A fresh APIRouter per call keeps this re-entrant."""
    router = APIRouter(prefix="/api/stream", tags=["streaming"])

    @router.get("/prices")
    async def stream_prices(request: Request) -> StreamingResponse:
        return StreamingResponse(
            price_event_generator(price_cache, request, push_interval, heartbeat_interval),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",   # don't let nginx buffer the stream
            },
        )

    return router


def format_frame(prices: dict) -> str:
    payload = json.dumps({t: u.to_dict() for t, u in prices.items()}, separators=(",", ":"))
    return f"data: {payload}\n\n"


async def price_event_generator(
    price_cache: PriceCache,
    request: Request,
    push_interval: float = PUSH_INTERVAL,
    heartbeat_interval: float = HEARTBEAT_INTERVAL,
) -> AsyncGenerator[str, None]:
    """Yield SSE frames: a full snapshot whenever the cache version moves.

    Full snapshots rather than deltas: ten tickers is ~2.1 KB per frame
    (~4.2 KiB/s at 2 Hz), and a stateless frame means a reconnecting client is
    immediately correct with no replay logic.
    """
    yield f"retry: {RETRY_MS}\n\n"

    loop = asyncio.get_running_loop()
    last_sent_version = -1
    last_output = loop.time()
    client = request.client.host if request.client else "unknown"
    logger.info("SSE client connected: %s", client)

    try:
        while True:
            if await request.is_disconnected():
                break

            version, prices = price_cache.snapshot()

            if version != last_sent_version and prices:
                yield format_frame(prices)
                # Advanced only after a frame actually goes out, so an empty
                # cache at startup can't cause the first real snapshot to be skipped.
                last_sent_version = version
                last_output = loop.time()
            elif loop.time() - last_output >= heartbeat_interval:
                # A comment line keeps proxies and load balancers from reaping
                # an idle connection. Massive polls every 15s, so idle gaps are real.
                yield ": keepalive\n\n"
                last_output = loop.time()

            await asyncio.sleep(push_interval)
    except asyncio.CancelledError:
        raise
    finally:
        logger.info("SSE client disconnected: %s", client)
```

### Wire format

```
retry: 1000

data: {"AAPL":{"ticker":"AAPL","price":190.25,"previous_price":190.0,"session_open":189.1,
"timestamp":1758412800.123,"change":0.25,"change_percent":0.1316,"direction":"up",
"day_change":1.15,"day_change_percent":0.6081},"GOOGL":{...}}

: keepalive

data: {...}
```

Client side:

```javascript
const es = new EventSource("/api/stream/prices");
es.onmessage = (e) => {
  const prices = JSON.parse(e.data);       // { AAPL: {...}, GOOGL: {...} }
  for (const [ticker, u] of Object.entries(prices)) {
    applyPrice(ticker, u);                  // u.direction drives the flash class
  }
};
es.onerror = () => setConnectionStatus("reconnecting");  // EventSource retries itself
es.onopen  = () => setConnectionStatus("connected");
```

Comment lines (`: keepalive`) never fire `onmessage`, so the client needs no
special handling for them.

### Why these choices

- **Full snapshot per frame, not deltas.** Measured at 2,133 bytes for ten
  tickers with compact JSON separators — 4.2 KiB/s per client at 2 Hz. Deltas
  would save perhaps 40% and cost reconnect-replay logic on both ends. Not
  worth it.
- **Heartbeat.** Under Massive the cache changes every 15 s, so a
  change-triggered stream can sit silent long enough for an idle proxy to reap
  the connection. `EventSource` would reconnect, but each cycle costs a
  reconnect and a flash of "reconnecting" in the header. A comment every 15 s of
  silence prevents it. The simulator never idles, so this costs nothing there.
- **`last_sent_version` advances only after a successful yield.** The obvious
  version of this loop records the version before checking `if prices:`. With an
  empty cache at startup that marks the version as sent without sending, and if
  no further write follows, the client never receives that snapshot.
- **Router built inside the factory.** A module-level `APIRouter` shared across
  calls would register `/prices` twice if the factory ran twice — which tests do
  routinely.
- **Poll the cache rather than subscribe to it.** A pub/sub cache would need
  per-client queues, backpressure handling and disconnect cleanup. Polling a
  version integer at 2 Hz is O(1) per client and cannot leak a subscription.
  With one user (`PLAN.md` §3) the trade is not close.
- **`no-transform` in `Cache-Control`.** Stops intermediaries from recompressing
  or buffering the stream, alongside `X-Accel-Buffering: no` for nginx.

---

## 11. Application wiring

```python
"""FastAPI application factory."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.market import (
    MarketConfig, PriceCache, create_market_data_source, create_stream_router,
)
from app.db import get_watchlist_tickers, init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()                                   # lazy schema + seed (PLAN S7)

    cache = PriceCache()
    config = MarketConfig.from_env()
    source = create_market_data_source(cache, config)

    app.state.price_cache = cache
    app.state.market_source = source

    tickers = get_watchlist_tickers()           # seeded default watchlist
    await source.start(tickers)
    try:
        yield
    finally:
        await source.stop()


def create_app() -> FastAPI:
    app = FastAPI(lifespan=lifespan, title="FinAlly")
    app.include_router(create_stream_router(app.state.price_cache))
    # ... portfolio, watchlist, chat routers, then the static-file mount last
    return app
```

> Careful: `app.state.price_cache` is not set until `lifespan` runs, which is
> after `create_app()` returns. Either construct the cache in `create_app()` and
> hand it to `lifespan` via a closure, or build the stream router inside
> `lifespan` and `app.include_router` there. The closure form is clearer:

```python
def create_app() -> FastAPI:
    cache = PriceCache()
    config = MarketConfig.from_env()
    source = create_market_data_source(cache, config)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        init_db()
        app.state.price_cache = cache
        app.state.market_source = source
        await source.start(get_watchlist_tickers())
        try:
            yield
        finally:
            await source.stop()

    app = FastAPI(lifespan=lifespan, title="FinAlly")
    app.include_router(create_stream_router(cache))
    return app
```

Dependency for other routers:

```python
from fastapi import Depends, Request

def get_price_cache(request: Request) -> PriceCache:
    return request.app.state.price_cache

def get_market_source(request: Request) -> MarketDataSource:
    return request.app.state.market_source
```

Consumers:

```python
# Portfolio valuation
@router.get("/api/portfolio")
async def get_portfolio(cache: PriceCache = Depends(get_price_cache)):
    positions = db_load_positions()
    for p in positions:
        p.current_price = cache.get_price(p.ticker) or p.avg_cost   # see below
    ...

# Trade execution fills at the cached price
@router.post("/api/portfolio/trade")
async def trade(req: TradeRequest, cache: PriceCache = Depends(get_price_cache)):
    price = cache.get_price(req.ticker)
    if price is None:
        raise HTTPException(400, f"No market price available for {req.ticker}")
    ...
```

**Cache miss during valuation.** A position can exist for a ticker no longer on
the watchlist (bought, then removed), so the cache has no price. Valuing it at
`avg_cost` reports 0% P&L rather than crashing or reporting a 100% loss. The
alternative — keeping prices flowing for any ticker with an open position — is
better and cheap: have the watchlist-removal path check for an open position
first (§12).

---

## 12. Watchlist coordination

The watchlist lives in SQLite; the active ticker set lives in the data source.
They are kept in step by the route handlers, in an order chosen so a failure
cannot leave them disagreeing.

**Adding** (`POST /api/watchlist`, and the LLM's `watchlist_changes`):

```python
@router.post("/api/watchlist")
async def add_to_watchlist(
    req: WatchlistRequest,
    source: MarketDataSource = Depends(get_market_source),
    cache: PriceCache = Depends(get_price_cache),
):
    ticker = req.ticker.upper().strip()
    if not ticker.isalpha() or not (1 <= len(ticker) <= 5):
        raise HTTPException(400, f"Invalid ticker: {req.ticker!r}")

    db_add_watchlist(ticker)          # UNIQUE(user_id, ticker) makes this idempotent
    await source.add_ticker(ticker)   # seeds a price; Massive polls immediately
    return {"ticker": ticker, "price": cache.get_price(ticker)}
```

DB first, then the source: if the process dies between the two, the ticker is
in the watchlist and gets picked up on the next start. The reverse order would
stream a ticker that no longer exists after a restart.

**Removing** (`DELETE /api/watchlist/{ticker}`):

```python
@router.delete("/api/watchlist/{ticker}")
async def remove_from_watchlist(
    ticker: str,
    source: MarketDataSource = Depends(get_market_source),
):
    ticker = ticker.upper().strip()
    db_remove_watchlist(ticker)

    # Keep prices flowing for anything still held, or its P&L freezes.
    if db_get_position(ticker) is None:
        await source.remove_ticker(ticker)
    return {"ticker": ticker, "removed": True}
```

The position check is what stops the cache-miss case in §11 from arising in
normal use: a held ticker keeps streaming even when it leaves the watchlist.

**On trade execution**, a buy of a ticker that is not tracked should add it:

```python
if cache.get_price(ticker) is None:
    await source.add_ticker(ticker)
    price = cache.get_price(ticker)
```

Ticker validation belongs in the route, not the data source. The simulator
accepts anything (it invents a seed price), so `FAKE` would happily stream a
made-up price; the `isalpha()` and length checks keep obvious nonsense out.
Massive simply returns no snapshot for an unknown symbol, and the poll logs
`n-1/n tickers updated`.

---

## 13. Testing strategy

`PLAN.md` §12 asks for simulator validity, GBM correctness, Massive parsing, and
interface conformance. Roughly 60 tests across eight modules.

### 13.1 What to test where

| Module | Focus |
|---|---|
| `test_models.py` | Both change calculations, `direction` at all three branches, zero-denominator guards, `to_dict()` keys, immutability. |
| `test_cache.py` | First-update semantics (`previous_price == price`), anchor persistence across updates, anchor override, `remove()` bumping the version, `snapshot()` consistency, concurrent writers. |
| `test_simulator.py` | Seeding, add/remove, Cholesky rebuild, unknown-ticker seeding, `n=0` and `n=1`, correlation lookup table. |
| `test_gbm_stats.py` | Monte Carlo: realised σ, realised correlations, shock frequency. |
| `test_massive.py` | `normalize_timestamp` across units, `extract_quote` across degraded snapshots, poll applies to cache, backoff, unwanted-ticker filtering. |
| `test_factory.py` | Selection by key, whitespace key, config injection. |
| `test_config.py` | Junk values, out-of-range values, defaults. |
| `test_stream.py` | Frame sequence, heartbeat, disconnect, router re-entrancy. |

### 13.2 Testing SSE — do not use `httpx.ASGITransport`

`httpx.ASGITransport` **buffers the entire response body**. Pointed at an
endless `text/event-stream` it never yields headers and the test hangs
(verified: a finite 3-chunk stream arrives as 1 buffered chunk; an endless one
times out before `r.status_code` is readable). The prior review recommended
exactly this approach; it does not work.

Test the generator directly with a stub request, and cover the HTTP wiring in
the Playwright E2E suite, which drives a real uvicorn server:

```python
class FakeRequest:
    """Minimal stand-in for starlette.Request as the generator uses it."""
    def __init__(self):
        self.client = type("C", (), {"host": "test"})()
        self._disconnected = False
    async def is_disconnected(self):
        return self._disconnected
    def disconnect(self):
        self._disconnected = True


async def collect(gen, n, timeout=3.0):
    """Pull up to n frames off the generator, giving up after `timeout`."""
    out = []
    async def run():
        async for frame in gen:
            out.append(frame)
            if len(out) >= n:
                return
    try:
        await asyncio.wait_for(run(), timeout)
    except asyncio.TimeoutError:
        pass
    return out


async def test_sse_frame_sequence():
    cache = PriceCache()
    req = FakeRequest()
    gen = price_event_generator(cache, req, push_interval=0.01, heartbeat_interval=0.10)

    assert await collect(gen, 1) == ["retry: 1000\n\n"]
    assert await collect(gen, 1) == [": keepalive\n\n"]      # empty cache, no bogus frame

    cache.update("AAPL", 190.00, session_open=189.10)
    frame = (await collect(gen, 1))[0]
    payload = json.loads(frame.removeprefix("data: "))
    assert payload["AAPL"]["day_change_percent"] == 0.4759
    assert payload["AAPL"]["direction"] == "flat"

    assert await collect(gen, 1) == [": keepalive\n\n"]      # version unchanged

    cache.update("AAPL", 190.25)
    payload = json.loads((await collect(gen, 1))[0].removeprefix("data: "))
    assert payload["AAPL"]["direction"] == "up"
    assert payload["AAPL"]["session_open"] == 189.10         # anchor survives

    cache.remove("AAPL")
    ...

    req.disconnect()
    assert await collect(gen, 5, timeout=1.0) == []          # stream ends
```

### 13.3 Statistical tests for the GBM

These are the tests that actually prove the maths, and they need seeded RNGs to
be stable. Measured values are in §14.

```python
def test_realised_volatility_matches_sigma():
    sim = GBMSimulator(["AAPL"], tick_seconds=0.5, time_acceleration=1.0,
                       event_probability=0.0,              # isolate the diffusion
                       np_rng=np.random.default_rng(7))
    prev, logret = sim.get_price("AAPL"), []
    for _ in range(200_000):
        sim.step()
        cur = sim._prices["AAPL"]
        logret.append(math.log(cur / prev))
        prev = cur

    realised = np.std(logret, ddof=1) / math.sqrt(sim.dt)
    assert abs(realised - 0.22) / 0.22 < 0.02     # measured: 0.2198 (0.09% error)


def test_correlation_materialises():
    sim = GBMSimulator(["AAPL", "MSFT"], event_probability=0.0,
                       np_rng=np.random.default_rng(11))
    # ... collect 100k paired log returns ...
    assert abs(np.corrcoef(a, m)[0, 1] - 0.6) < 0.02          # measured: 0.6011


def test_tsla_is_uncorrelated_with_tech():
    # same shape, AAPL/TSLA, target 0.3                        # measured: 0.2975
    ...
```

Do **not** assert on the drift `μ`: over 200,000 ticks its standard error is
about 1.69 against a target of 0.05, so any such test is pure noise. (Measured
realised μ: 0.77 — entirely consistent with a true 0.05 at that error.) Drift is
covered by the σ test and by reading the formula.

Assert the correlation invariant directly, since §7.3's proof depends on it:

```python
def test_correlation_constants_keep_matrix_positive_definite():
    assert 0 <= CROSS_GROUP_CORR <= min(INTRA_GROUP_CORR.values()) < 1

def test_cholesky_succeeds_for_default_watchlist():
    sim = GBMSimulator(DEFAULT_TICKERS)
    assert sim._cholesky is not None
    assert len(sim.step()) == 10
```

### 13.4 Massive tests without an API key

All the parsing logic is pure and takes a `TickerSnapshot`, so build one from a
realistic wire payload — no network, no key, no mocking of the client:

```python
RAW = {
    "ticker": "AAPL",
    "todaysChange": 1.35, "todaysChangePerc": 0.71, "updated": 1758412800123456789,
    "day":     {"o": 189.10, "h": 191.20, "l": 188.55, "c": 190.45, "v": 51_200_000},
    "prevDay": {"o": 187.00, "h": 189.90, "l": 186.40, "c": 189.10, "v": 48_900_000},
    "lastTrade": {"p": 190.45, "s": 100, "t": 1758412800123456789, "x": 11},
    "min": {"o": 190.30, "h": 190.50, "l": 190.20, "c": 190.45, "t": 1758412800000},
}

def test_extract_quote_matches_massives_own_day_change():
    snap = TickerSnapshot.from_dict(RAW)
    q = extract_quote(snap)
    assert q.price == 190.45 and q.session_open == 189.10
    assert abs(q.timestamp - 1758412800.1234567) < 1e-3       # ns -> s

    u = PriceCache().update(q.ticker, q.price, q.timestamp, q.session_open)
    # our computed daily change agrees with the figure Massive reports itself
    assert abs(u.day_change_percent - snap.todays_change_percent) < 0.01


@pytest.mark.parametrize("raw,expected_price", [
    ({"ticker": "X", "min": {"c": 50.5, "t": 1758412800000}, "prevDay": {"c": 50.0}}, 50.5),
    ({"ticker": "Y", "day": {"c": 12.25, "o": 12.00}}, 12.25),
])
def test_extract_quote_fallback_chain(raw, expected_price):
    assert extract_quote(TickerSnapshot.from_dict(raw)).price == expected_price


@pytest.mark.parametrize("raw", [
    {"ticker": "W", "lastTrade": {"p": 0}},   # zero price
    {"lastTrade": {"p": 10.0}},               # no ticker
    {},                                        # empty
])
def test_extract_quote_rejects_unusable(raw):
    assert extract_quote(TickerSnapshot.from_dict(raw)) is None
```

For the poller itself, patch `_fetch_snapshots` on the instance — it is the
single blocking seam, and patching it needs neither a live client nor a network:

```python
async def test_poll_applies_snapshots_to_cache():
    cache = PriceCache()
    src = MassiveDataSource("key", cache, poll_interval=999)
    src._client = object()                        # non-None sentinel
    src._tickers = ["AAPL"]
    src._fetch_snapshots = lambda tickers: [TickerSnapshot.from_dict(RAW)]

    await src._poll_once()
    assert cache.get_price("AAPL") == 190.45
    assert cache.get("AAPL").session_open == 189.10
```

### 13.5 Interface conformance

Run the same contract against both implementations:

```python
@pytest.mark.parametrize("make_source", [make_simulator, make_fake_massive])
async def test_source_contract(make_source):
    cache = PriceCache()
    src = make_source(cache)

    await src.start(["AAPL", "GOOGL"])
    assert cache.get_price("AAPL") is not None        # seeded before start() returns
    with pytest.raises(RuntimeError):
        await src.start(["AAPL"])                     # double start is loud

    await src.add_ticker("MSFT")
    assert "MSFT" in src.get_tickers()

    await src.remove_ticker("GOOGL")
    assert "GOOGL" not in src.get_tickers() and "GOOGL" not in cache

    await src.stop()
    version = cache.version
    await asyncio.sleep(0.3)
    assert cache.version == version                   # no writes after stop
    await src.stop()                                  # idempotent
```

### 13.6 Dependencies

```toml
[project]
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "numpy>=2.0.0",
    "massive>=2.0.1",       # no 1.x was ever published
]

[project.optional-dependencies]
dev = ["pytest>=8.3.0", "pytest-asyncio>=0.24.0", "pytest-cov>=5.0.0", "ruff>=0.7.0"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["app"]          # without this, `uv sync` and the Docker build fail

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
asyncio_default_fixture_loop_scope = "function"
```

Two notes. The archived pyproject pinned `massive>=1.0.0`; PyPI has
`0.0.1, 0.0.2, 2.0.1 … 2.8.0` and no 1.x, so the floor was meaningless — use
`>=2.0.1`, the oldest release whose model layout matches this design.
`[tool.hatch.build.targets.wheel]` is not optional: hatchling cannot infer the
package layout and `uv sync` fails with *"Unable to determine which files to
ship inside the wheel."*

---

## 14. Verified facts and open decisions

### 14.1 What was measured

Every number in this document came from an execution, not from recall. The
prototype in §3–§10 was run in full; these are the results.

**Environment:** `massive` 2.8.0 (and 2.0.1 for the field-history check),
`numpy` 2.4.6, `fastapi` 0.141.1, `httpx` 0.28.1, Python 3.12.

| Claim | Method | Result |
|---|---|---|
| `TRADING_SECONDS_PER_YEAR = 5,896,800` | `252 × 6.5 × 3600` | exact |
| `dt = 8.479 × 10⁻⁸` at 1× | `0.5 / 5,896,800` | `8.479175e-08` |
| GBM produces the configured σ | 200,000-tick Monte Carlo, shocks off, seeded | σ target 0.22, realised **0.2198** (0.09% error) |
| Tech pairs correlate at 0.6 | 100,000 paired log returns, AAPL/MSFT | **0.6011** |
| TSLA correlates at 0.3 | 100,000 paired log returns, AAPL/TSLA | **0.2975** |
| Shocks fire at the configured rate | 100,000 ticks at p=0.001 | 126 observed (≈100 expected); ≈1 per 50 s across 10 tickers at 2 Hz |
| Cholesky holds for the default 10 | `eigvalsh` + `cholesky` | λ_min = **0.400000**, succeeds |
| Cholesky holds for any composition | 3,400-case sweep (0–25 tech, 0–12 finance, ±TSLA, 0–25 unknown) plus all-tech sets of 2/10/50/200 | worst λ_min = **0.400000** everywhere |
| Per-tick moves are cent-scale | `price × σ × √dt`, normal tail probability | 1.0¢–9.3¢ at 1σ; 62.5%–95.7% of ticks move ≥1¢ (§7.4) |
| Demo pacing is slow at 1× | `σ × √(seconds / TSPY)` | AAPL 0.22% over 10 min (§7.5) |
| `LastTrade` has no `.timestamp` | attribute check on 2.8.0 and 2.0.1 | fields are `trf_timestamp`, `sip_timestamp`, `participant_timestamp` |
| Old code path fails | `snap.last_trade.timestamp / 1000.0` | raises `AttributeError` |
| `extract_quote` agrees with Massive | computed vs `todaysChangePerc` on the same snapshot | ours `0.7139`, Massive `0.71` |
| `normalize_timestamp` handles all units | s / ms / µs / ns of the same instant | all within 1 s of the target; junk (`None`, `0`, `-5`, `""`, `"abc"`, `NaN`) → `None` |
| Degraded snapshots don't raise | 6 shapes: minute-bar only, day-close only, no `prevDay`, zero price, no ticker, empty | correct value or `None`, no exception |
| Cache is thread-safe | 8 threads × 3,000 writes | version = 24,000, exactly as expected |
| SSE contract | 9 assertions on the generator | retry line first; no frame on empty cache; snapshot on change; no duplicate on unchanged version; heartbeat during idle; anchor survives; removal propagates; clean disconnect; router re-entrant |
| SSE frame size | `format_frame` on 10 tickers | **2,133 bytes** → 4.2 KiB/s per client at 2 Hz |
| `ASGITransport` can't test SSE | endless `StreamingResponse` through `httpx.ASGITransport` | times out before headers; finite stream arrives fully buffered |
| Factory selection | `""`, `"   "`, `"abc123"`, unset | simulator / simulator / Massive / simulator |
| Config validation | `"banana"`, `999999`, `"60"` | falls back / falls back / accepted |
| `massive` version history | PyPI release list | `0.0.1, 0.0.2, 2.0.1 … 2.8.0` — no 1.x |

Not verified: the live Massive API was unreachable from this environment
(network policy, and no key), so §8 is validated against the shipped client's
models and a hand-built wire payload, not against a real response. The claim
that SIP timestamps are nanoseconds is from the field semantics rather than
observation — which is exactly why `normalize_timestamp` infers the unit from
magnitude instead of trusting it.

### 14.2 Changes from the archived design

`planning/archive/MARKET_DATA_DESIGN.md` (recoverable from git at `5594a85`)
described an earlier iteration. What differs and why:

| # | Change | Reason |
|---|---|---|
| 1 | Massive field names corrected; `extract_quote` added | The old client read `snap.last_trade.timestamp`, which has never existed. Inside a `try/except AttributeError` that logged and continued, this means **Massive mode would have populated nothing**. |
| 2 | `normalize_timestamp` infers the unit | The old code divided by 1,000 treating ns as ms — a 10⁶ error, silent. |
| 3 | `session_open` + `day_change_percent` added to the model | `PLAN.md` §10 requires a "daily change %" column; the old `change_percent` was tick-over-tick and nothing supplied a session anchor. |
| 4 | Heartbeat frames | Under Massive's 15 s poll the stream can idle long enough for a proxy to reap it. |
| 5 | `cache.snapshot()` | Reading `version` and `get_all()` separately can drop an update. |
| 6 | `last_sent_version` advances only after a yield | The old ordering could skip the first snapshot when the cache started empty. |
| 7 | Router built inside the factory | A module-level `APIRouter` double-registers `/prices` if the factory runs twice. |
| 8 | `version` property takes the lock | Consistency, and correctness on free-threaded builds. |
| 9 | Deadline-based loop scheduling | `sleep(interval)` gives a period of *interval + work*, drifting behind wall clock. |
| 10 | `asyncio.Lock` around `step()` / ticker mutation | A rebuild interleaved with a step misaligns the `z` vector with the ticker list. |
| 11 | Lazy import moved to the factory | Lazy imports inside `massive_client` left the module namespace unpatchable — the direct cause of the 5 failing tests in the old review. |
| 12 | Backoff, chunking, `wanted` filter, immediate poll on add | Rate-limit safety, URL-length safety, correctness, responsiveness. |
| 13 | `start()` twice raises | The old contract called it "undefined behavior"; it leaked a task. |
| 14 | `TSLA_CORR` / `DEFAULT_CORR` replaced by `INDEPENDENT_TICKERS` and one `CROSS_GROUP_CORR` | The old review flagged `DEFAULT_CORR` as defined-but-unused with misleading naming. |
| 15 | Injectable RNGs, `MarketConfig` | Reproducible statistical tests; env config without `os.environ` mutation. |
| 16 | SSE tested via the generator, not `ASGITransport` | The old review's recommended approach hangs. |
| 17 | `massive>=2.0.1` | No 1.x was ever published. |

### 14.3 Decisions for a human

1. **`SIM_TIME_ACCELERATION` default.** `1.0` is faithful; the app then looks
   nearly static over a 10-minute demo (§7.5). Recommendation: default `1.0` in
   code, `30` in `.env.example`. This is a product call.
2. **SSE payload is a superset of `PLAN.md` §6.** The plan lists ticker, price,
   previous price, timestamp and direction; this design adds `session_open`,
   `change`, `change_percent`, `day_change` and `day_change_percent`. The
   addition is what makes §10's "daily change %" column possible. Purely
   additive, so no frontend contract breaks — but it is a deviation from the
   written spec and should be acknowledged rather than discovered.
3. **Market-hours behaviour under Massive.** Outside the session the cache is
   static and the UI looks frozen. The `timestamp` field supports a staleness
   indicator; whether to build one is a UI decision.

### 14.4 A note on repository state

`CLAUDE.md` states that the market data component "has been completed and is
summarized in the file `planning/MARKET_DATA_SUMMARY.md` with more details in
the `planning/archive` folder." Neither that file nor the `planning/archive`
directory exists in the working tree — commit `5b828e9` ("remove everything to
start over") deleted them along with `backend/`. They remain recoverable at
commit `5594a85`:

```bash
git show 5594a85:planning/MARKET_DATA_SUMMARY.md
git show 5594a85:backend/app/market/simulator.py
git archive 5594a85 | tar -x -C /tmp/prior   # the whole prior tree
```

Given that the implementation is gone, this document treats market data as work
still to be done. `CLAUDE.md` should be updated to match — either restore the
summary and archive, or drop the paragraph claiming the component is complete.
