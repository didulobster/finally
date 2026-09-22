# Massive API — Stock Price Reference

> **Archived.** API reference. Summarised in `../MARKET_DATA_SUMMARY.md` §5.

Massive (formerly Polygon.io) provides US stock market data over REST and WebSocket. This document covers what FinAlly needs: **current prices for many tickers at once** and **end-of-day prices**.

Researched September 2026 against the live docs (massive.com/docs) and the official Python client `massive` v2.8.0.

## 1. Essentials

| Item | Value |
|---|---|
| Base URL | `https://api.massive.com` |
| Auth | Header `Authorization: Bearer <KEY>` **or** query param `?apiKey=<KEY>` |
| Python package | `massive` (PyPI) — `uv add massive` |
| Env var read by client | `MASSIVE_API_KEY` |
| Ticker symbols | Case-sensitive, upper case (`AAPL`, not `aapl`) |
| Timestamps | Trades/quotes: Unix **nanoseconds**. Aggregate bars: Unix **milliseconds** |

## 2. Plans — what matters for FinAlly

| Plan | Price | Rate limit | Data freshness | Snapshot endpoints |
|---|---|---|---|---|
| Stocks Basic (free) | $0 | **5 calls/min** | End of day | **No** |
| Stocks Starter | $29/mo | Unlimited | 15-min delayed | Yes |
| Stocks Developer | $79/mo | Unlimited | 15-min delayed | Yes (+ last trade) |
| Stocks Advanced | $199/mo | Unlimited | Real-time | Yes |

"Unlimited" is soft: Massive asks clients to stay under ~100 requests/second.

> **Important for PLAN.md §6:** the free Basic plan does **not** include the snapshot endpoint and only has end-of-day data. A free key can give yesterday's closes, not a live stream. Live polling needs Starter or higher. With a free key, the simulator gives a better demo.

## 3. Endpoints

### 3.1 Full Market Snapshot — many tickers, one call (primary)

```
GET /v2/snapshot/locale/us/markets/stocks/tickers?tickers=AAPL,MSFT,TSLA
```

| Param | Type | Notes |
|---|---|---|
| `tickers` | comma-separated string | Leave it out to get **all** ~10k tickers. Always pass it. |
| `include_otc` | bool | Default `false` |

Plans: Starter and higher. Freshness: 15-min delayed (Starter/Developer) or real-time (Advanced).
One request covers the whole watchlist, so this is the endpoint to poll.

Response:

