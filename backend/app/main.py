"""FastAPI application: API routes, SSE stream, background tasks and static frontend."""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from . import actions, portfolio
from .api import router
from .db import init_db
from .market import PriceCache, create_market_data_source, create_stream_router

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SNAPSHOT_INTERVAL = 30.0
STATIC_DIR = Path(os.getenv("STATIC_DIR", Path(__file__).resolve().parents[1] / "static"))


async def snapshot_loop(cache: PriceCache) -> None:
    """Record total portfolio value every SNAPSHOT_INTERVAL seconds."""
    while True:
        await asyncio.sleep(SNAPSHOT_INTERVAL)
        try:
            portfolio.record_snapshot(cache)
        except Exception:
            logger.exception("Portfolio snapshot failed")


def create_app() -> FastAPI:
    cache = PriceCache()
    source = create_market_data_source(cache)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        init_db()
        app.state.cache = cache
        app.state.source = source
        await source.start(actions.tracked_tickers())
        portfolio.record_snapshot(cache)
        snapshots = asyncio.create_task(snapshot_loop(cache))
        yield
        snapshots.cancel()
        await source.stop()

    app = FastAPI(title="FinAlly", lifespan=lifespan)
    app.include_router(router)
    app.include_router(create_stream_router(cache))
    if STATIC_DIR.is_dir():
        app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
    return app


app = create_app()
