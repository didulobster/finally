from app.market import PriceCache, PriceUpdate


def test_direction_and_change():
    up = PriceUpdate("A", 101.0, 100.0, 0)
    assert (up.direction, up.change, up.change_percent) == ("up", 1.0, 1.0)
    assert PriceUpdate("A", 99.0, 100.0, 0).direction == "down"
    assert PriceUpdate("A", 100.0, 100.0, 0).direction == "flat"
    assert PriceUpdate("A", 1.0, 0.0, 0).change_percent == 0.0


def test_cache_tracks_previous_price_and_version():
    cache = PriceCache()
    first = cache.update("AAPL", 190.004)
    assert first.price == first.previous_price == 190.0
    second = cache.update("AAPL", 191.0)
    assert second.previous_price == 190.0
    assert cache.version == 2
    cache.remove("AAPL")
    assert cache.get("AAPL") is None and cache.version == 3
