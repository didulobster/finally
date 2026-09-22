"""User actions that change the database and keep the market data source in sync.

Shared by the REST routes and the LLM chat. The tracked ticker set is the
watchlist plus any ticker with an open position.
"""

from . import portfolio, watchlist
from .market import MarketDataSource, PriceCache
from .portfolio import TradeError


class NotOnWatchlist(ValueError):
    """Tried to remove a ticker that is not on the watchlist."""


def normalize_ticker(ticker: str) -> str:
    """Upper-case and validate a ticker symbol (1-5 letters)."""
    ticker = ticker.strip().upper()
    if not (ticker.isalpha() and 1 <= len(ticker) <= 5):
        raise ValueError(f"Invalid ticker: {ticker!r}")
    return ticker


def tracked_tickers() -> list[str]:
    return list(dict.fromkeys(watchlist.get_tickers() + portfolio.held_tickers()))


async def untrack_if_unused(source: MarketDataSource, ticker: str) -> None:
    if ticker not in tracked_tickers():
        await source.remove_ticker(ticker)


async def trade(cache: PriceCache, source: MarketDataSource, ticker: str, side: str, quantity: float) -> dict:
    """Execute a market order at the live price and record a portfolio snapshot."""
    try:
        ticker = normalize_ticker(ticker)
    except ValueError as e:
        raise TradeError(str(e)) from e
    if cache.get_price(ticker) is None:
        await source.add_ticker(ticker)
    price = cache.get_price(ticker)
    try:
        if price is None:
            raise TradeError(f"No price available for {ticker}")
        result = portfolio.execute_trade(ticker, side, quantity, price)
    finally:
        await untrack_if_unused(source, ticker)
    portfolio.record_snapshot(cache)
    return result


async def add_to_watchlist(source: MarketDataSource, ticker: str) -> str:
    ticker = normalize_ticker(ticker)
    watchlist.add(ticker)
    await source.add_ticker(ticker)
    return ticker


async def remove_from_watchlist(source: MarketDataSource, ticker: str) -> str:
    ticker = normalize_ticker(ticker)
    if not watchlist.remove(ticker):
        raise NotOnWatchlist(f"{ticker} is not on the watchlist")
    await untrack_if_unused(source, ticker)
    return ticker
