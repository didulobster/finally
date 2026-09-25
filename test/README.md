# FinAlly E2E tests

Playwright specs in `e2e/`, run against the app container with `LLM_MOCK=true` and a fresh database.
Specs share one backend, so they run serially in file order. `01-fresh-start` expects a fresh DB.

## Docker (recommended)

From the repo root:

```bash
docker compose -f test/docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from playwright
docker compose -f test/docker-compose.test.yml down
```

The DB lives on a tmpfs, so every run starts clean. The HTML report is written to `test/playwright-report/`.

## Local

From the repo root, build the frontend and serve it on port 8000 with a fresh DB:

```bash
npm --prefix frontend run build
rm -f /tmp/finally-e2e.db
DB_PATH=/tmp/finally-e2e.db STATIC_DIR="$PWD/frontend/out" LLM_MOCK=true MASSIVE_API_KEY= \
  uv run --directory backend uvicorn app.main:app --port 8000
```

Then, in another terminal:

```bash
cd test
npm ci
npx playwright install chromium
npx playwright test                 # BASE_URL defaults to http://localhost:8000
npx playwright show-report
```
