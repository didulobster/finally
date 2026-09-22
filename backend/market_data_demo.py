"""Live terminal view of the market data source, for eyeballing prices.

Uses the same factory as the app: the GBM simulator by default, or Massive
when MASSIVE_API_KEY is set.

    uv run market_data_demo.py                 # run until Ctrl+C
    uv run market_data_demo.py --seconds 30    # stop after 30 s
    uv run market_data_demo.py --events 0.01   # more frequent shock events
"""

import argparse
import asyncio
import time

from rich.console import Console
from rich.live import Live
from rich.table import Table

from app.db.database import DEFAULT_WATCHLIST
from app.market import PriceCache, create_market_data_source
from app.market.simulator import SimulatorDataSource

SPARK_CHARS = "▁▂▃▄▅▆▇█"
HISTORY = 40
SHOCK_THRESHOLD = 0.015  # a single-tick move this large is a shock event


def sparkline(prices: list[float]) -> str:
    low, high = min(prices), max(prices)
    span = high - low or 1
    return "".join(SPARK_CHARS[int((p - low) / span * (len(SPARK_CHARS) - 1))] for p in prices)


def render(cache: PriceCache, start: dict[str, float], history: dict[str, list[float]],
           events: list[str], elapsed: float) -> Table:
    table = Table(title=f"FinAlly market data  ·  {elapsed:5.1f}s  ·  cache v{cache.version}")
    for col in ("Ticker", "Price", "Tick", "Since start", "Sparkline"):
        table.add_column(col, justify="left" if col in ("Ticker", "Sparkline") else "right")
    for ticker, update in cache.get_all().items():
        color = {"up": "green", "down": "red"}.get(update.direction, "white")
        since = (update.price / start[ticker] - 1) * 100
        table.add_row(
            ticker,
            f"[{color}]{update.price:,.2f}[/]",
            f"[{color}]{update.change:+.2f}[/]",
            f"[{'green' if since >= 0 else 'red'}]{since:+.2f}%[/]",
            f"[cyan]{sparkline(history[ticker])}[/]",
        )
    table.caption = "Shock events: " + (", ".join(events[-5:]) if events else "none yet")
    return table


async def run(seconds: float | None, event_probability: float | None) -> None:
    cache = PriceCache()
    source = create_market_data_source(cache)
    await source.start(DEFAULT_WATCHLIST)
    if event_probability is not None and isinstance(source, SimulatorDataSource):
        source._sim._event_probability = event_probability

    start = {t: u.price for t, u in cache.get_all().items()}
    history = {t: [p] for t, p in start.items()}
    events: list[str] = []
    began = time.monotonic()
    last_version = cache.version
    try:
        with Live(console=Console(), refresh_per_second=4) as live:
            while seconds is None or time.monotonic() - began < seconds:
                if cache.version != last_version:
                    last_version = cache.version
                    for ticker, update in cache.get_all().items():
                        history[ticker] = (history[ticker] + [update.price])[-HISTORY:]
                        if abs(update.change_percent) >= SHOCK_THRESHOLD * 100:
                            events.append(f"{ticker} {update.change_percent:+.1f}%")
                live.update(render(cache, start, history, events, time.monotonic() - began))
                await asyncio.sleep(0.25)
    finally:
        await source.stop()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--seconds", type=float, help="stop after this many seconds (default: run until Ctrl+C)")
    parser.add_argument("--events", type=float, help="simulator shock probability per tick (default 0.0001)")
    args = parser.parse_args()
    try:
        asyncio.run(run(args.seconds, args.events))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
