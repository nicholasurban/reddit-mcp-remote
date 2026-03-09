#!/bin/bash
set -e

echo "[entrypoint] Starting backend on port 3001..."
TRANSPORT_TYPE=httpStream PORT=3001 REDDIT_SAFE_MODE=standard \
  node --require ./reddit-proxy-shim.cjs node_modules/reddit-mcp-server/dist/bin.js 2>&1 &
BACKEND_PID=$!

# Wait for backend to be ready
for i in $(seq 1 10); do
  if curl -sf http://127.0.0.1:3001/mcp > /dev/null 2>&1 || [ $? -eq 22 ]; then
    echo "[entrypoint] Backend ready after ${i}s"
    break
  fi
  sleep 1
done

echo "[entrypoint] Starting auth-proxy on port 3000..."
PORT=3000 node auth-proxy.mjs 2>&1 &
PROXY_PID=$!

# Log which process exits
wait -n $BACKEND_PID $PROXY_PID
EXIT_CODE=$?

# Check which one died
if ! kill -0 $BACKEND_PID 2>/dev/null; then
  echo "[entrypoint] BACKEND (PID $BACKEND_PID) exited with code $EXIT_CODE"
elif ! kill -0 $PROXY_PID 2>/dev/null; then
  echo "[entrypoint] PROXY (PID $PROXY_PID) exited with code $EXIT_CODE"
fi

exit 1
