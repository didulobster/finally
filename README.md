# FinAlly — AI Trading Workstation

An AI-powered trading workstation that streams live market data, lets you trade a simulated $10,000 portfolio, and includes an LLM chat assistant that can analyze positions and execute trades for you. Think Bloomberg terminal with an AI copilot.

Built entirely by coding agents as the capstone project for an agentic AI coding course.

> **Status:** not yet built. The full specification is in [`planning/PLAN.md`](planning/PLAN.md).

## Planned Features

- Live price streaming (SSE) with green/red flash animations and sparklines
- Market orders with instant fills, positions table, P&L chart, portfolio heatmap
- AI chat assistant that can trade and manage your watchlist in plain language
- Built-in market simulator by default, or real data via the Massive (Polygon.io) API

## Stack

- **Frontend:** Next.js + TypeScript (static export), Tailwind CSS
- **Backend:** FastAPI (Python, managed with `uv`), SQLite
- **AI:** LiteLLM → OpenRouter (`openai/gpt-oss-120b` on Cerebras)
- **Deploy:** a single Docker container on port 8000

## Quick Start (once built)

```bash
cp .env.example .env        # add your OPENROUTER_API_KEY
./scripts/start_mac.sh      # Windows: scripts/start_windows.ps1
```

Then open http://localhost:8000. Stop with `./scripts/stop_mac.sh`.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes | API key for the AI chat |
| `MASSIVE_API_KEY` | No | Real market data. If unset, the simulator is used |
| `LLM_MOCK` | No | `true` for deterministic mock AI responses (testing) |

## License

See [LICENSE](LICENSE).
