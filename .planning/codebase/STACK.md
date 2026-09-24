---
last_mapped_commit: 7f7cd7c670c507ac353eb6fe89563c5b28f50406
last_mapped_at: 2026-09-25
---
# Technology Stack

**Analysis Date:** 2026-09-25

## Languages

**Primary:**

- Python 3.12 - Backend runtime, all server-side logic via FastAPI in `backend/` with uv project management

## Runtime & Package Management

**Backend Runtime:**

- Python 3.12 (specified in `backend/.python-version`)

**Package Manager:**

- uv (Python) - Fast, modern package manager with reproducible lockfile
  - Location: `backend/pyproject.toml`
  - Lockfile: `backend/uv.lock` (present, reproducible)
  - Install command: `uv sync`
  - Run command: `uv run <script>`

**Frontend Runtime:**

- Node.js 24-slim - Frontend (deleted from working tree, referenced in Dockerfile Stage 1)
- npm - Frontend package manager
  - Managed via `frontend/package.json` and `frontend/package-lock.json` (files not present in current working tree)

**E2E Testing Runtime:**

- Node.js - via Playwright in `test/package.json`

## Frameworks & Core Dependencies

### Backend (Python)

**Web Framework:**

- FastAPI 0.141.1+ - REST API, SSE streaming, static file serving
  - Location: `backend/app/main.py` (app factory with lifespan context manager)
  - Routes: `backend/app/api.py` (`/api/health`, `/api/portfolio`, `/api/watchlist`, `/api/chat`)

**ASGI Server:**

- uvicorn[standard] 0.53.0+ - ASGI server, runs FastAPI on port 8000
  - Command: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
  - Health check: HTTP GET `http://localhost:8000/api/health`

**Data Validation & Serialization:**

- Pydantic 2.13.5+ - Data validation, structured output parsing for LLM responses
  - Location: `backend/app/chat/llm.py` (TradeInstruction, WatchlistChange, ChatResponse models)
  - Also used in market data models: `backend/app/market/models.py`

**Environment Configuration:**

- python-dotenv 1.2.3+ - Loads `.env` variables
  - Reads from project root `.env` file

**Numeric Computation:**

- NumPy 2.5.3+ - Used in market simulator for GBM calculations
  - Location: `backend/app/market/simulator.py`

**Market Data Client:**

- Massive 2.8.0+ - Polygon.io REST client for real market data
  - Location: `backend/app/market/massive_client.py`
  - Uses: `massive.RESTClient`, `massive.rest.models` (SnapshotMarketType, TickerSnapshot)
  - Triggered when `MASSIVE_API_KEY` environment variable is set

**LLM Integration:**

- LiteLLM 1.102.0+ - Unified LLM API, routes to OpenRouter (Cerebras backend)
  - Location: `backend/app/chat/llm.py`
  - Model: `openrouter/openai/gpt-oss-120b`
  - Features: Structured outputs via Pydantic models, reasoning_effort parameter, provider selection

### Frontend (Not Present in Current Tree)

**Framework:**

- Next.js - Static export build (outputs to `out/` directory)
  - Build target: `output: 'export'` (pre-rendered static HTML/CSS/JS)
  - Served by FastAPI as static files via `SPAStaticFiles` middleware in `backend/app/main.py`
  - Environment: Node.js 24-slim in Dockerfile Stage 1

**Styling:**

- Tailwind CSS - Utility-first CSS framework (noted in README.md)

**Frontend Testing:**

- React Testing Library or similar (inferred from planning docs, not present in current tree)

### E2E Testing

**Framework:**

- Playwright 1.63.0+ - Browser automation for end-to-end tests
  - Located in `test/` directory with `test/package.json`
  - Config: likely `test/playwright.config.ts` or similar (separate from backend)

## Build & Development Tools

**Backend Testing:**

- pytest 9.1.1+ - Unit test runner
  - Location: `backend/tests/`
  - Config: `backend/pyproject.toml` → `[tool.pytest.ini_options]`
  - Async support: pytest-asyncio 1.4.0+, asyncio_mode = "auto"

**Development Dependencies (Backend):**

- httpx 0.28.1+ - HTTP client for testing
- rich 15.0.0+ - Rich terminal output for logs/debugging

**CLI Tools:**

- python (via uv) - Script running with `uv run <script>`

## Configuration Files

**Backend Configuration:**

- `backend/pyproject.toml` - Project metadata, dependencies, build config, pytest settings
- `backend/.python-version` - Python version constraint (3.12)
- `backend/uv.lock` - Reproducible dependency lock

**Application Configuration:**

- `.env` (gitignored) - Runtime environment variables
  - Example: `.env.example` (checked in)
  - Variables: `OPENROUTER_API_KEY`, `MASSIVE_API_KEY`, `LLM_MOCK`

**Docker Configuration:**

