from app.db import connect, init_db


def test_init_seeds_once():
    init_db()
    init_db()
    with connect() as conn:
        assert conn.execute("SELECT cash_balance FROM users_profile").fetchone()[0] == 10000.0
        assert conn.execute("SELECT COUNT(*) FROM watchlist").fetchone()[0] == 10
