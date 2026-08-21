# Manual Vectorizer (Ruby)

Browser UI for human speaker vectorization with **PostgreSQL-backed state**, **admin-approved invite codes**, and **DigitalOcean App Platform** deployment.

## Stack

- **Sinatra** + **Puma** (Rack)
- **Sequel** + **PostgreSQL** (SQLite for local dev)
- **bcrypt** sessions + invite-only signup
- Static UI in `public/` (same vectorizer / weights / results pages)

## Local development

```bash
bundle install
export ADMIN_EMAIL=you@example.com
export ADMIN_PASSWORD=your-admin-password
./bin/serve.sh
```

Open [http://127.0.0.1:8080/](http://127.0.0.1:8080/) — log in as admin, visit **Admin** to generate one-use invite codes.

Local dev uses SQLite at `data/manual_vectorizer.db` unless `DATABASE_URL` is set.

## Auth model

1. Bootstrap **admin** from `ADMIN_EMAIL` + `ADMIN_PASSWORD` on seed (first deploy).
2. Admin opens `/admin` → **Generate invite code** (one use, 7-day expiry).
3. New user visits `/signup` with the code → creates account → code is consumed.
4. Vectorizer state (scores, weights, UI collapse) persists per user in the database via `/api/session`.

## Catalog updates

The active skill/type catalog lives in `catalog_snapshots` (JSON). Initial seed loads `data/catalog.json`.

Admins can POST a new catalog:

```bash
curl -X POST -H "Cookie: ..." -d @data/catalog.json \
  "https://your-app/admin/catalog?label=2026-08-21"
```

(Or rebuild in the Lemon pipeline and upload the JSON.)

## DigitalOcean CLI

Put your API token in **`.env`** (gitignored):

```bash
cp .env.example .env
# edit .env — set DIGITALOCEAN_ACCESS_TOKEN=dop_v1_...
```

Create a token: [DigitalOcean API tokens](https://cloud.digitalocean.com/account/api/tokens)

Then use the project wrapper (loads `.env` automatically):

```bash
chmod +x bin/do
./bin/do account get
./bin/do apps list
./bin/do apps create --spec .do/app.yaml
```

`doctl` also reads `DIGITALOCEAN_ACCESS_TOKEN` if you export it yourself.

## DigitalOcean App Platform

Spec: [`.do/app.yaml`](.do/app.yaml)

1. Create app from `constellation-cii/manual-vectorizer` (or this folder).
2. Attach managed PostgreSQL — `DATABASE_URL` is wired automatically.
3. Set secrets:
   - `SESSION_SECRET` — long random string
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` — bootstrap admin (rotate password after first login if desired)
4. Deploy — release command runs migrations + catalog seed.

## API (authenticated)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/me` | Current user |
| GET | `/api/catalog` | Active catalog JSON |
| GET/PUT | `/api/session` | User vectorizer state |

## Legacy static mode

The previous Python static server (`bin/http_server.py`) and Tailscale funnel scripts remain for reference but `./bin/serve.sh` now runs the Ruby app.
