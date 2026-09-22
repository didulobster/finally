# Market Simulator — Approach & Code Structure

> **Archived.** Baseline design. Canonical decisions are in `../MARKET_DATA_SUMMARY.md`; this file keeps the full code and validation.

The simulator is FinAlly's default market data source. It is used whenever `MASSIVE_API_KEY` is empty. It generates realistic-looking prices in-process with no network and no API key. It implements the `MarketDataSource` interface from `MARKET_INTERFACE.md`, so the rest of the app cannot tell it apart from real data.

All code below was run and checked (Python 3.12, numpy 2.5). The results are in §6.

## 1. Requirements (from PLAN.md §6)

| Requirement | How it is met |
|---|---|
| Geometric Brownian motion with per-ticker drift and volatility | `TICKER_PARAMS` (μ, σ) + exact GBM step |
| Updates about every 500ms | `SimulatorDataSource` loop, `interval=0.5` |
| Correlated moves (tech moves together) | Sector correlation matrix → Cholesky factor → correlated normals |
| Occasional 2–5% "events" | Per-tick Bernoulli shock with a random sign |
| Realistic seed prices | `SEED_PRICES` (AAPL 190, GOOGL 175, …) |
| In-process, no dependencies | One asyncio task; numpy is the only extra dependency |

## 2. The math

### 2.1 GBM step

For each ticker, with annualised drift μ and volatility σ, over a time step Δt (in years):

```
S(t+Δt) = S(t) · exp( (μ − σ²/2)·Δt + σ·√Δt·Z )      Z ~ N(0, 1)
```

This is the exact solution of the GBM SDE, not an Euler approximation, so prices can never go negative.

**Δt:** one 500ms tick as a fraction of a trading year:

```
Δt = 0.5 / (252 days × 6.5 h × 3600 s) ≈ 8.48e-8
```

The simulated market runs at real-time speed, so volatility looks realistic. For AAPL (σ = 0.22) the per-tick standard deviation is about 0.006%, roughly one cent. That is small but visible at 2 decimals, so the flash animation fires on most ticks.

### 2.2 Correlation

Draw independent normals `z ~ N(0, I)`, then set `Z = L · z`, where `L` is the Cholesky factor of the correlation matrix `C` (`C = L·Lᵀ`). `Z` then has correlation `C`.

`C` is built from sectors:

| Pair | ρ |
|---|---|
| Same sector (tech–tech, finance–finance) | 0.6 |
| Different sectors / unknown ticker | 0.3 |
| Anything with TSLA | 0.3 (TSLA does its own thing) |

This matrix is positive definite for any number of tickers: it is an equicorrelated 0.3 base plus positive semidefinite sector blocks. So `np.linalg.cholesky` never fails as tickers are added. `L` is rebuilt only when the ticker set changes (O(n³), trivial for n ≤ 50), not on every tick.

### 2.3 Shock events

On each tick, each ticker has probability `p = 0.0001` of a jump. The price is multiplied by `1 ± U(0.02, 0.05)`, with the sign chosen uniformly.

At 2 ticks/s that is about one event per ticker every 83 minutes. Across the 10-ticker default watchlist, that is **one visible jump about every 8 minutes**. That's frequent enough for drama, rare enough to stay believable. (p = 0.001 was tried first: about 7 jumps per ticker per hour, which gave a 23% hourly range. Far too wild.)

### 2.4 Unknown tickers

A ticker added at runtime that is not in `SEED_PRICES` starts at a random price in $50–$300. It uses the default parameters (σ = 0.25, μ = 0.05) and the cross-sector correlation (0.3).

## 3. Code structure

```
backend/app/market/
├── seed_prices.py    # data only: seed prices, (μ, σ) per ticker, sectors, correlations
└── simulator.py      # GBMSimulator (pure math, sync)  +  SimulatorDataSource (asyncio adapter)
```

The split keeps the math **synchronous and deterministic to test**: `GBMSimulator.step()` takes no time and does no I/O. `SimulatorDataSource` is a thin adapter that owns the asyncio task and writes to the `PriceCache`.

```
SimulatorDataSource.start(tickers)
   ├─ GBMSimulator(tickers)         → seed prices, build Cholesky
   ├─ cache.update(...) for each    → cache populated before start() returns
   └─ create_task(_run)
          loop every 0.5s:
             prices = sim.step()     → dict[ticker, float] (full precision)
             cache.update(t, p)      → rounded to cents, previous_price tracked by cache
```

## 4. seed_prices.py

