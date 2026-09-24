import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client():
    with TestClient(create_app()) as c:
        yield c


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_fresh_portfolio_and_watchlist(client):
    state = client.get("/api/portfolio").json()
    assert state["cash_balance"] == 10000.0 and state["positions"] == [] and state["total_value"] == 10000.0
    items = client.get("/api/watchlist").json()
    assert [i["ticker"] for i in items][:2] == ["AAPL", "GOOGL"] and len(items) == 10
    assert items[0]["price"] > 0 and items[0]["direction"] in ("up", "down", "flat")
    assert items[0]["open_price"] > 0 and "session_change_percent" in items[0]
    assert len(client.get("/api/portfolio/history").json()) == 1  # startup snapshot


def test_buy_and_sell(client):
    r = client.post("/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 2, "side": "buy"})
    assert r.status_code == 200
    body = r.json()
    assert body["trade"]["side"] == "buy" and body["portfolio"]["positions"][0]["ticker"] == "AAPL"
    assert body["portfolio"]["cash_balance"] < 10000
    r = client.post("/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 2, "side": "sell"})
    assert r.json()["portfolio"]["positions"] == []
    assert len(client.get("/api/portfolio/history").json()) == 3


@pytest.mark.parametrize("payload,status", [
    ({"ticker": "AAPL", "quantity": 1000, "side": "buy"}, 400),
    ({"ticker": "AAPL", "quantity": 1, "side": "sell"}, 400),
    ({"ticker": "AAPL", "quantity": -1, "side": "buy"}, 422),
    ({"ticker": "AAPL", "quantity": 1, "side": "short"}, 422),
    ({"ticker": "123", "quantity": 1, "side": "buy"}, 400),
])
def test_trade_errors(client, payload, status):
    r = client.post("/api/portfolio/trade", json=payload)
    assert r.status_code == status


def test_trade_error_detail_and_unchanged_state(client):
    r = client.post("/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 1000, "side": "buy"})
    assert r.json()["detail"].startswith("Insufficient cash")
    r = client.post("/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 1, "side": "sell"})
    assert r.json()["detail"].startswith("Insufficient shares")
    assert client.get("/api/portfolio").json()["cash_balance"] == 10000.0
    assert len(client.get("/api/portfolio/history").json()) == 1


def test_history_shape_and_order(client):
    client.post("/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 1, "side": "buy"})
    history = client.get("/api/portfolio/history").json()
    assert set(history[0]) == {"total_value", "recorded_at"}
    assert [h["recorded_at"] for h in history] == sorted(h["recorded_at"] for h in history)


def test_empty_chat_message_rejected(client):
    assert client.post("/api/chat", json={"message": ""}).status_code == 422


def test_watchlist_add_remove(client):
    r = client.post("/api/watchlist", json={"ticker": "pypl"})
    assert r.status_code == 201 and r.json()["ticker"] == "PYPL" and r.json()["price"] > 0
    assert "PYPL" in [i["ticker"] for i in client.get("/api/watchlist").json()]
    assert client.delete("/api/watchlist/PYPL").json() == {"ticker": "PYPL", "removed": True}
    assert client.delete("/api/watchlist/PYPL").status_code == 404
    assert client.post("/api/watchlist", json={"ticker": "TOOLONG"}).status_code == 400


def test_chat_mock_executes_trade(client):
    r = client.post("/api/chat", json={"message": "buy 1 NVDA"})
    body = r.json()
    assert r.status_code == 200 and body["message"].startswith("Mock response")
    assert body["trades"][0]["ticker"] == "NVDA"
    assert client.get("/api/portfolio").json()["positions"][0]["ticker"] == "NVDA"


@pytest.mark.parametrize("with_404_page", [False, True])
def test_static_spa_fallback(tmp_path, monkeypatch, with_404_page):
    (tmp_path / "index.html").write_text("index")
    if with_404_page:
        (tmp_path / "404.html").write_text("not found")
    monkeypatch.setattr("app.main.STATIC_DIR", tmp_path)
    with TestClient(create_app()) as c:
        assert c.get("/").text == "index"
        r = c.get("/some/route")
        assert r.status_code == 200 and r.text == "index"
        assert c.get("/missing.js").status_code == 404
        assert c.get("/api/nope").status_code == 404
        assert c.get("/api/health").json() == {"status": "ok"}


def test_chat_history(client):
    assert client.get("/api/chat").json() == []
    client.post("/api/chat", json={"message": "buy 1 NVDA"})
    user, assistant = client.get("/api/chat").json()
    assert user["role"] == "user" and user["content"] == "buy 1 NVDA" and user["actions"] is None
    assert assistant["role"] == "assistant" and assistant["created_at"]
    assert assistant["actions"]["trades"][0]["ticker"] == "NVDA"


def test_state_persists_across_restart():
    with TestClient(create_app()) as c:
        c.post("/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 1, "side": "buy"})
    with TestClient(create_app()) as c:
        assert c.get("/api/portfolio").json()["positions"][0]["ticker"] == "AAPL"
