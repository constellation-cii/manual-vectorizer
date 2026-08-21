#!/usr/bin/env bash
# Expose the manual vectorizer on the public internet via Tailscale Funnel.
# Uses pkexec for a GUI password prompt (same pattern as other scripts on this machine).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${1:-8080}"
PIDFILE="${ROOT}/.server.pid"

start_server() {
  if curl -sf "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
    return 0
  fi
  echo "Building catalog.json from local pipeline/skills…" >&2
  python3 "${ROOT}/bin/build_catalog.py"
  echo "Starting server on port ${PORT}…" >&2
  cd "${ROOT}"
  nohup python3 bin/http_server.py "${PORT}" >/dev/null 2>&1 &
  echo $! >"${PIDFILE}"
  sleep 0.3
  if ! curl -sf "http://127.0.0.1:${PORT}/" >/dev/null; then
    echo "Failed to start server on port ${PORT}" >&2
    exit 1
  fi
}

enable_funnel() {
  if tailscale funnel --bg "${PORT}" 2>/dev/null; then
    return 0
  fi
  echo "Opening password prompt to configure Tailscale Funnel…" >&2
  pkexec /bin/bash "${ROOT}/bin/funnel-root.sh" "${USER}" "${PORT}"
}

start_server
enable_funnel

TS_DNS="$(tailscale status --json | python3 -c "import json,sys; print(json.load(sys.stdin).get('Self',{}).get('DNSName','').rstrip('.'))")"

echo ""
echo "Public URL (share with anyone, no Tailscale required):"
echo "  https://${TS_DNS}/"
echo ""
tailscale funnel status