```python
"""Starting prices and per-ticker parameters for the simulator."""

SEED_PRICES: dict[str, float] = {
    "AAPL": 190.0, "GOOGL": 175.0, "MSFT": 420.0, "AMZN": 185.0, "TSLA": 250.0,
    "NVDA": 800.0, "META": 500.0, "JPM": 195.0, "V": 280.0, "NFLX": 600.0,
}

# Annualized volatility (sigma) and drift (mu)
TICKER_PARAMS: dict[str, dict[str, float]] = {
    "AAPL": {"sigma": 0.22, "mu": 0.05},
    "GOOGL": {"sigma": 0.25, "mu": 0.05},
    "MSFT": {"sigma": 0.20, "mu": 0.05},
    "AMZN": {"sigma": 0.28, "mu": 0.05},
    "TSLA": {"sigma": 0.50, "mu": 0.03},
    "NVDA": {"sigma": 0.40, "mu": 0.08},
    "META": {"sigma": 0.30, "mu": 0.05},
    "JPM": {"sigma": 0.18, "mu": 0.04},
    "V": {"sigma": 0.17, "mu": 0.04},
    "NFLX": {"sigma": 0.35, "mu": 0.05},
}
DEFAULT_PARAMS: dict[str, float] = {"sigma": 0.25, "mu": 0.05}

SECTORS: dict[str, str] = {
    "AAPL": "tech", "GOOGL": "tech", "MSFT": "tech", "AMZN": "tech",
    "NVDA": "tech", "META": "tech", "NFLX": "tech",
    "JPM": "finance", "V": "finance",
    "TSLA": "tsla",
}

INTRA_SECTOR_CORR = 0.6
CROSS_SECTOR_CORR = 0.3
TSLA_CORR = 0.3
```

To add a well-known ticker with realistic behaviour, add one line to each dict. Tickers that aren't listed still work, using the defaults.

## 5. simulator.py

```python
"""Correlated geometric Brownian motion price simulator."""

import asyncio
import logging
import math
import random

import numpy as np

from .cache import PriceCache
from .interface import MarketDataSource
from .seed_prices import (
    CROSS_SECTOR_CORR, DEFAULT_PARAMS, INTRA_SECTOR_CORR, SECTORS,
    SEED_PRICES, TICKER_PARAMS, TSLA_CORR,
)

logger = logging.getLogger(__name__)

TRADING_SECONDS_PER_YEAR = 252 * 6.5 * 3600


class GBMSimulator:
    """Steps a set of tickers forward with correlated GBM plus random shock events."""

    def __init__(
        self,
        tickers: list[str],
        dt: float = 0.5 / TRADING_SECONDS_PER_YEAR,
        event_probability: float = 0.0001,
    ) -> None:
        self._dt = dt
        self._event_probability = event_probability
        self._tickers: list[str] = []
        self._prices: dict[str, float] = {}
        self._cholesky: np.ndarray | None = None
        for ticker in tickers:
            self._add(ticker)
        self._rebuild_cholesky()

    def step(self) -> dict[str, float]:
        """Advance one time step and return the new price of every ticker."""
        if not self._tickers:
            return {}
        shocks = self._cholesky @ np.random.standard_normal(len(self._tickers))
        for ticker, z in zip(self._tickers, shocks):
            params = TICKER_PARAMS.get(ticker, DEFAULT_PARAMS)
            mu, sigma = params["mu"], params["sigma"]
            drift = (mu - 0.5 * sigma**2) * self._dt
            diffusion = sigma * math.sqrt(self._dt) * z
            price = self._prices[ticker] * math.exp(drift + diffusion)
            if random.random() < self._event_probability:
                price *= 1 + random.choice([-1, 1]) * random.uniform(0.02, 0.05)
            self._prices[ticker] = price
        return dict(self._prices)

    def add_ticker(self, ticker: str) -> None:
        if ticker in self._prices:
            return
        self._add(ticker)
        self._rebuild_cholesky()

    def remove_ticker(self, ticker: str) -> None:
        if ticker not in self._prices:
            return
        self._tickers.remove(ticker)
        del self._prices[ticker]
        self._rebuild_cholesky()

    def get_price(self, ticker: str) -> float | None:
        return self._prices.get(ticker)

    def get_tickers(self) -> list[str]:
        return list(self._tickers)

    def _add(self, ticker: str) -> None:
        self._tickers.append(ticker)
        self._prices[ticker] = SEED_PRICES.get(ticker, random.uniform(50, 300))

    def _rebuild_cholesky(self) -> None:
        n = len(self._tickers)
        if n == 0:
            self._cholesky = None
            return
        corr = np.eye(n)
        for i in range(n):
            for j in range(i + 1, n):
                rho = self._pair_correlation(self._tickers[i], self._tickers[j])
                corr[i, j] = corr[j, i] = rho
        self._cholesky = np.linalg.cholesky(corr)

    @staticmethod
    def _pair_correlation(a: str, b: str) -> float:
        sector_a, sector_b = SECTORS.get(a), SECTORS.get(b)
        if "tsla" in (sector_a, sector_b):
            return TSLA_CORR
        if sector_a is not None and sector_a == sector_b:
            return INTRA_SECTOR_CORR
        return CROSS_SECTOR_CORR


class SimulatorDataSource(MarketDataSource):
    """MarketDataSource backed by GBMSimulator, ticking every `interval` seconds."""

    def __init__(self, cache: PriceCache, interval: float = 0.5) -> None:
        self._cache = cache
        self._interval = interval
        self._sim: GBMSimulator | None = None
        self._task: asyncio.Task | None = None

    async def start(self, tickers: list[str]) -> None:
        self._sim = GBMSimulator(tickers)
        for ticker in tickers:
            self._cache.update(ticker, self._sim.get_price(ticker))
        self._task = asyncio.create_task(self._run(), name="simulator")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)
            self._task = None

    async def add_ticker(self, ticker: str) -> None:
        self._sim.add_ticker(ticker)
        self._cache.update(ticker, self._sim.get_price(ticker))

    async def remove_ticker(self, ticker: str) -> None:
        self._sim.remove_ticker(ticker)
        self._cache.remove(ticker)

    def get_tickers(self) -> list[str]:
        return self._sim.get_tickers() if self._sim else []

    async def _run(self) -> None:
        while True:
            try:
                for ticker, price in self._sim.step().items():
                    self._cache.update(ticker, price)
            except Exception:
                logger.exception("Simulator step failed")
            await asyncio.sleep(self._interval)
```

