import sqlite3
import threading

import pytest

from app.db import DEFAULT_USER, connect, init_db
from app.db.database import DEFAULT_WATCHLIST, db_path

TABLES = {"users_profile", "watchlist", "positions", "trades", "portfolio_snapshots", "chat_messages"}


def columns(conn, table: str) -> dict:
    return {row["name"]: row for row in conn.execute(f"PRAGMA table_info({table})")}


def test_init_seeds_once():
    init_db()
    init_db()
    with connect() as conn:
        assert conn.execute("SELECT cash_balance FROM users_profile").fetchone()[0] == 10000.0
        assert conn.execute("SELECT COUNT(*) FROM watchlist").fetchone()[0] == 10


def test_init_creates_missing_directory_and_all_tables(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "nested" / "finally.db"))
    init_db()
    assert db_path().exists()
    with connect() as conn:
        names = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert TABLES <= names


def test_seed_data():
    init_db()
    with connect() as conn:
        user = conn.execute("SELECT id, cash_balance, created_at FROM users_profile").fetchall()
        tickers = [r[0] for r in conn.execute("SELECT ticker FROM watchlist WHERE user_id = ? ORDER BY rowid", (DEFAULT_USER,))]
    assert [(u["id"], u["cash_balance"]) for u in user] == [(DEFAULT_USER, 10000.0)]
    assert user[0]["created_at"]
    assert tickers == DEFAULT_WATCHLIST


def test_user_id_defaults_to_default():
    init_db()
    with connect() as conn:
        for table in TABLES - {"users_profile"}:
            assert columns(conn, table)["user_id"]["dflt_value"] == "'default'", table


def test_init_recreates_missing_table_without_reseeding():
    init_db()
    with connect() as conn:
        conn.execute("DROP TABLE trades")
        conn.execute("DELETE FROM watchlist WHERE ticker = 'AAPL'")
    init_db()
    with connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM trades").fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM watchlist").fetchone()[0] == 9


@pytest.mark.parametrize("table, row", [
    ("watchlist", "(id, ticker, added_at) VALUES (?, 'AAPL', 'now')"),
    ("positions", "(id, ticker, quantity, avg_cost, updated_at) VALUES (?, 'AAPL', 1, 1, 'now')"),
])
def test_unique_user_ticker(table, row):
    init_db()
    with connect() as conn:
        conn.execute(f"DELETE FROM {table}")
        conn.execute(f"INSERT INTO {table} {row}", ("a",))
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(f"INSERT INTO {table} {row}", ("b",))


def test_check_constraints():
    init_db()
    with connect() as conn, pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO trades (id, ticker, side, quantity, price, executed_at) VALUES ('t', 'X', 'hold', 1, 1, 'now')")


def test_connect_rolls_back_on_error():
    init_db()
    with pytest.raises(RuntimeError), connect() as conn:
        conn.execute("UPDATE users_profile SET cash_balance = 0")
        raise RuntimeError
    with connect() as conn:
        assert conn.execute("SELECT cash_balance FROM users_profile").fetchone()[0] == 10000.0


def test_concurrent_read_modify_write_is_serialized():
    init_db()
    barrier = threading.Barrier(10)

    def withdraw():
        barrier.wait()
        with connect() as conn:
            cash = conn.execute("SELECT cash_balance FROM users_profile").fetchone()[0]
            conn.execute("UPDATE users_profile SET cash_balance = ?", (cash - 100,))

    threads = [threading.Thread(target=withdraw) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    with connect() as conn:
        assert conn.execute("SELECT cash_balance FROM users_profile").fetchone()[0] == 9000.0
