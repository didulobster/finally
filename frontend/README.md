This is the FinAlly Next.js static-export UI.
`npm run build` writes the static site to `out/`.
FastAPI serves it on port 8000 (the Dockerfile copies `out/` to `backend/static/`).
