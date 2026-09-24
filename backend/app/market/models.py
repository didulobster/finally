"""Price data model shared by all market data sources."""

from dataclasses import dataclass


def percent_change(start: float, end: float) -> float:
    """Percent change from start to end; 0 when start is 0."""
    return round((end - start) / start * 100, 4) if start else 0.0


@dataclass(frozen=True, slots=True)
class PriceUpdate:
    """One price observation for one ticker."""

    ticker: str
    price: float
    previous_price: float
    timestamp: float  # unix seconds
    open_price: float  # first price seen this server session

    @property
    def change(self) -> float:
        return round(self.price - self.previous_price, 4)

    @property
    def change_percent(self) -> float:
        return percent_change(self.previous_price, self.price)

    @property
    def session_change_percent(self) -> float:
        return percent_change(self.open_price, self.price)

    @property
    def direction(self) -> str:
        if self.price > self.previous_price:
            return "up"
        if self.price < self.previous_price:
            return "down"
        return "flat"

    def to_dict(self) -> dict:
        return {
            "ticker": self.ticker,
            "price": self.price,
            "previous_price": self.previous_price,
            "timestamp": self.timestamp,
            "change": self.change,
            "change_percent": self.change_percent,
            "direction": self.direction,
            "open_price": self.open_price,
            "session_change_percent": self.session_change_percent,
        }
