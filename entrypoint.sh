#!/bin/sh
TRANSPORT_TYPE=httpStream PORT=3001 REDDIT_SAFE_MODE=standard \
  node node_modules/reddit-mcp-server/dist/bin.js &
sleep 2
PORT=3000 node auth-proxy.mjs
