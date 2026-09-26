# FinAlly frontend

Next.js (App Router, TypeScript, Tailwind v4) built as a static export and served by the FastAPI backend at the same origin. All data comes from `/api/*` and the SSE stream `/api/stream/prices`.

```bash
npm install
npm run build   # static export -> out/
npm test        # Vitest + React Testing Library
npm run lint
```

Try it against a live backend (serves `out/` on port 8001):

```bash
cd ../backend && STATIC_DIR=../frontend/out LLM_MOCK=true uv run uvicorn app.main:app --port 8001
```

Layout: `src/components/Terminal.tsx` owns server state and wires the panels; `src/hooks/usePriceStream.ts` accumulates SSE prices and history; `src/lib/` holds API calls, formatting, live portfolio revaluation and the treemap layout.
