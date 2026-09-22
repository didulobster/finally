"""LLM call via LiteLLM -> OpenRouter (Cerebras) with structured output, plus a mock."""

import asyncio
import json
import os
import re
from typing import Literal

from litellm import completion
from pydantic import BaseModel, ValidationError

MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras"]}}

SYSTEM_PROMPT = """You are FinAlly, an AI trading assistant in a simulated trading workstation (fake money).
- Analyze portfolio composition, risk concentration and P&L.
- Suggest trades with brief reasoning; execute trades when the user asks or agrees.
- Manage the watchlist proactively when useful.
- Be concise and data-driven.
Trades are market orders filled instantly at the current price. Use fractional quantities only if asked.
Always respond with JSON matching the schema: "message" (text shown to the user),
"trades" (list of {ticker, side: buy|sell, quantity}) and "watchlist_changes"
(list of {ticker, action: add|remove}). Use empty lists when there is nothing to do."""


class TradeInstruction(BaseModel):
    ticker: str
    side: Literal["buy", "sell"]
    quantity: float


class WatchlistChange(BaseModel):
    ticker: str
    action: Literal["add", "remove"]


class ChatResponse(BaseModel):
    message: str
    trades: list[TradeInstruction]
    watchlist_changes: list[WatchlistChange]


def build_messages(context: dict, history: list[dict], user_message: str) -> list[dict]:
    """System prompt + portfolio context + prior conversation + the new message."""
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": "Current portfolio and watchlist:\n" + json.dumps(context)},
        *history,
        {"role": "user", "content": user_message},
    ]


def parse_response(content: str | None) -> ChatResponse:
    """Validate the model's JSON; fall back to a plain message if it is malformed."""
    try:
        return ChatResponse.model_validate_json(content or "")
    except ValidationError:
        return ChatResponse(
            message="Sorry, I couldn't produce a valid response. Please try again.",
            trades=[],
            watchlist_changes=[],
        )


def mock_response(user_message: str) -> ChatResponse:
    """Deterministic reply for tests: understands 'buy/sell N TICKER' and 'add/remove TICKER'."""
    text = user_message.lower()
    trades = [
        TradeInstruction(ticker=t.upper(), side=side, quantity=float(qty))
        for side, qty, t in re.findall(r"\b(buy|sell)\s+(\d+(?:\.\d+)?)\s+([a-z]{1,5})\b", text)
    ]
    changes = [
        WatchlistChange(ticker=t.upper(), action=action)
        for action, t in re.findall(r"\b(add|remove)\s+([a-z]{1,5})\b", text)
    ]
    return ChatResponse(message=f"Mock response to: {user_message}", trades=trades, watchlist_changes=changes)


async def ask_llm(messages: list[dict]) -> ChatResponse:
    """Return the assistant's structured reply, or a mock when LLM_MOCK=true."""
    if os.getenv("LLM_MOCK", "").lower() == "true":
        return mock_response(messages[-1]["content"])
    response = await asyncio.to_thread(
        completion,
        model=MODEL,
        messages=messages,
        response_format=ChatResponse,
        reasoning_effort="low",
        extra_body=EXTRA_BODY,
    )
    return parse_response(response.choices[0].message.content)
