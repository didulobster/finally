"""SQLite connection handling with lazy schema creation and seeding."""

import os
from collections.abc import Iterator
from contextlib import contextmanager
import sqlite3
import uuid
from datetime import UTC, datetime
from pathlib import Path

SCHEMA = Path(__file__).with_name("schema.sql")
DEFAULT_DB_PATH = Path(__file__).resolve().parents[3] / "db" / "finally.db"
DEFAULT_USER = "default"
DEFAULT_CASH = 10000.0
DEFAULT_WATCHLIST = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "JPM", "V", "NFLX"]


def db_path() -> Path:
    return Path(os.getenv("DB_PATH", DEFAULT_DB_PATH))


def now() -> str:
    return datetime.now(UTC).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    """Yield a connection with dict-like rows; commit on success, always close."""
    conn = sqlite3.connect(db_path())
    conn.row_factory = sqlite3.Row
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def init_db() -> None:
    """Create tables if missing and seed the default user and watchlist once."""
    db_path().parent.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.executescript(SCHEMA.read_text())
        if conn.execute("SELECT 1 FROM users_profile WHERE id = ?", (DEFAULT_USER,)).fetchone():
            return
        conn.execute(
            "INSERT INTO users_profile (id, cash_balance, created_at) VALUES (?, ?, ?)",
            (DEFAULT_USER, DEFAULT_CASH, now()),
        )
        conn.executemany(
            "INSERT INTO watchlist (id, user_id, ticker, added_at) VALUES (?, ?, ?, ?)",
            [(new_id(), DEFAULT_USER, t, now()) for t in DEFAULT_WATCHLIST],
        )
