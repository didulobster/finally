"""Abstract interface implemented by every market data source."""

from abc import ABC, abstractmethod


class MarketDataSource(ABC):
    """Produces prices for a set of tickers and writes them into a PriceCache."""

    @abstractmethod
    async def start(self, tickers: list[str]) -> None:
        """Seed the cache for the given tickers, then start a background task."""

    @abstractmethod
    async def stop(self) -> None:
        """Stop the background task. Safe to call twice."""

    @abstractmethod
    async def add_ticker(self, ticker: str) -> None:
        """Start tracking a ticker (idempotent)."""

    @abstractmethod
    async def remove_ticker(self, ticker: str) -> None:
        """Stop tracking a ticker and drop it from the cache (idempotent)."""

    @abstractmethod
    def get_tickers(self) -> list[str]:
        """Tickers currently tracked."""
