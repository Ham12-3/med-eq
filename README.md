# MedAsset

A medical equipment asset and maintenance tracker for hospital clinical engineering teams,
following MHRA *Managing Medical Devices* (2021). See [PLAN.md](PLAN.md) for the design and
[CLAUDE.md](CLAUDE.md) for the project rules. All data is synthetic.

## Getting started

Needs Node 22+, pnpm and Docker Desktop.

```bash
pnpm install
cp .env.example .env.local   # then set AUTH_SECRET (the file says how)
pnpm db:up        # Postgres 16 in Docker, with the app role and a test database
pnpm db:reset     # drop, migrate and seed the fictional hospital, then print row counts
pnpm dev          # http://localhost:3000, sign in as any seeded user
```

## Commands

| Command | What it does |
|---|---|
| `pnpm db:up` / `db:down` | Start or stop the Postgres container |
| `pnpm db:generate` | Generate a migration from `db/schema.ts` |
| `pnpm db:migrate` | Apply pending migrations (as the owner role) |
| `pnpm db:seed` | Seed an empty database (as the app role) |
| `pnpm db:reset` | Drop everything, migrate and seed. Development only |
| `pnpm db:counts` | Print row counts per table |
| `pnpm test` | Unit tests, then database tests against `medasset_test` |
| `pnpm test:unit` | Unit tests only; no database needed |
| `pnpm test:e2e` | Playwright: its own dev server on port 3100 against a freshly seeded test database |
| `pnpm job:daily` | Runs the daily job once: opens PPM jobs due within 14 days, re-sets overdue priorities. In production a scheduler calls `POST /api/cron/daily` with `Authorization: Bearer $CRON_SECRET` |
| `pnpm db:bench` | Times location and status queries at 50,000 assets in a throwaway `medasset_bench` database |
| `pnpm map:stress-db` / `map:measure` | Build a throwaway `medasset_stress` database with 2,000 devices on one floor; time the 3D map's first frame and orbit frame rate against a running production server (see the script headers) |
| `pnpm typecheck` | Generate Next route types and run `tsc` |

Add `--test` to a `db:*` command to target the test database, and `--today=YYYY-MM-DD`
to seed as if it were another day, for example `pnpm db:reset --today=2026-10-27`.

## Signing in

Auth.js v5 with JWT sessions (12 hours). In development, `AUTH_DEV_LOGIN=true` turns on a
"sign in as" picker at `/login` listing the seeded users, with no passwords. It is always off
in production builds; a real identity provider must be added before any pilot.

Each role lands on its own home screen: technician `/work`, manager `/dashboard`,
ward `/ward`, library `/library`, MDSO/admin `/notices`. Permissions are in
`lib/auth/permissions.ts`; every page and server action re-checks the user against the database.

## Database rules

- The app connects as `medasset_app`, which has no DELETE and can only append to `audit_log`.
- Every insert and update writes an `audit_log` row with the user from `app.user_id`.
  Use `withUser(db, userId, tx => ...)` from `db/client.ts` for every write; a write
  without a user is rejected.
- DELETE and TRUNCATE raise on every table, even for the owner role.
- A new table in a later migration must call `SELECT medasset_protect('table_name');`.
