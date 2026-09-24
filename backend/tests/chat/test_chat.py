import json
from types import SimpleNamespace

import litellm
import pytest

from app import portfolio, watchlist
from app.chat import get_history, handle_message
from app.chat.llm import PROVIDER_ERROR_MESSAGE, ChatResponse, TradeInstruction, ask_llm, build_messages, mock_response, parse_response
from app.chat.service import HISTORY_LIMIT, save_message
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


def test_mock_plain_reply_has_no_actions():
    reply = mock_response("How is my portfolio doing?")
    assert reply.message == "Mock response to: How is my portfolio doing?"
    assert reply.trades == [] and reply.watchlist_changes == []


def test_mock_sell_remove_and_fractional():
    reply = mock_response("sell 0.5 TSLA, remove NFLX")
    assert [(t.ticker, t.side, t.quantity) for t in reply.trades] == [("TSLA", "sell", 0.5)]
    assert [(c.ticker, c.action) for c in reply.watchlist_changes] == [("NFLX", "remove")]


async def test_live_path_calls_cerebras_with_structured_output(monkeypatch):
    monkeypatch.setenv("LLM_MOCK", "false")
    calls = []

    def fake_completion(**kwargs):
        calls.append(kwargs)
        content = '{"message": "done", "trades": [], "watchlist_changes": [{"ticker": "PYPL", "action": "add"}]}'
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])

    monkeypatch.setattr("app.chat.llm.completion", fake_completion)
    reply = await ask_llm([{"role": "user", "content": "hi"}])
    assert reply.watchlist_changes[0].ticker == "PYPL"
    kwargs = calls[0]
    assert kwargs["model"] == "openrouter/openai/gpt-oss-120b"
    assert kwargs["extra_body"] == {"provider": {"order": ["cerebras"]}}
    assert kwargs["response_format"] is ChatResponse
    assert kwargs["reasoning_effort"] == "low"


async def test_prompt_contains_system_prompt_and_context(market, monkeypatch):
    cache, source = market
    seen = []

    async def fake_llm(messages):
        seen.append(messages)
        return ChatResponse(message="hi", trades=[], watchlist_changes=[])

    monkeypatch.setattr("app.chat.service.ask_llm", fake_llm)
    await handle_message(cache, source, "hello")
    system, context = seen[0][0]["content"], seen[0][1]["content"]
    assert "FinAlly" in system
    assert '"cash_balance": 10000.0' in context and '"AAPL"' in context


async def test_history_is_limited(market, monkeypatch):
    cache, source = market
    for i in range(30):
        save_message("user", f"old {i}")
    seen = []

    async def fake_llm(messages):
        seen.append(messages)
        return ChatResponse(message="hi", trades=[], watchlist_changes=[])

    monkeypatch.setattr("app.chat.service.ask_llm", fake_llm)
    await handle_message(cache, source, "latest")
    history = seen[0][2:-1]
    assert len(history) == HISTORY_LIMIT and history[-1]["content"] == "old 29"


async def test_failed_watchlist_change_and_bad_ticker_are_reported(market):
    cache, source = market
    result = await handle_message(cache, source, "remove PYPL and buy 1 zzzzzz")
    assert result["watchlist_changes"] == [] and result["trades"] == []
    assert "PYPL is not on the watchlist" in result["message"]
    assert len(result["errors"]) == 1


async def test_llm_invalid_ticker_is_an_error_not_a_crash(market, monkeypatch):
    cache, source = market

    async def fake_llm(messages):
        return ChatResponse(
            message="ok",
            trades=[TradeInstruction(ticker="BRK.B", side="buy", quantity=1)],
            watchlist_changes=[],
        )

    monkeypatch.setattr("app.chat.service.ask_llm", fake_llm)
    result = await handle_message(cache, source, "buy berkshire")
    assert result["trades"] == [] and "Invalid ticker" in result["errors"][0]


async def test_provider_error_returns_apology_without_actions(market, monkeypatch):
    cache, source = market
    monkeypatch.setenv("LLM_MOCK", "false")

    def failing_completion(**kwargs):
        raise litellm.AuthenticationError("bad key", llm_provider="openrouter", model="m")

    monkeypatch.setattr("app.chat.llm.completion", failing_completion)
    result = await handle_message(cache, source, "buy 1 AAPL")
    assert result == {"message": PROVIDER_ERROR_MESSAGE, "trades": [], "watchlist_changes": [], "errors": []}
    assert portfolio.get_portfolio(cache)["positions"] == []


async def test_get_history_returns_messages_with_parsed_actions(market):
    cache, source = market
    await handle_message(cache, source, "buy 1 AAPL")
    user, assistant = get_history()
    assert (user["role"], user["content"], user["actions"]) == ("user", "buy 1 AAPL", None)
    assert assistant["role"] == "assistant" and assistant["actions"]["trades"][0]["ticker"] == "AAPL"
    assert set(assistant) == {"id", "role", "content", "actions", "created_at"}
    assert get_history(limit=1) == [assistant]
