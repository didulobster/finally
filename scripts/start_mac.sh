#!/usr/bin/env bash
# Start FinAlly in Docker. Flags: --build forces an image rebuild, --no-open skips opening the browser.
set -euo pipefail

IMAGE=finally
CONTAINER=finally
URL=http://localhost:8000
BUILD=false
OPEN=true
for arg in "$@"; do
  case "$arg" in
    --build) BUILD=true ;;
    --no-open) OPEN=false ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "No .env found; copying .env.example (add your OPENROUTER_API_KEY)."
  cp .env.example .env
fi

if $BUILD || ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  docker build -t "$IMAGE" .
fi

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" \
  -p 8000:8000 \
  -v finally-data:/app/db \
  --env-file .env \
  "$IMAGE" >/dev/null

echo "FinAlly is running at $URL"
if $OPEN; then
  open "$URL" 2>/dev/null || echo "Could not open a browser; visit $URL manually."
fi
