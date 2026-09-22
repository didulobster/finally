import json

import pytest

from app import portfolio, watchlist
from app.chat import handle_message
from app.chat.llm import ChatResponse, build_messages, mock_response, parse_response
from app.db import connect, init_db
from app.market import PriceCache
from app.market.simulator import SimulatorDataSource


@pytest.fixture
async def market():
    init_db()
    cache = PriceCache()
    source = SimulatorDataSource(cache)
    await source.start(watchlist.get_tickers())
    yield cache, source
    await source.stop()


def test_parse_valid_and_malformed():
    raw = '{"message": "ok", "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 2}], "watchlist_changes": []}'
    assert parse_response(raw).trades[0].quantity == 2
    for bad in ["not json", '{"message": "x"}', '{"message": "x", "trades": [{"side": "short"}], "watchlist_changes": []}', None]:
        reply = parse_response(bad)
        assert reply.trades == [] and "try again" in reply.message


def test_mock_understands_commands():
    reply = mock_response("Please buy 5 aapl and add pypl")
    assert [(t.ticker, t.side, t.quantity) for t in reply.trades] == [("AAPL", "buy", 5.0)]
    assert [(c.ticker, c.action) for c in reply.watchlist_changes] == [("PYPL", "add")]


def test_build_messages_order():
    msgs = build_messages({"cash": 1}, [{"role": "user", "content": "hi"}], "now")
    assert [m["role"] for m in msgs] == ["system", "system", "user", "user"]
    assert msgs[-1]["content"] == "now"


async def test_chat_executes_actions_and_persists(market):
    cache, source = market
    result = await handle_message(cache, source, "buy 3 AAPL and add PYPL")
    assert result["trades"][0]["ticker"] == "AAPL"
    assert result["watchlist_changes"] == [{"ticker": "PYPL", "action": "add"}]
    assert "PYPL" in watchlist.get_tickers()
    assert portfolio.get_portfolio(cache)["positions"][0]["quantity"] == 3
    with connect() as conn:
        rows = conn.execute("SELECT role, actions FROM chat_messages ORDER BY rowid").fetchall()
    assert [r["role"] for r in rows] == ["user", "assistant"]
    assert json.loads(rows[1]["actions"])["trades"][0]["ticker"] == "AAPL"


async def test_chat_reports_failed_trade(market):
    cache, source = market
    result = await handle_message(cache, source, "sell 5 AAPL")
    assert result["trades"] == [] and "Insufficient shares" in result["message"]


async def test_history_is_sent_to_llm(market, monkeypatch):
    cache, source = market
    seen = []

    async def fake_llm(messages):
        seen.append(messages)
        return ChatResponse(message="hi", trades=[], watchlist_changes=[])

    monkeypatch.setattr("app.chat.service.ask_llm", fake_llm)
    await handle_message(cache, source, "first")
    await handle_message(cache, source, "second")
    assert [m["content"] for m in seen[1][2:]] == ["first", "hi", "second"]
