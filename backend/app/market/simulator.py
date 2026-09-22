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
        self._sim = GBMSimulator([])
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
        return self._sim.get_tickers()

    async def _run(self) -> None:
        while True:
            try:
                for ticker, price in self._sim.step().items():
                    self._cache.update(ticker, price)
            except Exception:
                logger.exception("Simulator step failed")
            await asyncio.sleep(self._interval)