Design notes:

- **Full precision inside, cents outside.** `GBMSimulator` keeps unrounded floats, so rounding error never accumulates. `PriceCache.update` rounds for display.
- **`previous_price` comes from the cache, not the simulator.** Both data sources get the flash/direction logic in one place.
- **Add/remove rebuilds `L`.** New tickers are priced at once (`add_ticker` writes the seed price to the cache immediately), so a newly added ticker shows up on the next SSE event.
- **Errors:** one failed step is logged and the loop continues. `asyncio.CancelledError` is not an `Exception` subclass, so `stop()` still cancels cleanly.
- **Randomness:** uses the global `random`/`np.random` state. For reproducible tests, seed both with `random.seed(...)` and `np.random.seed(...)`. The simulator doesn't need its own RNG plumbing.

## 6. Validation results

Measured over 20,000 ticks (events off) for the statistics, and 7,200 ticks (one simulated hour) for the ranges:

| Check | Expected | Measured |
|---|---|---|
| Realised σ AAPL / TSLA / V | 0.22 / 0.50 / 0.17 | 0.218 / 0.499 / 0.170 |
| ρ AAPL–MSFT (tech) | 0.6 | 0.60 |
| ρ JPM–V (finance) | 0.6 | 0.59 |
| ρ AAPL–JPM (cross) | 0.3 | 0.30 |
| ρ TSLA–NVDA | 0.3 | 0.29 |
| Event move size (p = 1) | 2–5% | 3.3% |
| Median 1-hour high–low range, no events | ~1% | 1.2% |
| Median 1-hour high–low range, p = 0.0001 | a few % | 2.4% |
| Ticks with no visible change after rounding | low | 4% (NVDA) – 38% (JPM) |
| add/remove, empty ticker set | no errors | ok |
| Async source → cache → SSE via uvicorn | events every 0.5s | ok |

## 7. Unit tests to write (backend/tests/market/test_simulator.py)

- `step()` returns a price for every ticker, and all prices are > 0.
- With `event_probability=0` and a fixed seed, realised σ over 20k steps is within ±5% of `TICKER_PARAMS`.
- Correlation of log returns between two tech tickers is about 0.6, and between tech and finance about 0.3 (tolerance ±0.05).
- With `event_probability=1.0`, a single step moves the price by 2–5% (plus a negligible GBM term).
- `add_ticker` for an unknown symbol gives a seed in [50, 300]. Adding an existing ticker is a no-op. `remove_ticker` of an unknown ticker is a no-op.
- `GBMSimulator([])` steps to `{}` and accepts `add_ticker` afterwards.
- `SimulatorDataSource`: after `await start([...])` the cache holds all tickers. After about 1s, `cache.version` has increased. `add_ticker`/`remove_ticker` update the cache. `stop()` ends the task.

## 8. Tuning knobs

| Knob | Where | Effect |
|---|---|---|
| `interval` | `SimulatorDataSource(interval=0.5)` | Tick rate |
| `dt` | `GBMSimulator(dt=...)` | Multiply by k to run the "market clock" k× faster (bigger moves per tick) |
| `event_probability` | `GBMSimulator(event_probability=...)` | Drama frequency |
| σ, μ, sectors, ρ | `seed_prices.py` | Per-ticker personality and co-movement |
