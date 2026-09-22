import pytest

from app import portfolio
from app.db import init_db
from app.market import PriceCache
from app.portfolio import TradeError


@pytest.fixture(autouse=True)
def db():
    init_db()


def test_buy_then_sell_updates_cash_and_avg_cost():
    portfolio.execute_trade("AAPL", "buy", 10, 100.0)
    portfolio.execute_trade("AAPL", "buy", 10, 200.0)
    cache = PriceCache()
    cache.update("AAPL", 160.0)
    state = portfolio.get_portfolio(cache)
    [pos] = state["positions"]
    assert pos["quantity"] == 20 and pos["avg_cost"] == 150.0
    assert pos["unrealized_pnl"] == 200.0 and pos["pnl_percent"] == 6.67
    assert state["cash_balance"] == 7000.0 and state["total_value"] == 10200.0

    portfolio.execute_trade("AAPL", "sell", 5, 90.0)  # selling at a loss
    [pos] = portfolio.get_portfolio(cache)["positions"]
    assert pos["quantity"] == 15 and pos["avg_cost"] == 150.0


def test_selling_everything_removes_position():
    portfolio.execute_trade("AAPL", "buy", 1.5, 100.0)
    portfolio.execute_trade("AAPL", "sell", 1.5, 110.0)
    state = portfolio.get_portfolio(PriceCache())
    assert state["positions"] == [] and state["cash_balance"] == 10015.0


@pytest.mark.parametrize("side,qty,msg", [
    ("buy", 1000, "Insufficient cash"),
    ("sell", 1, "Insufficient shares"),
    ("buy", 0, "positive"),
    ("hold", 1, "Invalid side"),
])
def test_trade_validation(side, qty, msg):
    with pytest.raises(TradeError, match=msg):
        portfolio.execute_trade("AAPL", side, qty, 100.0)
    assert portfolio.get_portfolio(PriceCache())["cash_balance"] == 10000.0


def test_missing_price_values_at_cost():
    portfolio.execute_trade("AAPL", "buy", 1, 100.0)
    [pos] = portfolio.get_portfolio(PriceCache())["positions"]
    assert pos["current_price"] == 100.0 and pos["unrealized_pnl"] == 0.0


def test_snapshots_history():
    portfolio.record_snapshot(PriceCache())
    [snap] = portfolio.get_history()
    assert snap["total_value"] == 10000.0 and snap["recorded_at"]
