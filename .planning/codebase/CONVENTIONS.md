---
last_mapped_commit: 7f7cd7c670c507ac353eb6fe89563c5b28f50406
last_mapped_at: 2026-09-25
---
# Coding Conventions

<!-- refreshed: 2026-09-25 -->

**Analysis Date:** 2026-09-25

## Naming Patterns

**Files:**

- Module files: lowercase with underscores (`portfolio.py`, `market_data.py`)
- Test files: `test_*.py` in backend, `*.spec.ts` in E2E tests
- Dataclasses and frozen models: descriptive names like `PriceUpdate`
- Helper modules: descriptive purpose-based names (`seed_prices.py`, `database.py`)

**Functions:**

- Snake_case for all function names (`execute_trade()`, `record_snapshot()`, `get_portfolio()`)
- Private functions not prefixed with underscore — conventionally internal only
- Async functions use same naming convention as sync (`async def handle_message()`)
- Helper functions have descriptive names indicating purpose (`normalize_ticker()`, `percent_change()`)

**Variables:**

- Snake_case for local variables and parameters
- UPPER_CASE for module-level constants (`DEFAULT_USER`, `SNAPSHOT_INTERVAL`, `EPSILON`)
- Single letters acceptable only in loops (`for r in rows`)
- Dataclass fields use snake_case (`previous_price`, `session_change_percent`)

**Types:**

- PascalCase for classes (`PriceUpdate`, `TradeError`, `SPAStaticFiles`)
- PascalCase for custom exceptions (`NotOnWatchlist`, `TradeError`)
- Exceptions inherit from appropriate base (`ValueError`, `ABC` for abstract classes)

## Code Style

**Formatting:**

- No explicit formatter configured (no `.prettierrc`, `.eslintrc`, `black.toml`)
- Python: Follow PEP 8 implicitly — 4-space indentation, clear readability
- TypeScript/JavaScript: Standard formatting in Playwright tests
- Line length: Implied ~100-120 characters (lines fit naturally in code)
- Imports organized in groups: standard library, third-party, relative imports

**Linting:**

- No ESLint or Pylint configuration detected
- Code style enforced through clear, simple patterns rather than tooling

## Import Organization

**Order in Python:**

1. Standard library (e.g., `asyncio`, `logging`, `os`, `sqlite3`)
2. Third-party (e.g., `fastapi`, `pydantic`, `dotenv`)
3. Relative imports from project (e.g., `from . import portfolio`, `from .db import connect`)

**Pattern:**

```python
import asyncio
import logging
from pathlib import Path
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI

from . import actions, portfolio
from .db import init_db
```

**Path Aliases:**

- Relative imports only; no configured path aliases
- Use `.` for same package: `from . import portfolio`
- Use `..` for parent package: `from .. import actions`

**TypeScript/JavaScript:**

- Import from Playwright test module: `import { expect, test } from "@playwright/test"`
- Import types separately when needed: `import type { Page, Locator } from "@playwright/test"`

## Error Handling

**Patterns:**

- Custom exceptions inherit from `ValueError` or appropriate base class, not generic `Exception`
- Exceptions include descriptive context: `f"Invalid side: {side!r}"` with repr for clarity
- No try/except for flow control; exceptions are for error conditions only
- Use `raise ... from e` to chain exceptions and preserve context: `raise TradeError(str(e)) from e`
- Finally blocks used for cleanup: `finally: conn.close()` or `finally: await source.stop()`

**API Error Responses:**

- `HTTPException(status_code, message)` from FastAPI
- 400 for validation failures and business logic violations
- 404 for resource not found (`NotOnWatchlist`)
- 422 for Pydantic validation errors (auto-generated)
- Error messages are plain text, included in HTTPException string

**Example from `app/portfolio.py`:**

```python
class TradeError(ValueError):
    """A trade failed validation (bad input, not enough cash or shares)."""

def execute_trade(ticker: str, side: str, quantity: float, price: float) -> dict:
    if side not in ("buy", "sell"):
        raise TradeError(f"Invalid side: {side!r}")
    if quantity <= 0:
        raise TradeError("Quantity must be positive")
```

**Database Transaction Safety:**

- Transactions wrapped in context manager with automatic rollback on error:
  ```python
  with connect() as conn:
      # BEGIN IMMEDIATE taken automatically
      # queries execute
      # COMMIT or ROLLBACK on exit
  ```

## Logging

**Framework:** Standard library `logging` module

**Pattern:**

```python
import logging
logger = logging.getLogger(__name__)

# In main module setup:

logging.basicConfig(level=logging.INFO)
```

**Usage:**

- `logger.exception()` in exception handlers to capture full stack trace: `logger.exception("Portfolio snapshot failed")`
- Informal logging; no structured logging (JSON) configured
- Logs to stdout (console), no file rotation configured

**When to Log:**

- Exceptions that are caught and handled (not re-raised immediately)
- Background task failures (e.g., snapshot loop failures)
- Not for every function call or debug tracing

**Example from `app/main.py`:**

```python
async def snapshot_loop(cache: PriceCache) -> None:
    """Record total portfolio value every SNAPSHOT_INTERVAL seconds."""
    while True:
        await asyncio.sleep(SNAPSHOT_INTERVAL)
        try:
            portfolio.record_snapshot(cache)
        except Exception:
            logger.exception("Portfolio snapshot failed")  # Log but continue
```

## Comments

**When to Comment:**

