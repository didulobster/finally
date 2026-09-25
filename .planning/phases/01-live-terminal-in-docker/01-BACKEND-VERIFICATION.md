# Phase 01: Backend Verification (BACK-01 / BACK-02)

**Date:** 2026-09-25
**Method (D-13):** Pass A read the code and cites file:line. Pass B ran a live probe against a fresh DB:
`DB_PATH=$TMPDIR/probe0101/probe.db LLM_MOCK=true MASSIVE_API_KEY= STATIC_DIR=<missing dir> uv run --directory backend uvicorn app.main:app --port 8000`, with one curl per §8 endpoint. The server was stopped afterwards. `db/finally.db` was not touched (mtime is still Sep 24, and `git status --porcelain db/` is clean). No provider key was used, and no environment variable values were read or printed.

Result values: PASS, GAP, FIXED (<test>), OUT OF SCOPE, NOT EXERCISED.

## §5 Environment

| PLAN.md item | Observed | Result |
|---|---|---|
| `MASSIVE_API_KEY` non-empty selects Massive, else the simulator | `factory.py:13-16`: `os.getenv("MASSIVE_API_KEY", "").strip()`; truthy gives `MassiveDataSource`, otherwise `SimulatorDataSource`. Test `test_factory` (`tests/market/test_massive.py:49`). In the live probe the key was set to empty and the simulator ran (seed prices AAPL 190.0, GOOGL 175.0 in SSE). | PASS |
| `LLM_MOCK=true` gives deterministic mock replies | `llm.py:85-86` returns `mock_response(...)` when `LLM_MOCK` is `true`; `llm.py:69-80` builds `"Mock response to: {msg}"` and parses `buy/sell N TICKER` and `add/remove TICKER`. Live: reply `"Mock response to: How is my portfolio doing?"`. | PASS |
| `.env` read from the project root | `main.py:19` `load_dotenv(Path(__file__).resolve().parents[2] / ".env")` resolves to `<repo>/.env` locally. It does not override variables that are already set, so the probe's explicit env won. In the container it resolves to `/app/.env` (Dockerfile `WORKDIR /app/backend`), and `--env-file` supplies the variables. | PASS |
| `OPENROUTER_API_KEY` used for real chat | Read implicitly by LiteLLM for `openrouter/...` models (`llm.py:88-95`). Not exercised: no live provider call was made (by rule). | NOT EXERCISED |

## §6 Market data

| PLAN.md item | Observed | Result |
|---|---|---|
| Simulator: GBM | `simulator.py:48-50`: `S*exp((mu - sigma^2/2)*dt + sigma*sqrt(dt)*z)`. Test `test_realised_volatility_matches_sigma`. | PASS |
| Simulator: ~500 ms updates | `simulator.py:104` `interval: float = 0.5`, `simulator.py:133-140` loop; `dt = 0.5 / TRADING_SECONDS_PER_YEAR` (`simulator.py:28`). Live SSE: 6 data events in 3 s. | PASS |
| Simulator: correlated moves | Cholesky of the sector correlation matrix (`simulator.py:44`, `79-98`); intra-sector 0.6, cross-sector 0.3, TSLA 0.3 (`seed_prices.py:30-32`). Test `test_sector_correlation`. | PASS |
| Simulator: random 2-5% events | `simulator.py:51-52` `price *= 1 ± uniform(0.02, 0.05)` with `event_probability=0.0001` (`simulator.py:29`). Test `test_shock_event_moves_two_to_five_percent`. | PASS |
| Simulator: realistic seed prices | `seed_prices.py:3-6` (AAPL 190, GOOGL 175, MSFT 420, ... NFLX 600); unknown tickers `uniform(50, 300)` (`simulator.py:77`). Live: new ticker PYPL priced 70.73. | PASS |
| Massive: polls the union of tickers in one snapshot call every 15 s | `massive_client.py:31` `poll_interval: float = 15.0`; `massive_client.py:70-72` one `get_snapshot_all(STOCKS, tickers=self._tickers)`; tracked set = watchlist + positions (`actions.py:24-25`, passed at `main.py:62`). | PASS |
| Massive: parses into the same format | `massive_client.py:15-25` `snapshot_price` fallback chain, then `cache.update(...)` (`massive_client.py:83`) produces the same `PriceUpdate`. Tests `test_snapshot_price_prefers_last_trade`, `test_snapshot_price_falls_back_to_minute_then_prev_day`, `test_poll_writes_cache_and_survives_errors`. | PASS |
| Massive: real API call | Not exercised: no key was used (by rule). | NOT EXERCISED |
| Both implement one abstract interface | `interface.py:6-27` `MarketDataSource(ABC)`; `SimulatorDataSource(MarketDataSource)` (`simulator.py:101`), `MassiveDataSource(MarketDataSource)` (`massive_client.py:28`). | PASS |
| Price cache holds latest price, previous price, timestamp | `cache.py:17-30` stores a `PriceUpdate(ticker, price, previous_price, timestamp, open_price)`, with `previous_price` taken from the prior entry and a `version` bump. Test `test_cache_tracks_previous_price_and_version`. | PASS |
| SSE `GET /api/stream/prices`: ~500 ms, all tickers, one JSON object keyed by ticker with price, previous price, timestamp, change, change %, direction | Live `curl -N --max-time 3`: `HTTP/1.1 200`, `content-type: text/event-stream; charset=utf-8`, `cache-control: no-cache`, `x-accel-buffering: no`; body starts `retry: 1000`, then `data: {"AAPL": {"ticker": "AAPL", "price": 190.0, "previous_price": 190.0, "timestamp": 1790308415.90, "change": 0.0, "change_percent": 0.0, "direction": "flat", "open_price": 190.0, "session_change_percent": 0.0}, "GOOGL": {...}` with 10 ticker keys (AAPL AMZN GOOGL JPM META MSFT NFLX NVDA TSLA V); 6 events in 3 s. Code: `stream.py:30-37`. | PASS |

