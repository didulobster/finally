"""REST routes for portfolio, watchlist, chat and health."""

from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from . import actions, portfolio, watchlist
from .chat import get_history, handle_message
from .market import MarketDataSource, PriceCache

router = APIRouter(prefix="/api")


class TradeRequest(BaseModel):
    ticker: str
    quantity: float = Field(gt=0)
    side: Literal["buy", "sell"]


class WatchlistRequest(BaseModel):
    ticker: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)


def market(request: Request) -> tuple[PriceCache, MarketDataSource]:
    return request.app.state.cache, request.app.state.source


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/portfolio")
async def get_portfolio(request: Request) -> dict:
    cache, _ = market(request)
    return portfolio.get_portfolio(cache)


@router.post("/portfolio/trade")
async def trade(req: TradeRequest, request: Request) -> dict:
    cache, source = market(request)
    try:
        result = await actions.trade(cache, source, req.ticker, req.side, req.quantity)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"trade": result, "portfolio": portfolio.get_portfolio(cache)}


@router.get("/portfolio/history")
async def history() -> list[dict]:
    return portfolio.get_history()


@router.get("/watchlist")
async def get_watchlist(request: Request) -> list[dict]:
    cache, _ = market(request)
    items = []
    for ticker in watchlist.get_tickers():
        update = cache.get(ticker)
        items.append(update.to_dict() if update else {"ticker": ticker, "price": None})
    return items


@router.post("/watchlist", status_code=201)
async def add_to_watchlist(req: WatchlistRequest, request: Request) -> dict:
    cache, source = market(request)
    try:
        ticker = await actions.add_to_watchlist(source, req.ticker)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ticker": ticker, "price": cache.get_price(ticker)}


@router.delete("/watchlist/{ticker}")
async def remove_from_watchlist(ticker: str, request: Request) -> dict:
    _, source = market(request)
    try:
        ticker = await actions.remove_from_watchlist(source, ticker)
    except actions.NotOnWatchlist as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ticker": ticker, "removed": True}


@router.get("/chat")
async def chat_history() -> list[dict]:
    return get_history()


@router.post("/chat")
async def chat(req: ChatRequest, request: Request) -> dict:
    cache, source = market(request)
    return await handle_message(cache, source, req.message)
