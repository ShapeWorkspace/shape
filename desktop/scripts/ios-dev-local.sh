#!/bin/bash
# Runs iOS dev build pointing to local dev servers (Vite + API).
# Usage: ./scripts/ios-dev-local.sh [device-name]

set -e

LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')

if [ -z "$LOCAL_IP" ]; then
  echo "Error: Could not detect local IP address"
  exit 1
fi

VITE_PORT="${VITE_PORT:-5173}"
API_PORT="${API_PORT:-8080}"

echo "==> Local IP: $LOCAL_IP"
echo "==> Vite dev server: http://$LOCAL_IP:$VITE_PORT"
echo "==> API server: http://$LOCAL_IP:$API_PORT"
echo ""
echo "Make sure you're running:"
echo ""
echo "1. Go server:"
echo "   go run ."
echo ""
echo "2. Vite dev server:"
echo "   VITE_API_URL=http://$LOCAL_IP:$API_PORT/api yarn workspace @shape/web dev:mobile --host 0.0.0.0 --port $VITE_PORT"
echo ""

DEVICE="${1:-}"

cd "$(dirname "$0")/.."

if [ -n "$DEVICE" ]; then
  yarn tauri ios dev -c "{\"build\":{\"devUrl\":\"http://$LOCAL_IP:$VITE_PORT\"}}" "$DEVICE"
else
  yarn tauri ios dev -c "{\"build\":{\"devUrl\":\"http://$LOCAL_IP:$VITE_PORT\"}}"
fi
