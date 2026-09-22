import pytest

from app import actions, portfolio, watchlist
from app.db import init_db
from app.market import PriceCache
from app.market.simulator import SimulatorDataSource
from app.portfolio import TradeError


@pytest.fixture
async def market():
    init_db()
    cache = PriceCache()
    source = SimulatorDataSource(cache)
    await source.start(watchlist.get_tickers())
    yield cache, source
    await source.stop()


async def test_trade_fills_at_cache_price_and_snapshots(market):
    cache, source = market
    trade = await actions.trade(cache, source, "aapl", "buy", 2)
    assert trade["ticker"] == "AAPL" and trade["price"] == cache.get_price("AAPL")
    assert len(portfolio.get_history()) == 1


async def test_held_ticker_keeps_streaming_after_watchlist_removal(market):
    cache, source = market
    await actions.trade(cache, source, "AAPL", "buy", 1)
    await actions.remove_from_watchlist(source, "AAPL")
    assert "AAPL" in source.get_tickers()
    await actions.trade(cache, source, "AAPL", "sell", 1)
    assert "AAPL" not in source.get_tickers() and cache.get("AAPL") is None


async def test_buying_unwatched_ticker_tracks_it(market):
    cache, source = market
    await actions.trade(cache, source, "PYPL", "buy", 1)
    assert "PYPL" in source.get_tickers()


async def test_failed_trade_on_new_ticker_does_not_track_it(market):
    cache, source = market
    with pytest.raises(TradeError):
        await actions.trade(cache, source, "PYPL", "sell", 1)
    assert "PYPL" not in source.get_tickers()


async def test_watchlist_add_remove(market):
    _, source = market
    assert await actions.add_to_watchlist(source, " pypl ") == "PYPL"
    assert "PYPL" in watchlist.get_tickers() and "PYPL" in source.get_tickers()
    await actions.remove_from_watchlist(source, "PYPL")
    assert "PYPL" not in watchlist.get_tickers() and "PYPL" not in source.get_tickers()
    with pytest.raises(ValueError):
        await actions.add_to_watchlist(source, "BAD1")
    with pytest.raises(actions.NotOnWatchlist):
        await actions.remove_from_watchlist(source, "PYPL")
