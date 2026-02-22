#!/bin/bash
set -e

TRANSPORT_TYPE=httpStream PORT=3001 REDDIT_SAFE_MODE=standard \
  node node_modules/reddit-mcp-server/dist/bin.js &
BACKEND_PID=$!

# Wait for backend to be ready
for i in $(seq 1 10); do
  if curl -sf http://127.0.0.1:3001/mcp > /dev/null 2>&1 || [ $? -eq 22 ]; then
    break
  fi
  sleep 1
done

PORT=3000 node auth-proxy.mjs &
PROXY_PID=$!

# Exit if either process dies
wait -n $BACKEND_PID $PROXY_PID
exit 1
