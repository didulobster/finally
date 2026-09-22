import asyncio
import json

from app.market import PriceCache
from app.market.stream import price_events


class FakeRequest:
    def __init__(self):
        self.disconnected = False

    async def is_disconnected(self):
        return self.disconnected


async def test_stream_sends_on_change_only():
    cache = PriceCache()
    cache.update("AAPL", 190.0)
    request = FakeRequest()
    events = price_events(cache, request, interval=0.01)

    assert await anext(events) == "retry: 1000\n\n"
    payload = json.loads((await anext(events)).removeprefix("data: "))
    assert payload["AAPL"]["price"] == 190.0

    next_event = asyncio.ensure_future(anext(events))
    await asyncio.sleep(0.05)
    assert not next_event.done()
    cache.update("AAPL", 191.0)
    payload = json.loads((await next_event).removeprefix("data: "))
    assert payload["AAPL"]["direction"] == "up"

    request.disconnected = True
    assert [e async for e in events] == []
