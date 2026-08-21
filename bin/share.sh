#!/usr/bin/env bash
# Share the manual vectorizer via Tailscale (tailnet and/or public Funnel).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${1:-8080}"

if ! curl -sf "http://127.0.0.1:${PORT}/" >/dev/null; then
  echo "No server on port ${PORT}. Start it first:" >&2
  echo "  cd ${ROOT} && python3 -m http.server ${PORT}" >&2
  exit 1
fi

TS_IP="$(tailscale ip -4 2>/dev/null || true)"
TS_DNS="$(tailscale status --json 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('Self',{}).get('DNSName','').rstrip('.'))" 2>/dev/null || true)"

echo "Local server: OK (port ${PORT})"
echo ""
echo "=== Tailnet (other devices logged into your Tailscale account) ==="
echo "  http://${TS_IP}:${PORT}/"
echo ""
echo "=== Public internet (Tailscale Funnel) ==="

FUNNEL_STATUS="$(tailscale funnel status 2>&1 || true)"
if echo "${FUNNEL_STATUS}" | rg -q "https://"; then
  echo "  https://${TS_DNS}/"
  echo ""
  echo "${FUNNEL_STATUS}"
else
  echo "  Funnel is NOT running. Enable it:"
  echo "    ./bin/funnel.sh"
  echo ""
  echo "  Public URL will be: https://${TS_DNS}/"
fi
