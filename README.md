# TurnoGol

SaaS de gestión para complejos de fútbol en Argentina. Stack: Next.js 14, Supabase, Drizzle ORM, MercadoPago.

---

## Local development

```bash
pnpm install
pnpm supabase:start     # starts local Postgres + Auth on port 54322
pnpm dev                # http://localhost:3000
```

Copy `.env.example` → `.env.local` and fill in the values.

---

## Deploy process

Deploys are automatic:

1. **Open a PR** → CI runs 4 jobs (lint + types, unit tests, integration + isolation, e2e on PRs to main).
2. **Merge to main** → CI runs again on push.
3. **If CI is green** → `deploy.yml` triggers automatically and deploys to Vercel production.

No manual deploy step is needed. Rollback: go to Vercel → Deployments → promote the previous good deployment.

### Required GitHub Secrets

| Secret | Purpose |
|---|---|
| `VERCEL_TOKEN` | Vercel deploy auth |
| `VERCEL_ORG_ID` | Vercel organization |
| `VERCEL_PROJECT_ID` | Vercel project |
| `SENTRY_AUTH_TOKEN` | Source map upload during build |
| `SENTRY_ORG` | Sentry org slug |
| `SENTRY_PROJECT` | Sentry project slug |

All other secrets (Supabase URL/keys, MercadoPago tokens, Resend API key, encryption key) live as
**encrypted environment variables in the Vercel dashboard** — not in GitHub.

---

## Running migrations manually

Migrations are SQL files at `src/shared/db/migrations/`. Apply them in order against the production database:

```bash
# Set the production DATABASE_URL, then:
for f in src/shared/db/migrations/0*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

Or use the sync script (applies only unapplied migrations):

```bash
DATABASE_URL=<prod-url> pnpm db:sync-supabase
```

**Never** apply migrations directly from Supabase Studio without testing them locally first.
Always run inside a transaction (`BEGIN` / `COMMIT` / `ROLLBACK`) when executing SQL manually.

---

## Restoring a backup

Supabase Pro takes daily point-in-time backups. **Never restore directly to production.**

1. Go to Supabase Dashboard → Settings → Backups.
2. Select the desired backup point.
3. Restore to a **new temporary Supabase project**.
4. Verify the data is correct in the temporary project.
5. If you need specific rows, export them with `pg_dump` and import selectively into production.

For the quarterly backup drill: restore a 7-day-old backup to a temp project, run the
isolation test suite against it (`DATABASE_URL=<temp-project-url> pnpm test:isolation`),
confirm it passes, then delete the temp project.

---

## Environment variables

| Variable | Where | Notes |
|---|---|---|
| `DATABASE_URL` | Vercel (encrypted) + `.env.local` | Supabase Postgres connection string |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + `.env.local` | Public Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + `.env.local` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (encrypted) | Never exposed to browser |
| `ENCRYPTION_KEY` | Vercel (encrypted) | 64 hex chars (32 bytes) for MP token encryption |
| `NEXT_PUBLIC_SENTRY_DSN` | Vercel + `.env.local` | Browser error tracking |
| `SENTRY_DSN` | Vercel + `.env.local` | Server error tracking |
| `RESEND_API_KEY` | Vercel (encrypted) | Transactional email |
| `MP_CLIENT_ID` / `MP_CLIENT_SECRET` | Vercel (encrypted) | MercadoPago OAuth app credentials |
