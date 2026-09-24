"""In-memory store of the latest price per ticker."""

import time
from threading import Lock

from .models import PriceUpdate


class PriceCache:
    """Latest price per ticker; the single source of truth for live prices."""

    def __init__(self) -> None:
        self._prices: dict[str, PriceUpdate] = {}
        self._lock = Lock()
        self.version = 0

    def update(self, ticker: str, price: float, timestamp: float | None = None) -> PriceUpdate:
        """Record a new price; the previous price is taken from the cache."""
        with self._lock:
            prev = self._prices.get(ticker)
            update = PriceUpdate(
                ticker=ticker,
                price=round(price, 2),
                previous_price=prev.price if prev else round(price, 2),
                timestamp=timestamp or time.time(),
                open_price=prev.open_price if prev else round(price, 2),
            )
            self._prices[ticker] = update
            self.version += 1
            return update

    def get(self, ticker: str) -> PriceUpdate | None:
        return self._prices.get(ticker)

    def get_price(self, ticker: str) -> float | None:
        update = self._prices.get(ticker)
        return update.price if update else None

    def get_all(self) -> dict[str, PriceUpdate]:
        with self._lock:
            return dict(self._prices)

    def remove(self, ticker: str) -> None:
        with self._lock:
            self._prices.pop(ticker, None)
            self.version += 1
