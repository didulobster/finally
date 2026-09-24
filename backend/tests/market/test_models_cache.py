from app.market import PriceCache, PriceUpdate


def test_direction_and_change():
    up = PriceUpdate("A", 101.0, 100.0, 0, 100.0)
    assert (up.direction, up.change, up.change_percent) == ("up", 1.0, 1.0)
    assert PriceUpdate("A", 99.0, 100.0, 0, 100.0).direction == "down"
    assert PriceUpdate("A", 100.0, 100.0, 0, 100.0).direction == "flat"
    assert PriceUpdate("A", 1.0, 0.0, 0, 100.0).change_percent == 0.0


def test_cache_tracks_previous_price_and_version():
    cache = PriceCache()
    first = cache.update("AAPL", 190.004)
    assert first.price == first.previous_price == 190.0
    second = cache.update("AAPL", 191.0)
    assert second.previous_price == 190.0
    assert cache.version == 2
    cache.remove("AAPL")
    assert cache.get("AAPL") is None and cache.version == 3


def test_session_open_price_is_first_price_seen():
    cache = PriceCache()
    cache.update("AAPL", 200.0)
    cache.update("AAPL", 190.0)
    update = cache.update("AAPL", 210.0)
    assert update.open_price == 200.0 and update.session_change_percent == 5.0
    data = update.to_dict()
    assert data["open_price"] == 200.0 and data["session_change_percent"] == 5.0
    assert PriceUpdate("A", 1.0, 1.0, 0, 0.0).session_change_percent == 0.0