- Explain "why" not "what" — code should be self-documenting on the "what"
- Document non-obvious invariants: `# BEGIN IMMEDIATE takes the write lock up front, so read-then-write logic...`
- Explain algorithm choices or performance tradeoffs
- Rarely used; clear naming and structure preferred

**Docstrings (Module and Function):**

- Module-level docstring at top of file explaining module purpose
- Function docstrings (one line or multi-line) on functions
- Optional on trivial getters/setters

**Pattern:**

```python
"""FastAPI application: API routes, SSE stream, background tasks and static frontend."""

async def snapshot_loop(cache: PriceCache) -> None:
    """Record total portfolio value every SNAPSHOT_INTERVAL seconds."""

def db_path() -> Path:
    return Path(os.getenv("DB_PATH", DEFAULT_DB_PATH))  # No docstring needed — obvious
```

**JSDoc/TSDoc:**

- Function docstrings in comments above function for clarity in TypeScript/JavaScript:
  ```typescript
  /** Remove a ticker via its row's remove button, which only shows on hover. */
  export async function removeFromWatchlist(page: Page, ticker: string): Promise<void> {
  ```

## Function Design

**Size:**

- Small, focused functions (typically 5-20 lines)
- Each function does one thing
- Examples: `normalize_ticker()` (5 lines), `execute_trade()` (25 lines), `get_portfolio()` (30 lines)

**Parameters:**

- Use positional arguments for required parameters
- Use default values for optional parameters
- Pydantic models for complex request payloads: `class TradeRequest(BaseModel)`
- Dataclass or dict for returns with multiple fields

**Return Values:**

- Explicit return type hints: `-> dict`, `-> list[dict]`, `-> str`
- Return dict for complex results (not custom classes unless shared across modules)
- Return `list[str]` for collections of strings
- Async functions return same types as sync equivalents

**Example:**

```python
def get_portfolio(cache: PriceCache) -> dict:
    """Cash, positions valued at live prices, total value and unrealized P&L."""
    # ... implementation
    return {
        "cash_balance": round(cash, 2),
        "positions": positions,
        "total_value": round(cash + positions_value, 2),
    }
```

## Module Design

**Exports:**

- No explicit `__all__` defined
- All non-private names are implicitly exported
- Imports at module level make public API clear: `from .db import connect, new_id, now`

**Barrel Files:**

- Not used; imports are specific to each module
- Example: `from .db import connect` (not `from .db import *`)

**File Size:**

- Typically 50-100 lines per module
- Larger modules (150+ lines): `app/portfolio.py`, `app/api.py`, `app/chat/service.py`
- Split by responsibility: separate files for `db.py`, `portfolio.py`, `market/`, `chat/`

**Structure Example - `app/` directory:**

- `main.py`: FastAPI app creation, lifespan, background tasks
- `api.py`: REST route definitions
- `portfolio.py`: trade execution, portfolio queries
- `watchlist.py`: watchlist state management
- `actions.py`: orchestration of portfolio and watchlist actions
- `chat/`: Separate submodule with `service.py`, `llm.py`
- `market/`: Separate submodule with `interface.py`, `simulator.py`, `cache.py`, etc.
- `db/`: Separate submodule with `database.py` (connection, initialization)

## Type Hints

**Usage:**

- All function signatures include parameter and return type hints
- Pydantic models for API requests: `class TradeRequest(BaseModel)`
- Generic types: `list[str]`, `dict[str, float]`
- Optional types: `dict | None` (Python 3.10+ union syntax)
- Never: `Any` — always specify concrete types

**Examples:**

```python
def execute_trade(ticker: str, side: str, quantity: float, price: float) -> dict:

async def trade(cache: PriceCache, source: MarketDataSource, ticker: str, side: str, quantity: float) -> dict:

def get_history(limit: int = HISTORY_LIMIT) -> list[dict]:

@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
```

## Dataclasses and Models

**Pydantic for API Requests/Responses:**

- Define request models with validation: `class TradeRequest(BaseModel)`
- Use `Field()` for constraints: `Field(gt=0)`, `Field(min_length=1)`
- Use `Literal` for specific values: `side: Literal["buy", "sell"]`

**Frozen Dataclasses for Immutable Data:**

- Used for price updates: `@dataclass(frozen=True, slots=True)`
- Slots for memory efficiency
- Computed properties via `@property` methods

**Example:**

```python
@dataclass(frozen=True, slots=True)
class PriceUpdate:
    ticker: str
    price: float
    previous_price: float
    
    @property
    def change(self) -> float:
        return round(self.price - self.previous_price, 4)
```

## Code Organization in Functions

**Order:**

1. Parameter validation (early returns or exceptions)
2. Compute inputs/setup
3. Main logic
4. Format output/return
5. Cleanup (in finally blocks)

**Example from `app/portfolio.py`:**

```python
def execute_trade(ticker: str, side: str, quantity: float, price: float) -> dict:
    # 1. Validate
    if side not in ("buy", "sell"):
        raise TradeError(f"Invalid side: {side!r}")
    if quantity <= 0:
        raise TradeError("Quantity must be positive")
    
    # 2. Setup
    with connect() as conn:
        cash = conn.execute(...).fetchone()[0]
        position = conn.execute(...).fetchone()
        
        # 3. Compute
        amount = quantity * price
        if side == "buy":
            # ... update cash, position
        
        # 4. Execute/return
        conn.execute("UPDATE ...")
        return trade
```

---

*Convention analysis: 2026-09-25*
