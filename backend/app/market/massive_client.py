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
