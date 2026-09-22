import asyncio
import math
import random

import numpy as np

from app.market import PriceCache
from app.market.seed_prices import TICKER_PARAMS
from app.market.simulator import GBMSimulator, SimulatorDataSource

DEFAULT = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "JPM", "V", "NFLX"]


def log_returns(tickers, steps=20_000):
    random.seed(1)
    np.random.seed(1)
    sim = GBMSimulator(tickers, event_probability=0)
    prices = [sim.step() for _ in range(steps)]
    return {t: np.diff(np.log([p[t] for p in prices])) for t in tickers}, sim


def test_step_prices_all_positive():
    sim = GBMSimulator(DEFAULT)
    prices = sim.step()
    assert set(prices) == set(DEFAULT) and all(p > 0 for p in prices.values())


def test_realised_volatility_matches_sigma():
    returns, sim = log_returns(["AAPL", "TSLA"])
    for t, r in returns.items():
        realised = r.std() / math.sqrt(sim._dt)
        assert abs(realised - TICKER_PARAMS[t]["sigma"]) / TICKER_PARAMS[t]["sigma"] < 0.05


def test_sector_correlation():
    returns, _ = log_returns(["AAPL", "MSFT", "JPM"])
    assert abs(np.corrcoef(returns["AAPL"], returns["MSFT"])[0, 1] - 0.6) < 0.05
    assert abs(np.corrcoef(returns["AAPL"], returns["JPM"])[0, 1] - 0.3) < 0.05


def test_shock_event_moves_two_to_five_percent():
    sim = GBMSimulator(["AAPL"], event_probability=1.0)
    move = abs(sim.step()["AAPL"] / 190.0 - 1)
    assert 0.019 < move < 0.051


def test_add_remove_and_empty():
    sim = GBMSimulator([])
    assert sim.step() == {}
    sim.add_ticker("ZZZZ")
    assert 50 <= sim.get_price("ZZZZ") <= 300
    sim.add_ticker("ZZZZ")
    sim.remove_ticker("NOPE")
    assert sim.get_tickers() == ["ZZZZ"]


async def test_data_source_updates_cache():
    cache = PriceCache()
    source = SimulatorDataSource(cache, interval=0.05)
    await source.start(["AAPL", "GOOGL"])
    assert cache.get_price("AAPL") == 190.0
    version = cache.version
    await asyncio.sleep(0.2)
    assert cache.version > version
    await source.add_ticker("PYPL")
    assert cache.get_price("PYPL") is not None
    await source.remove_ticker("GOOGL")
    assert cache.get("GOOGL") is None and "GOOGL" not in source.get_tickers()
    await source.stop()
    await source.stop()
