"""Chat flow: build context, call the LLM, auto-execute its actions, persist."""

import json

from .. import actions, portfolio, watchlist
from ..db import DEFAULT_USER, connect, new_id, now
from ..market import MarketDataSource, PriceCache
from .llm import ChatResponse, ask_llm, build_messages

HISTORY_LIMIT = 20


def portfolio_context(cache: PriceCache) -> dict:
    prices = {t: cache.get_price(t) for t in watchlist.get_tickers()}
    return {"portfolio": portfolio.get_portfolio(cache), "watchlist_prices": prices}


def get_history(limit: int = HISTORY_LIMIT) -> list[dict]:
    """Recent chat messages, oldest first, with actions parsed from JSON."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, role, content, actions, created_at FROM chat_messages WHERE user_id = ? "
            "ORDER BY created_at DESC, rowid DESC LIMIT ?",
            (DEFAULT_USER, limit),
        ).fetchall()
    return [
        {**dict(r), "actions": json.loads(r["actions"]) if r["actions"] else None}
        for r in reversed(rows)
    ]


def load_history() -> list[dict]:
    """Prior conversation in LLM message format."""
    return [{"role": m["role"], "content": m["content"]} for m in get_history()]


def save_message(role: str, content: str, actions_taken: dict | None = None) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO chat_messages (id, user_id, role, content, actions, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (new_id(), DEFAULT_USER, role, content, json.dumps(actions_taken) if actions_taken else None, now()),
        )


async def execute_actions(cache: PriceCache, source: MarketDataSource, reply: ChatResponse) -> dict:
    """Run each trade and watchlist change; record results and errors individually."""
    trades, changes, errors = [], [], []
    for t in reply.trades:
        try:
            trades.append(await actions.trade(cache, source, t.ticker, t.side, t.quantity))
        except ValueError as e:
            errors.append(f"Trade {t.side} {t.quantity:g} {t.ticker} failed: {e}")
    for c in reply.watchlist_changes:
        try:
            update = actions.add_to_watchlist if c.action == "add" else actions.remove_from_watchlist
            changes.append({"ticker": await update(source, c.ticker), "action": c.action})
        except ValueError as e:
            errors.append(f"Watchlist {c.action} {c.ticker} failed: {e}")
    return {"trades": trades, "watchlist_changes": changes, "errors": errors}


async def handle_message(cache: PriceCache, source: MarketDataSource, user_message: str) -> dict:
    """Process one user chat message end to end and return the response payload."""
    messages = build_messages(portfolio_context(cache), load_history(), user_message)
    save_message("user", user_message)
    reply = await ask_llm(messages)
    result = await execute_actions(cache, source, reply)
    message = reply.message
    if result["errors"]:
        message += "\n\n" + "\n".join(result["errors"])
    save_message("assistant", message, result)
    return {"message": message, **result}
