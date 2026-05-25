# Migrations convention (TurnoGol)

> Companion to `doc13_database_schema.md` and `doc19_runbook.md` §11.
> Audited and documented during **Fase B11** (P0 finding: CI applied a divergent
> migration set vs. local/prod). See `docs/audit/plans/2026-05-25-fase-b11-operativo.md`.

TurnoGol maintains **two parallel migration trees**. Both must always be kept in
sync. They exist because CI cannot run the Supabase CLI cheaply, and local/prod
must use it.

| Tree                          | Used by                                           | Naming                              |
| ----------------------------- | ------------------------------------------------- | ----------------------------------- |
| `src/shared/db/migrations/`   | **CI authority** (`.github/workflows/ci.yml`)     | Numeric: `NNN_short_name.sql`       |
| `supabase/migrations/`        | Supabase CLI mirror (local dev + prod deploy)     | Timestamp: `YYYYMMDDHHMMSS_name.sql`|

## Why two trees?

- **CI** (`.github/workflows/ci.yml:114-121, 188-195`) loops `src/shared/db/migrations/0*.sql` in glob (lexicographic) order against a vanilla `postgres:15-alpine` service. It does **not** install the Supabase CLI, the Supabase Docker image, or any of its dependencies. Reasons: cold start time, image size, cost on free-tier runners, and the fact that almost all CI tests only need the raw schema (not Auth/Storage/Realtime).
- **Local + prod** use `supabase db push` (CLI) / Supabase Dashboard, which expects the timestamp format.

The two trees encode **the same SQL** under different filenames so each tool gets what it expects.

## The rule

**Every schema change must be written in BOTH trees with identical SQL.**

1. Author the change in `supabase/migrations/YYYYMMDDHHMMSS_<name>.sql` (this is the file the Supabase CLI consumes and that gets shipped to prod).
2. Copy the SQL into `src/shared/db/migrations/NNN_<name>.sql` where `NNN` is the next numeric sequence (currently up to `012`). The content must be the same statements; only the filename differs.
3. Ensure the SQL is **idempotent** (see below). CI uses a clean container per job, but local re-applications and partial failures benefit from idempotence.
4. Before opening the PR, run both files against a clean local DB and confirm no errors.

## Idempotence requirements

CI applies migrations against a fresh container, so non-idempotent statements work the first time. However, we still require idempotence guards because:

- Local devs re-run migrations against their existing DB.
- A failed migration mid-file can leave the DB in a partial state; re-running with guards recovers cleanly.
- Idempotence makes hot-fixes safe to re-apply.

Patterns to use:

| Operation                          | Idempotent form                                                      |
| ---------------------------------- | -------------------------------------------------------------------- |
| Create table                       | `CREATE TABLE IF NOT EXISTS …`                                       |
| Add column                         | `ALTER TABLE … ADD COLUMN IF NOT EXISTS …`                           |
| Create index                       | `CREATE INDEX IF NOT EXISTS …`                                       |
| Create extension                   | `CREATE EXTENSION IF NOT EXISTS …`                                   |
| Create / replace function          | `CREATE OR REPLACE FUNCTION …`                                       |
| Create trigger                     | `DROP TRIGGER IF EXISTS … ON …; CREATE TRIGGER …`                    |
| Add enum value                     | `ALTER TYPE … ADD VALUE IF NOT EXISTS …`                             |
| Drop constraint then re-add        | `ALTER TABLE … DROP CONSTRAINT IF EXISTS …; ALTER TABLE … ADD …`     |
| Drop `NOT NULL`                    | `ALTER TABLE … ALTER COLUMN … DROP NOT NULL` (already a no-op)       |

If the supabase original lacks a guard (it was authored against a clean DB), the **`src/shared/db/migrations/` copy must add it**. Do not retro-edit the supabase file — its timestamp identifies its place in the CLI history and editing it can confuse `supabase db push`.

## Current state (as of 2026-05-25, Fase B11)

```
src/shared/db/migrations/
  001_extensions.sql                  ↔  supabase/migrations/20260424000001_extensions.sql
  002_enums.sql                       ↔  supabase/migrations/20260424000002_enums.sql
  003_global_tables.sql               ↔  supabase/migrations/20260424000003_global_tables.sql
  004_isolated_tables.sql             ↔  supabase/migrations/20260424000004_isolated_tables.sql
  005_triggers.sql                    ↔  supabase/migrations/20260424000005_triggers.sql
  006_rls_policies.sql                ↔  supabase/migrations/20260424000006_rls_policies.sql
  007_seed_data.sql                   ↔  supabase/migrations/20260424000007_seed_data.sql
  008_revokes.sql                     ↔  supabase/migrations/20260424000008_revokes.sql
  009_relax_payment_consistency.sql   ↔  (MISSING in supabase — see "Known divergences")
  010_billing_columns.sql             ↔  supabase/migrations/20260424000009_billing_columns.sql
  011_notification_sending_enum.sql   ↔  supabase/migrations/20260525000001_notification_sending_enum.sql
  012_system_admins_audit.sql         ↔  supabase/migrations/20260525000002_system_admins_audit.sql
```

Note that file **numbers and timestamps need not align**. The two trees are append-only sequences of "the same statements in the same order"; the supabase tree just uses timestamps so the CLI can place them chronologically among other potential migrations.

## Known divergences

- **`009_relax_payment_consistency.sql` exists only in `src/shared/db/migrations/`.** It relaxes `chk_booking_payment_consistency` to allow rows in the `pending_payment` state before the MP preference is created. This needs to be **back-ported** to `supabase/migrations/` as a follow-up (e.g. `supabase/migrations/20260525000003_relax_payment_consistency.sql`) so that local Supabase CLI applies the same constraint as CI. Tracked separately; not in Fase B11 Task 1 scope.

## Adding a new migration: step-by-step

```bash
# 1. Pick the next pair of names.
NEXT_NUM=013                                # whatever is one past the highest
TS=$(date -u +%Y%m%d%H%M%S)
NAME=my_feature_xyz

# 2. Author in BOTH places with identical SQL bodies.
$EDITOR supabase/migrations/${TS}_${NAME}.sql
cp supabase/migrations/${TS}_${NAME}.sql src/shared/db/migrations/${NEXT_NUM}_${NAME}.sql

# 3. Sanity check locally against a fresh DB:
supabase db reset           # nukes & re-applies supabase/migrations/*
# (or for the CI tree:)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/shared/db/migrations/${NEXT_NUM}_${NAME}.sql

# 4. Confirm idempotence by running the src file twice in a row; it must succeed both times.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/shared/db/migrations/${NEXT_NUM}_${NAME}.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/shared/db/migrations/${NEXT_NUM}_${NAME}.sql

# 5. Update this file's "Current state" table.
```

## Rejected alternatives

- **Single tree (delete `src/shared/db/migrations/`, point CI at `supabase/migrations/`).** Would require installing the Supabase CLI in CI (+image weight, +cold-start time), or convince CI's bare `psql` to load files by timestamp glob (works, but loses the visual "next migration is `NNN+1`" affordance). Deferred to v1.5.
- **Generate one tree from the other (script).** Adds a tool nobody trusts; if the script breaks silently, divergence comes back. Manual sync is currently 2 minutes per migration and obvious in PR diffs.
