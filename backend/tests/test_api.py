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


def test_state_persists_across_restart():
    with TestClient(create_app()) as c:
        c.post("/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 1, "side": "buy"})
    with TestClient(create_app()) as c:
        assert c.get("/api/portfolio").json()["positions"][0]["ticker"] == "AAPL"
