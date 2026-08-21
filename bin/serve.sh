#!/usr/bin/env bash
# Run the Ruby manual vectorizer (Sinatra + PostgreSQL/SQLite).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export RACK_ENV="${RACK_ENV:-development}"
export ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-changeme-admin}"

bundle check >/dev/null 2>&1 || bundle install
bundle exec rake db:migrate_app db:seed

PORT="${1:-8080}"
export PORT
echo "Manual vectorizer at http://127.0.0.1:${PORT}/" >&2
echo "Admin login: ${ADMIN_EMAIL} (set ADMIN_EMAIL / ADMIN_PASSWORD)" >&2
exec bundle exec puma -C config/puma.rb