## §7 Database

| PLAN.md item | Observed | Result |
|---|---|---|
| Lazy init: creates schema if the file or tables are missing | `main.py:59` `init_db()` in lifespan; `database.py:51-55` `mkdir` plus `executescript(schema.sql)` with `CREATE TABLE IF NOT EXISTS`. Live: a fresh `$TMPDIR` DB came up seeded. Tests `test_init_creates_missing_directory_and_all_tables`, `test_init_recreates_missing_table_without_reseeding`. | PASS |
| Six tables with PLAN.md columns | `schema.sql:1-49`: `users_profile(id, cash_balance, created_at)`, `watchlist(id, user_id, ticker, added_at)`, `positions(id, user_id, ticker, quantity, avg_cost, updated_at)`, `trades(id, user_id, ticker, side, quantity, price, executed_at)`, `portfolio_snapshots(id, user_id, total_value, recorded_at)`, `chat_messages(id, user_id, role, content, actions, created_at)`. | PASS |
| `user_id` defaults to `"default"` | `schema.sql:9,17,27,37,44` `DEFAULT 'default'`; `users_profile.id DEFAULT 'default'` (`schema.sql:2`). Test `test_user_id_defaults_to_default`. | PASS |
| UNIQUE `(user_id, ticker)` on watchlist and positions | `schema.sql:12` and `schema.sql:22`. Test `test_unique_user_ticker`. | PASS |
| Seed: default user with 10000.0 and 10 tickers in order | `database.py:14-15`, `database.py:56-65` (seeds once). Live `GET /api/portfolio`: `{"cash_balance":10000.0,"positions":[],"positions_value":0,"total_value":10000.0,"unrealized_pnl":0}`; `GET /api/watchlist` tickers `['AAPL','GOOGL','MSFT','AMZN','TSLA','NVDA','META','JPM','V','NFLX']`. | PASS |
| Snapshots every 30 s and right after each trade | `main.py:23` `SNAPSHOT_INTERVAL = 30.0`, `main.py:43-50` loop, `main.py:63` startup snapshot; `actions.py:48` after every trade (REST and chat). Live history timestamps: startup 03:53:07, manual trade 03:53:27, chat trade 03:53:36, periodic 03:53:37 (30 s after startup). | PASS |
| CONCERNS: broad `except Exception` in background loops | `main.py:49`, `simulator.py:138`, `massive_client.py:73`, `llm.py:96`. Soft item, does not break PLAN.md or any spec (D-14). | OUT OF SCOPE |
| CONCERNS: avg-cost fallback when no live price | `portfolio.py:78`. Soft item; held tickers are always tracked, so a price exists (D-14). | OUT OF SCOPE |
| CONCERNS: unbounded chat history table | `service.py:37-42` writes are unbounded; reads are capped at 20 (`service.py:10`). Soft item (D-14). | OUT OF SCOPE |
| CONCERNS: missing indexes | `schema.sql` has only PK/UNIQUE. Single-user scale; soft item (D-14). | OUT OF SCOPE |
| CONCERNS: `isolation_level=None` + `BEGIN IMMEDIATE` style | `database.py:37-46`. Intentional serialization; test `test_concurrent_read_modify_write_is_serialized` passes. Soft item (D-14). | OUT OF SCOPE |

