"""Watchlist persistence."""

from .db import DEFAULT_USER, connect, new_id, now


def get_tickers() -> list[str]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT ticker FROM watchlist WHERE user_id = ? ORDER BY added_at, rowid", (DEFAULT_USER,)
        ).fetchall()
    return [r["ticker"] for r in rows]


def add(ticker: str) -> bool:
    """Add a ticker; returns False if it was already present."""
    with connect() as conn:
        cursor = conn.execute(
            "INSERT OR IGNORE INTO watchlist (id, user_id, ticker, added_at) VALUES (?, ?, ?, ?)",
            (new_id(), DEFAULT_USER, ticker, now()),
        )
    return cursor.rowcount == 1


def remove(ticker: str) -> bool:
    """Remove a ticker; returns False if it was not present."""
    with connect() as conn:
        cursor = conn.execute("DELETE FROM watchlist WHERE user_id = ? AND ticker = ?", (DEFAULT_USER, ticker))
    return cursor.rowcount == 1
