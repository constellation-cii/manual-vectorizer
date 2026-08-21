#!/usr/bin/env bash
# Runs as root via pkexec — configures Tailscale Funnel for the manual vectorizer.
set -euo pipefail

USER_NAME="${1:?username required}"
PORT="${2:?port required}"

tailscale set --operator="${USER_NAME}"
tailscale funnel --bg "${PORT}"