## §8 API endpoints

| PLAN.md item | Observed | Result |
|---|---|---|
| `GET /api/health` | `{"status":"ok"}` [HTTP 200] (`api.py:33-35`) | PASS |
| `GET /api/portfolio` (positions, cash, total value, unrealized P&L) | Fresh: `{"cash_balance":10000.0,"positions":[],"positions_value":0,"total_value":10000.0,"unrealized_pnl":0}` [200]. After trades: `{"cash_balance":8210.86,"positions":[{"ticker":"AAPL","quantity":1.0,"avg_cost":190.02,"current_price":189.98,"market_value":189.98,"unrealized_pnl":-0.04,"pnl_percent":-0.02},{"ticker":"NVDA",...}],"positions_value":1789.88,"total_value":10000.74,"unrealized_pnl":0.74}` | PASS |
| `POST /api/portfolio/trade` buy fills at the live price | `{"ticker":"AAPL","quantity":1,"side":"buy"}` gives [HTTP 200] `{"trade":{"ticker":"AAPL","side":"buy","quantity":1.0,"price":190.02,...},"portfolio":{"cash_balance":9809.98,...}}`; cash dropped 10000 to 9809.98. | PASS |
| `POST /api/portfolio/trade` sell more than held is rejected | `{"ticker":"AAPL","quantity":1000,"side":"sell"}` gives [HTTP 400] `{"detail":"Insufficient shares: trying to sell 1000 AAPL, hold 1"}`, which matches the 03-trading spec regex `/insufficient shares/i`. | PASS |
| `POST /api/portfolio/trade` buy without enough cash is rejected | `{"ticker":"AAPL","quantity":1000000,"side":"buy"}` gives [HTTP 400] `{"detail":"Insufficient cash: need $190,020,000.00, have $9,809.98"}`, which matches the 03-trading spec regex `/insufficient cash/i`. | PASS |
| `GET /api/portfolio/history` (snapshots for the P&L chart) | Before the trade: 1 row `[{"total_value":10000.0,"recorded_at":"2026-09-25T03:53:07.78+00:00"}]`. After: a second row `{"total_value":10000.0,"recorded_at":"2026-09-25T03:53:27.70+00:00"}` recorded at the trade time. Non-empty, as 04-portfolio-viz expects. | PASS |
| `GET /api/watchlist` (tickers with latest prices) | [200] 10 tickers in seed order; entry `{'ticker':'AAPL','price':190.02,'previous_price':190.03,'timestamp':1790308407.37,'change':-0.01,'change_percent':-0.0053,'direction':'down','open_price':190.0,'session_change_percent':0.0105}` (`api.py:59-66`). | PASS |
| `POST /api/watchlist` (lowercase input stored uppercased) | `{"ticker":"pypl"}` gives [HTTP 201] `{"ticker":"PYPL","price":70.73}`; the next `GET /api/watchlist` ends with `'PYPL'`. Invalid `{"ticker":"TOOLONG1"}` gives [400] `{"detail":"Invalid ticker: 'TOOLONG1'"}`. | PASS |
| `DELETE /api/watchlist/{ticker}` | `DELETE /api/watchlist/PYPL` gives [HTTP 200] `{"ticker":"PYPL","removed":true}`; repeating it gives [HTTP 404] `{"detail":"PYPL is not on the watchlist"}`. | PASS |
| `POST /api/chat` plain message | `"How is my portfolio doing?"` gives [200] `{"message":"Mock response to: How is my portfolio doing?","trades":[],"watchlist_changes":[],"errors":[]}`. Empty message gives [422] `string_too_short`. | PASS |
| `POST /api/chat` executes a trade | `"buy 2 NVDA"` gives [200] `"trades":[{"ticker":"NVDA","side":"buy","quantity":2.0,"price":799.56,...}]`; portfolio then shows an NVDA position of 2. | PASS |
| `POST /api/chat` reports a failed trade | `"sell 500 V"` gives [200] `"message":"Mock response to: sell 500 V\n\nTrade sell 500 V failed: Insufficient shares: trying to sell 500 V, hold 0"`, which matches the 05-chat regex `/insufficient shares/i`. | PASS |
| `POST /api/chat` watchlist changes | `"add PYPL"` gives `"watchlist_changes":[{"ticker":"PYPL","action":"add"}]`; `"remove PYPL"` gives `"watchlist_changes":[{"ticker":"PYPL","action":"remove"}]`. | PASS |
| `GET /api/chat` (stored history, used by the 05-chat reload test) | [200] 10 messages, oldest first, alternating user/assistant; assistant rows carry `actions` (`api.py:91-93`, `service.py:18-29`). | PASS |
| `GET /api/stream/prices` | See the §6 SSE row: `retry: 1000`, then `data:` events keyed by ticker, `text/event-stream`. | PASS |
| Unknown `/api/*` path | `GET /api/nope` gives [404] `{"detail":"Not Found"}` (the SPA fallback skips `api` paths, `main.py:31`). | PASS |

