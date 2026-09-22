# FinAlly Backend

FastAPI app serving the REST API, the SSE price stream and the static frontend on one port.

```bash
uv sync
uv run uvicorn app.main:app --port 8000   # reads ../.env
uv run pytest                              # unit tests (LLM mocked)
```

| Module | Purpose |
|---|---|
| `app/main.py` | App factory, lifespan, 30 s portfolio snapshots, static files (`STATIC_DIR`, default `backend/static`) |
| `app/api.py` | `/api/health`, `/api/portfolio[/trade,/history]`, `/api/watchlist`, `/api/chat` |
| `app/actions.py` | Trades and watchlist changes, keeping the DB and market data source in sync |
| `app/portfolio.py`, `app/watchlist.py` | Trade execution, valuation, snapshots; watchlist persistence |
| `app/chat/` | LLM (LiteLLM → OpenRouter/Cerebras, structured output; `LLM_MOCK=true` for tests) |
| `app/market/` | Simulator / Massive sources, price cache, `/api/stream/prices` (see `planning/MARKET_DATA_SUMMARY.md`) |
| `app/db/` | SQLite schema, lazy init and seed. File at `DB_PATH` (default `<repo>/db/finally.db`) |
