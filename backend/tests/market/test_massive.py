import pytest
from massive.exceptions import BadResponse
from massive.rest.models import TickerSnapshot

from app.market import PriceCache, create_market_data_source
from app.market.massive_client import MassiveDataSource, snapshot_price
from app.market.simulator import SimulatorDataSource

FULL = {
    "ticker": "AAPL", "updated": 1758412800123456789,
    "day": {"o": 189.1, "c": 190.45}, "prevDay": {"c": 189.1},
    "min": {"c": 190.40, "t": 1758412800000},
    "lastTrade": {"p": 190.45, "t": 1758412800123456789},
}


def test_snapshot_price_prefers_last_trade():
    price, ts = snapshot_price(TickerSnapshot.from_dict(FULL))
    assert price == 190.45 and abs(ts - 1758412800.123) < 1e-3


def test_snapshot_price_falls_back_to_minute_then_prev_day():
    minute = {"ticker": "X", "min": {"c": 50.5, "t": 1758412800000}}
    assert snapshot_price(TickerSnapshot.from_dict(minute)) == (50.5, 1758412800.0)
    premarket = {"ticker": "X", "updated": 1758412800000000000, "day": {"c": 0}, "prevDay": {"c": 12.0}}
    assert snapshot_price(TickerSnapshot.from_dict(premarket))[0] == 12.0
    assert snapshot_price(TickerSnapshot.from_dict({"ticker": "X"})) is None


async def test_poll_writes_cache_and_survives_errors():
    cache = PriceCache()
    source = MassiveDataSource("key", cache, poll_interval=999)
    source._client.get_snapshot_all = lambda *a, **k: [TickerSnapshot.from_dict(FULL)]
    await source.start(["AAPL"])
    assert cache.get_price("AAPL") == 190.45

    def fail(*a, **k):
        raise BadResponse("Unknown API Key")

    source._client.get_snapshot_all = fail
    await source._poll_once()
    assert not source._task.done()
    await source.remove_ticker("AAPL")
    assert cache.get("AAPL") is None
    await source.stop()


@pytest.mark.parametrize("key,cls", [("", SimulatorDataSource), ("  ", SimulatorDataSource), ("abc", MassiveDataSource)])
def test_factory(monkeypatch, key, cls):
    monkeypatch.setenv("MASSIVE_API_KEY", key)
    assert isinstance(create_market_data_source(PriceCache()), cls)