## §9 LLM

| PLAN.md item | Observed | Result |
|---|---|---|
| Structured output schema `message`, `trades`, `watchlist_changes` parsed with Pydantic | `llm.py:30-44` `TradeInstruction`, `WatchlistChange`, `ChatResponse`; `llm.py:57-66` `model_validate_json` with a fallback message on `ValidationError`. The lists are required fields, which is what strict structured outputs demand; the system prompt tells the model to send empty lists (`llm.py:25-27`). Test `test_parse_valid_and_malformed`. | PASS |
| Model `openrouter/openai/gpt-oss-120b`, Cerebras provider, `response_format`, per the cerebras skill | `llm.py:13` `MODEL`, `llm.py:14` `EXTRA_BODY = {"provider": {"order": ["cerebras"]}}`, `llm.py:88-95` `completion(model=MODEL, messages=..., response_format=ChatResponse, reasoning_effort="low", extra_body=EXTRA_BODY)`, the same call shape as `.claude/skills/cerebras/SKILL.md`. Test `test_live_path_calls_cerebras_with_structured_output` (mocked `completion`). | PASS |
| Prompt: system message ("FinAlly, an AI trading assistant"), portfolio context, history, new message | `llm.py:19-27` system prompt; `llm.py:47-54` message order; `service.py:13-15` context = portfolio (cash, positions with P&L, total) plus watchlist prices; `service.py:32-34` history (20). Tests `test_build_messages_order`, `test_prompt_contains_system_prompt_and_context`, `test_history_is_sent_to_llm`. | PASS |
| Trades auto-execute through the same validation as manual trades | `service.py:50` calls `actions.trade(...)`, the same function as `api.py:48`. Live: chat `"buy 2 NVDA"` filled; `"sell 500 V"` was rejected by the same `TradeError`. | PASS |
| Failed-trade errors reach the reply | `service.py:51-52` collects the errors, `service.py:69-70` appends them to the message. Live: the `"sell 500 V"` reply includes `Insufficient shares`. | PASS |
| User and assistant messages and actions stored in `chat_messages` | `service.py:65` saves the user message, `service.py:71` saves the assistant message with `actions` JSON. Live `GET /api/chat`: 10 rows, assistant rows have `actions`. | PASS |
| Real OpenRouter / Cerebras call | Not exercised: the probe ran with `LLM_MOCK=true` and no provider call (by rule). Provider failure returns an apology (`llm.py:96-98`, test `test_provider_error_returns_apology_without_actions`). | NOT EXERCISED |

## Pytest

| PLAN.md item | Observed | Result |
|---|---|---|
| §12 backend unit tests pass | `UV_CACHE_DIR=$TMPDIR/uvcache uv run --directory backend pytest -q` gives `75 passed, 2 warnings in 2.36s` (0 failed, 0 errors, 0 skipped; the warnings are Starlette/anyio deprecations in third-party code). | PASS |

## Fixes

No breaking gaps found; no backend changes.

- Checked and ruled out: the first SSE event showed AAPL at 190.0 flat, which looked like a possible simulator reset after the trade. Three follow-up reads gave 190.02, 190.0, 189.98 with `open_price` 190.0, so it is the normal cent-level random walk, not a reset.
- Error text is capitalized (`Insufficient cash`, `Insufficient shares`, `portfolio.py:30,36`). Both E2E specs match case-insensitively (`/insufficient cash/i`, `/insufficient shares/i`), so this is not a gap.
