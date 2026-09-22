"""Portfolio state: trade execution, valuation and value snapshots."""

from .db import DEFAULT_USER, connect, new_id, now
from .market import PriceCache

EPSILON = 1e-9


class TradeError(ValueError):
    """A trade failed validation (bad input, not enough cash or shares)."""


def execute_trade(ticker: str, side: str, quantity: float, price: float) -> dict:
    """Fill a market order at `price`, updating cash, position and the trade log."""
    if side not in ("buy", "sell"):
        raise TradeError(f"Invalid side: {side!r}")
    if quantity <= 0:
        raise TradeError("Quantity must be positive")

    with connect() as conn:
        cash = conn.execute("SELECT cash_balance FROM users_profile WHERE id = ?", (DEFAULT_USER,)).fetchone()[0]
        position = conn.execute(
            "SELECT quantity, avg_cost FROM positions WHERE user_id = ? AND ticker = ?", (DEFAULT_USER, ticker)
        ).fetchone()
        held = position["quantity"] if position else 0.0
        amount = quantity * price

        if side == "buy":
            if amount > cash + EPSILON:
                raise TradeError(f"Insufficient cash: need ${amount:,.2f}, have ${cash:,.2f}")
            new_quantity = held + quantity
            avg_cost = ((held * position["avg_cost"] if position else 0.0) + amount) / new_quantity
            cash -= amount
        else:
            if quantity > held + EPSILON:
                raise TradeError(f"Insufficient shares: trying to sell {quantity:g} {ticker}, hold {held:g}")
            new_quantity = held - quantity
            avg_cost = position["avg_cost"]
            cash += amount

        conn.execute("UPDATE users_profile SET cash_balance = ? WHERE id = ?", (cash, DEFAULT_USER))
        if new_quantity <= EPSILON:
            conn.execute("DELETE FROM positions WHERE user_id = ? AND ticker = ?", (DEFAULT_USER, ticker))
        else:
            conn.execute(
                """INSERT INTO positions (id, user_id, ticker, quantity, avg_cost, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT (user_id, ticker)
                   DO UPDATE SET quantity = excluded.quantity, avg_cost = excluded.avg_cost,
                                 updated_at = excluded.updated_at""",
                (new_id(), DEFAULT_USER, ticker, new_quantity, avg_cost, now()),
            )
        trade = {"id": new_id(), "ticker": ticker, "side": side, "quantity": quantity,
                 "price": price, "executed_at": now()}
        conn.execute(
            "INSERT INTO trades (id, user_id, ticker, side, quantity, price, executed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (trade["id"], DEFAULT_USER, ticker, side, quantity, price, trade["executed_at"]),
        )
    return trade


def held_tickers() -> list[str]:
    with connect() as conn:
        rows = conn.execute("SELECT ticker FROM positions WHERE user_id = ?", (DEFAULT_USER,)).fetchall()
    return [r["ticker"] for r in rows]


def get_portfolio(cache: PriceCache) -> dict:
    """Cash, positions valued at live prices, total value and unrealized P&L."""
    with connect() as conn:
        cash = conn.execute("SELECT cash_balance FROM users_profile WHERE id = ?", (DEFAULT_USER,)).fetchone()[0]
        rows = conn.execute(
            "SELECT ticker, quantity, avg_cost FROM positions WHERE user_id = ? ORDER BY ticker", (DEFAULT_USER,)
        ).fetchall()

    positions = []
    for row in rows:
        current = cache.get_price(row["ticker"]) or row["avg_cost"]
        cost_basis = row["quantity"] * row["avg_cost"]
        market_value = row["quantity"] * current
        pnl = market_value - cost_basis
        positions.append({
            "ticker": row["ticker"],
            "quantity": row["quantity"],
            "avg_cost": round(row["avg_cost"], 4),
            "current_price": current,
            "market_value": round(market_value, 2),
            "unrealized_pnl": round(pnl, 2),
            "pnl_percent": round(pnl / cost_basis * 100, 2) if cost_basis else 0.0,
        })

    positions_value = sum(p["market_value"] for p in positions)
    return {
        "cash_balance": round(cash, 2),
        "positions": positions,
        "positions_value": round(positions_value, 2),
        "total_value": round(cash + positions_value, 2),
        "unrealized_pnl": round(sum(p["unrealized_pnl"] for p in positions), 2),
    }


def record_snapshot(cache: PriceCache) -> None:
    total = get_portfolio(cache)["total_value"]
    with connect() as conn:
        conn.execute(
            "INSERT INTO portfolio_snapshots (id, user_id, total_value, recorded_at) VALUES (?, ?, ?, ?)",
            (new_id(), DEFAULT_USER, total, now()),
        )


def get_history() -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT total_value, recorded_at FROM portfolio_snapshots WHERE user_id = ? ORDER BY recorded_at",
            (DEFAULT_USER,),
        ).fetchall()
    return [dict(r) for r in rows]
