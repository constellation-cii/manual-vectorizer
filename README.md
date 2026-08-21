# Manual Vectorizer (Ruby)

Browser UI for human speaker vectorization with **PostgreSQL-backed state**, **per-user vector sheets**, **logs & sharing**, and **DigitalOcean App Platform** deployment.

## Stack

- **Sinatra** + **Puma** (Rack)
- **Sequel** + **PostgreSQL** (SQLite for local dev)
- **bcrypt** sessions + invite-only signup
- Static UI in `public/` (vectorize / weights / results + edit / log / merge)

## Local development

```bash
bundle install
export ADMIN_EMAIL=you@example.com
export ADMIN_PASSWORD=your-admin-password
bundle exec rake db:migrate_app
./bin/serve.sh
```

Open [http://127.0.0.1:8080/](http://127.0.0.1:8080/) — log in as admin, visit **Admin** to generate one-use invite codes.

Local dev uses SQLite at `data/manual_vectorizer.db` unless `DATABASE_URL` is set.

## Auth model

1. Create the **admin** from `ADMIN_EMAIL` + `ADMIN_PASSWORD` on first boot (never overwrites existing passwords).
2. Admin opens `/admin` → **Generate invite code** (one use, 7-day expiry).
3. New user visits `/signup` with the code → creates account → code is consumed.
4. New users receive a fork of the **master sheet**; workspace state persists via `/api/session`.

## Vector sheets

Each user works with one **active sheet** at a time (switch via header dropdown):

| Page | Purpose |
|------|---------|
| `/edit.html` | Edit sheet definition (JSON/YAML), reorder vectors, validate duplicates/similarity |
| `/log.html` | Save speaker rankings with source notes; share logs by email |
| `/merge.html` | Merge a guest sheet bundle into the active sheet with type mapping |

- **Master sheet** — canonical Type Grid Master row in Postgres; admins can edit it via `/edit.html` when selected; new users fork from it.
- **Export/import** — full sheet bundles via Edit page or `GET /api/sheets/:id/export` and `POST /api/sheets/import`.
- **Sharing** — read-only share of sheets or logs to existing users by exact email match.

## Master sheet (production)

The master sheet is the **`vector_sheets`** row with `is_master = true`. It is **not** rebuilt on deploy. Load or update it with direct Postgres changes, or edit it in the app (`/edit.html`) when **Type Grid Master** is the active sheet.

## DigitalOcean App Platform

Spec: [`.do/app.yaml`](.do/app.yaml)

1. Create app from `constellation-cii/manual-vectorizer`.
2. Attach managed PostgreSQL — `DATABASE_URL` is wired automatically.
3. Set secrets in the dashboard: `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
4. Deploy — migrations and admin seed run on boot. The master sheet must already exist in Postgres (or be loaded manually).

## API (authenticated)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/me` | Current user |
| GET | `/api/catalog` | Active sheet as catalog JSON |
| GET/PUT | `/api/session` | Workspace draft state |
| GET | `/api/sheets` | List accessible sheets |
| GET/PUT | `/api/sheets/:id` | Load/save sheet definition |
| POST | `/api/sheets/:id/validate` | Duplicates + similarity report |
| GET | `/api/sheets/:id/export` | Sheet bundle export |
| POST | `/api/sheets/import` | Import sheet bundle |
| POST | `/api/sheets/:id/merge` | Merge guest sheet |
| POST | `/api/sheets/:id/import-ranking` | Import ranking with hash matching |
| GET/POST | `/api/logs` | List/create log entries |
| POST | `/api/logs/:id/share` | Share log by email |
| POST | `/api/sheets/:id/share` | Share sheet by email |

`data/catalog.json` is the source file for building the master sheet offline. Runtime `/api/catalog` resolves from the user's active vector sheet.
