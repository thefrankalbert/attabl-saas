# Database Migrations - safe workflow

## Why this exists

`pnpm db:migrate` used to be a thin alias for `supabase db push`, which applies every
pending migration to whatever `DATABASE_URL` is in `.env.local`. On a single-project
setup that URL is **production**. It now runs `scripts/db-migrate.sh --target local`,
which refuses any database that is not on this machine. Pushing a policy or schema change straight to a
live database, with no dry-run, no backup, and no staging rehearsal, is how you take
down anonymous ordering with a one-line RLS mistake. Once real diners are on the
platform you cannot do that.

The professional flow below keeps production safe: rehearse on staging, review the
diff, back up, and let CI apply - never a laptop against live data.

## Environments

| Env        | Supabase project                                 | Env file                      | Who applies              |
| ---------- | ------------------------------------------------ | ----------------------------- | ------------------------ |
| local      | `supabase start` (local Postgres)                | n/a                           | you, `supabase db reset` |
| staging    | dedicated staging project (or a Supabase Branch) | `.env.staging`                | CI on push to `main`     |
| production | the live project                                 | `.env.local` (read-only here) | psql, by hand, see below |

There is currently **no separate staging project**. Create one before relying on
the staging flow:

1. Supabase dashboard -> New project (name it `attabl-staging`, same region as prod).
2. Copy its URL / anon / service-role / session-pooler string into `.env.staging`
   (template: `.env.staging.example`).
3. Add the repo secret `STAGING_DB_URL` (session-pooler string) for the CI workflow.
4. Apply the full migration history once to staging: `scripts/db-migrate.sh --target staging`.

Alternative (recommended long term): enable **Supabase Branching** so every PR gets
an ephemeral preview database and migrations are tested automatically per-branch.

## Day-to-day

```bash
# 1. Write the migration locally
supabase migration new my_change        # or hand-author supabase/migrations/<ts>_*.sql

# 2. Test it against a local throwaway DB
supabase start
supabase db reset                        # replays ALL migrations from scratch

# 3. See exactly what is pending on a target (read-only, no apply)
scripts/db-migrate.sh --target staging --dry-run

# 4. Apply to staging and validate the app there
scripts/db-migrate.sh --target staging

# 5. Production: see what is pending (read-only), then apply with psql
scripts/db-migrate.sh --target production --dry-run
```

**No `supabase db push` on production.** Its migration history table is out of sync
with the files (47 versions in the database without a file, about 40 files without a
row, measured 2026-11-07), so a push would re-apply or skip migrations blindly. Take a
backup, apply the migration file with `psql`, then check the result by EXISTENCE in the
database (the table, column, policy or function body), never by the history table.

`scripts/db-migrate.sh` guarantees:

- target is explicit (no ambient default),
- the pending-migration diff is printed before anything runs,
- `--dry-run` inspects without applying,
- `--target production` is read-only: it refuses anything but `--dry-run`,
- `--target local` refuses a database that is not on this machine.

These guards are locked by `scripts/__tests__/db-migrate-guards.test.sh` (run in CI).

## CI

`.github/workflows/db-migrations.yml`:

- PR touching `supabase/migrations/**` -> read-only dry-run diff (no apply).
- push to `main` -> apply to **staging**.
- No production job (removed 2026-11-20: it pushed to production on every GitHub
  Release, with no approval gate).

## Migration safety rules

- Idempotent DDL only: `CREATE TABLE/INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
  `DROP POLICY IF EXISTS` before `CREATE POLICY`, `CREATE OR REPLACE FUNCTION`.
- Never edit an already-applied migration - add a new corrective one.
- Expand/contract for breaking changes: add the new shape, migrate reads/writes,
  drop the old shape in a later release - never a destructive rename in one step.
- RLS changes: confirm both the anon (public storefront) and authenticated (admin/POS)
  read paths still resolve, and that no table is left with no SELECT policy for a
  role that needs it. Rehearse on staging and click through the convive menu +
  table picker + POS before production.
- Keep `supabase/backups/` out of git history if dumps grow large (they are local /
  CI artifacts).