- `Dockerfile` - Multi-stage build (Node stage for frontend, Python stage for backend)
  - Stages: `frontend` (Node 24-slim) → `backend` (Python 3.12-slim) → `app` (final)
  - Entrypoint: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
  - Port: 8000 (single port)
  - Health check: Python HTTP check to `/api/health`

**Container Orchestration:**

- `docker-compose.yml` - Simple single-service wrapper
  - Service: `finally`
  - Volume: `finally-data:/app/db` (persistent SQLite storage)
  - Env file: `.env`
  - Port: 8000:8000

**Deployment & Start Scripts:**

- `scripts/start_mac.sh` - macOS/Linux start script with optional browser open
- `scripts/stop_mac.sh` - macOS/Linux stop script
- `scripts/start_windows.ps1` - Windows PowerShell equivalent
- `scripts/stop_windows.ps1` - Windows PowerShell stop script

## Database

**Type:** SQLite (embedded, file-based)

- Path: `/app/db/finally.db` (volume-mounted at runtime, default `db/finally.db` in repo)
- Connection: Python `sqlite3` standard library
- Isolation: `BEGIN IMMEDIATE` transactions (serialized write lock)
- Row factory: `sqlite3.Row` (dict-like access)
- Lazy initialization: Schema created on first startup if missing

**Schema Definition:**

- Location: `backend/app/db/schema.sql`
- Tables: `users_profile`, `watchlist`, `positions`, `trades`, `portfolio_snapshots`, `chat_messages`
- Initialization: `backend/app/db/database.py` → `init_db()` function
- Seed data: Default user (id="default", cash=10000.0), 10 default tickers (AAPL, GOOGL, MSFT, AMZN, TSLA, NVDA, META, JPM, V, NFLX)

## Key Dependencies (By Purpose)

### Network & Async

- **aiohttp** 3.14.3+ - Async HTTP client (dependency of LiteLLM)
- **httpx** 0.28.1+ - Modern HTTP client (dev/testing)

### Data Processing

- **numpy** 2.5.3+ - Numerical arrays for market simulator GBM calculations
- **pydantic** 2.13.5+ - Data validation and JSON serialization

### Market Data

- **massive** 2.8.0+ - Polygon.io (Massive) REST API client
  - Optional; only used if `MASSIVE_API_KEY` is set
  - Default: built-in market simulator

### AI/LLM

- **litellm** 1.102.0+ - LLM provider abstraction
  - Routes to OpenRouter with Cerebras backend
  - Supports structured outputs via Pydantic

### Infrastructure

- **fastapi** 0.141.1+ - Web framework, async-first
- **uvicorn[standard]** 0.53.0+ - ASGI server with uvloop/httptools for performance
- **python-dotenv** 1.2.3+ - Environment variable loading

### Testing & Development

- **pytest** 9.1.1+ - Test runner
- **pytest-asyncio** 1.4.0+ - Async test support
- **rich** 15.0.0+ - Terminal styling and rich output

## Platform Requirements

**Development:**

- Python 3.12+
- uv (Python package manager)
- Docker (for containerized development/deployment)
- Docker Compose (optional convenience wrapper)

**Production:**

- Docker runtime
- Single container on port 8000
- Persistent volume for SQLite database (volume-mounted)
- Environment variables: `OPENROUTER_API_KEY` (required), `MASSIVE_API_KEY` (optional)

**Deployment Targets:**

- Docker-compatible platforms (Docker Desktop, Docker Swarm, Kubernetes, AWS App Runner, Render, etc.)
- Single port exposure: 8000
- Stateless API (state lives in SQLite volume)

## Build Artifacts

**Frontend Build (Not in Current Tree):**

- Output directory: `frontend/out/` (static export from Next.js)
- Copied to: `backend/static/` in final Docker image
- Served by: FastAPI `SPAStaticFiles` middleware at `/`

**Backend Artifacts:**

- Wheel package: Built via hatchling (configured in `pyproject.toml`)
- Package location: `app/` module

**Docker Image:**

- Final image: Based on `python:3.12-slim`
- Size: Optimized via multi-stage build (Node stage discarded, frontend files copied)
- Registry: Local or pushed to container registry (not configured in repo)

## Version Constraints

| Component | Version | Source |
|-----------|---------|--------|
| Python | >=3.12 | `backend/pyproject.toml` |
| FastAPI | >=0.141.1 | `backend/pyproject.toml` |
| uvicorn | >=0.53.0 | `backend/pyproject.toml` |
| Pydantic | >=2.13.5 | `backend/pyproject.toml` |
| LiteLLM | >=1.102.0 | `backend/pyproject.toml` |
| Massive | >=2.8.0 | `backend/pyproject.toml` |
| NumPy | >=2.5.3 | `backend/pyproject.toml` |
| pytest | >=9.1.1 | `backend/pyproject.toml` (dev group) |
| Node.js | 24-slim | Dockerfile Stage 1 |
| Playwright | ^1.63.0 | `test/package.json` |

---

*Stack analysis: 2026-09-25*