```json
{
  "status": "OK",
  "count": 1,
  "tickers": [
    {
      "ticker": "AAPL",
      "day":     {"o": 189.5, "h": 191.9, "l": 188.7, "c": 191.2, "v": 41234567, "vw": 190.4},
      "prevDay": {"o": 187.1, "h": 189.6, "l": 186.9, "c": 189.0, "v": 52345678, "vw": 188.3},
      "min":     {"t": 1684428600000, "o": 191.1, "h": 191.3, "l": 191.0, "c": 191.1,
                  "v": 5000, "vw": 191.2, "n": 12, "av": 41234567},
      "lastTrade": {"p": 191.25, "s": 100, "t": 1605192894630916600, "x": 4, "i": "71675577320245", "c": [14, 41]},
      "lastQuote": {"P": 191.26, "S": 2, "p": 191.24, "s": 3, "t": 1605192959994246100},
      "todaysChange": 2.25,
      "todaysChangePerc": 1.19,
      "updated": 1605192894630916600,
      "fmv": null
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `lastTrade.p` | Last trade price. **Best "current price"**, but may be missing on lower tiers |
| `min.c` | Close of the latest minute bar |
| `day.c` | Today's running close |
| `prevDay.c` | Previous session close |
| `todaysChange` / `todaysChangePerc` | Change against `prevDay.c` |
| `updated` | Last update, ns |

**Caveat:** Massive clears the `day` bar at about 3:30am ET. Pre-market it may be zeros until trading starts. Fall back in this order: `lastTrade.p` → `min.c` → `day.c` → `prevDay.c`.

### 3.2 Single Ticker Snapshot

```
GET /v2/snapshot/locale/us/markets/stocks/tickers/{ticker}
```

Returns the same object under `"ticker"` (singular). This is not useful for polling a watchlist, since it costs one call per ticker.

### 3.3 Daily Market Summary (Grouped Daily) — end-of-day for every ticker, one call

```
GET /v2/aggs/grouped/locale/us/market/stocks/{date}?adjusted=true
```

Available on **all plans, including free**. On Basic the data is end of day; paid plans get the current day delayed or real time. It returns every US ticker for that date, so filter client-side.

```json
{
  "status": "OK", "adjusted": true, "queryCount": 3, "resultsCount": 3,
  "results": [
    {"T": "AAPL", "o": 187.1, "h": 189.6, "l": 186.9, "c": 189.0, "v": 52345678, "vw": 188.3, "n": 612345, "t": 1602705600000}
  ]
}
```

If `date` is a weekend or holiday, `results` is empty. Step back a day until it isn't.

### 3.4 Previous Day Bar — end-of-day for one ticker

```
GET /v2/aggs/ticker/{ticker}/prev?adjusted=true
```

Available on all plans. It costs one call per ticker, so 10 tickers would take 2 minutes of the free 5/min budget. Prefer Grouped Daily for multiple tickers.

```json
{"ticker": "AAPL", "status": "OK", "resultsCount": 1,
 "results": [{"T": "AAPL", "o": 187.1, "h": 189.6, "l": 186.9, "c": 189.0, "v": 52345678, "vw": 188.3, "t": 1605042000000}]}
```

### 3.5 Last Trade — one ticker

```
GET /v2/last/trade/{ticker}
```

Developer plan and higher. Response: `{"results": {"T": "AAPL", "p": 129.84, "s": 25, "t": 1617901342969834000}, "status": "OK"}`. One call per ticker, so the snapshot endpoint is better.

### Summary: which endpoint for what

| Need | Endpoint | Calls for N tickers | Min plan |
|---|---|---|---|
| Live-ish prices for watchlist | Full Market Snapshot `?tickers=` | **1** | Starter |
| End-of-day closes for watchlist | Grouped Daily | **1** | Basic (free) |
| Previous close for one ticker | Previous Day Bar | N | Basic (free) |
| Latest trade for one ticker | Last Trade | N | Developer |

## 4. Python client (`massive`)

```bash
uv add massive
```

```python
from massive import RESTClient

client = RESTClient()                    # reads MASSIVE_API_KEY from env
client = RESTClient(api_key="...")       # or explicit
```

The client is **synchronous** (urllib3). Call it with `asyncio.to_thread(...)` in async code. By default it retries failed requests 3 times (`RESTClient(retries=3)`).

### 4.1 Snapshot for multiple tickers

```python
from massive import RESTClient
from massive.rest.models import SnapshotMarketType

client = RESTClient()
snapshots = client.get_snapshot_all(
    SnapshotMarketType.STOCKS,           # or "stocks"
    tickers=["AAPL", "MSFT", "TSLA"],    # list is joined with commas by the client
)
for s in snapshots:                      # list[TickerSnapshot]
    print(s.ticker, s.last_trade.price if s.last_trade else None,
          s.day.close, s.prev_day.close, s.todays_change_percent)
```

`TickerSnapshot` attributes are snake_case versions of the JSON:

| JSON | Python |
|---|---|
| `lastTrade.p`, `lastTrade.t` | `last_trade.price`, `last_trade.sip_timestamp` (ns) |
| `min.c`, `min.t` | `min.close`, `min.timestamp` (ms) |
| `day.c` | `day.close` |
| `prevDay.c` | `prev_day.close` |
| `todaysChange`, `todaysChangePerc` | `todays_change`, `todays_change_percent` |
| `updated` | `updated` (ns) |

Any nested object can be `None`, so check before reading its attributes.

### 4.2 Extracting a price robustly

```python
from massive.rest.models import TickerSnapshot


