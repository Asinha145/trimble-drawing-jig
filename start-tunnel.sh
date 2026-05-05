#!/bin/bash

echo "Starting Trimble JIG Extension with Cloudflare Tunnel..."
echo ""

# Start dev server in background
echo "Starting dev server on port 3000..."
npm run dev &
DEV_PID=$!

echo "Waiting for dev server to start..."
sleep 5

# Start cloudflare tunnel
echo "Starting Cloudflare Tunnel..."
echo ""
echo "Copy the URL shown below and paste it into tc_dev_manifest.json as the 'url' value:"
echo ""
cloudflared tunnel --url http://localhost:3000

# Cleanup on exit
trap "kill $DEV_PID" EXIT