def snapshot_price(snap: TickerSnapshot) -> tuple[float, float] | None:
    """Best available (price, unix-seconds timestamp) from a snapshot, or None."""
    if snap.last_trade and snap.last_trade.price:
        return snap.last_trade.price, snap.last_trade.sip_timestamp / 1e9
    if snap.min and snap.min.close:
        return snap.min.close, snap.min.timestamp / 1e3
    if snap.day and snap.day.close:
        return snap.day.close, snap.updated / 1e9
    if snap.prev_day and snap.prev_day.close:
        return snap.prev_day.close, snap.updated / 1e9
    return None
```

### 4.3 End-of-day prices for multiple tickers (works on free tier)

```python
from datetime import date, timedelta

from massive import RESTClient


def latest_closes(client: RESTClient, tickers: list[str]) -> dict[str, float]:
    """Most recent daily close for each ticker, via one Grouped Daily call per day tried."""
    wanted = set(tickers)
    day = date.today() - timedelta(days=1)
    for _ in range(7):
        bars = client.get_grouped_daily_aggs(day.isoformat(), adjusted=True)
        if bars:
            return {b.ticker: b.close for b in bars if b.ticker in wanted}
        day -= timedelta(days=1)
    return {}
```

Each loop iteration is one API call. Stepping back over a long weekend can use several calls from the free 5/min budget.

### 4.4 Previous close for one ticker

```python
prev = client.get_previous_close_agg("AAPL")   # list[PreviousCloseAgg]
print(prev[0].close, prev[0].timestamp)        # timestamp in ms
```

### 4.5 Raw HTTP (no client library)

```python
import httpx

resp = httpx.get(
    "https://api.massive.com/v2/snapshot/locale/us/markets/stocks/tickers",
    params={"tickers": "AAPL,MSFT"},
    headers={"Authorization": f"Bearer {api_key}"},
)
resp.raise_for_status()
for t in resp.json()["tickers"]:
    print(t["ticker"], t.get("lastTrade", {}).get("p"), t["prevDay"]["c"])
```

### 4.6 Errors

| Situation | What happens |
|---|---|
| No key passed and `MASSIVE_API_KEY` unset | `massive.exceptions.AuthError` raised in `RESTClient()` |
| Invalid key | `massive.exceptions.BadResponse`: `{"status":"ERROR","error":"Unknown API Key"}` (verified) |
| Endpoint not in plan (e.g. snapshot on Basic) | `BadResponse` (non-200, not-authorized error body; not verified live) |
| Rate limit exceeded (free tier) | HTTP 429 → `BadResponse` after retries |
| Network failure | `urllib3.exceptions.MaxRetryError` |

A poller should catch `Exception` for one poll, log it, and try again on the next interval. It should not crash the background task.

## 5. Polling guidance for FinAlly

- Use **one** `get_snapshot_all(tickers=watchlist)` call per interval, whatever the watchlist size.
- Intervals: Starter/Developer data is 15 minutes delayed, so polling every 15s is plenty. On Advanced, 2–5s is reasonable.
- Free tier: the snapshot is not available. The most you can get is one Grouped Daily call at startup, which gives static prices. Recommend the simulator instead.
- Outside market hours, prices stop changing. This is expected, not a bug.

## Sources

- [Full Market Snapshot](https://massive.com/docs/rest/stocks/snapshots/full-market-snapshot)
- [Daily Market Summary](https://massive.com/docs/rest/stocks/aggregates/daily-market-summary)
- [Previous Day Bar](https://massive.com/docs/rest/stocks/aggregates/previous-day-bar)
- [Last Trade](https://massive.com/docs/rest/stocks/trades-quotes/last-trade)
- [Pricing](https://massive.com/pricing) · [Request limits](https://massive.com/knowledge-base/article/what-is-the-request-limit-for-massives-restful-apis)
- [Python client](https://github.com/massive-com/client-python) · [PyPI `massive`](https://pypi.org/project/massive/)
