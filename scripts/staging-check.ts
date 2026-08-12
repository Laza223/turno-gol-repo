/**
 * Post-deploy verification for a staging environment.
 *
 * Different from launch-check.ts: that script gates code (typecheck, tests,
 * build) before a prod launch. This one gates the deployed *environment* —
 * has staging got real credentials, are they wired correctly, is the
 * deployed instance actually up. Run it after `vercel deploy` (or whatever
 * deploys the staging branch) against the staging URL.
 *
 * Usage:
 *   ENV_FILE=.env.staging pnpm staging:check
 *   (defaults to .env.staging if ENV_FILE is unset)
 */
import { config } from 'dotenv'
config({ path: process.env.ENV_FILE ?? '.env.staging' })

import {
  encryptionKeyStrengthCheck,
  e2eBypassDisabledCheck,
  e2eEndpointSecretAbsentCheck,
  statusTokenHeader,
  REQUIRED_ENV,
} from './launch-check.helpers'

type Step = {
  name: string
  check: () => Promise<boolean>
  fatal: boolean
}

function envCheck(): boolean {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k])
  if (missing.length > 0) {
    console.error(`Missing env vars: ${missing.join(', ')}`)
    return false
  }
  return true
}

async function statusCheck(): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_APP_URL
  if (!base) {
    console.error('NEXT_PUBLIC_APP_URL not set — cannot probe the deployed instance')
    return false
  }
  try {
    // B10 — en un deploy (NODE_ENV=production) `/api/status` publica solo el
    // semáforo; el detalle por subsistema sale con el token. Sin él este check
    // sigue funcionando, pero al fallar solo puede decir "down" sin decir qué.
    const res = await fetch(`${base}/api/status`, { headers: statusTokenHeader() })
    if (res.status !== 200) {
      console.error(`/api/status returned ${res.status}`)
      return false
    }
    const body = (await res.json()) as { status: string; checks?: unknown }
    if (body.status !== 'ok') {
      console.error(`/api/status body: ${JSON.stringify(body)}`)
      if (!body.checks) {
        console.error('(seteá STATUS_TOKEN en este env file para ver qué subsistema falló)')
      }
      return false
    }
    return true
  } catch (e) {
    console.error(`/api/status fetch failed: ${(e as Error).message}`)
    return false
  }
}

/**
 * Same defense as launch-check.ts's bypassRlsCheck — if the staging DB role
 * has BYPASSRLS, every RLS policy on bookings/payments/etc. is silently
 * ignored, which would hide a broken policy instead of catching it.
 */
async function bypassRlsCheck(): Promise<boolean> {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL not set; cannot probe BYPASSRLS')
    return false
  }
  const postgres = (await import('postgres')).default
  const sql = postgres(url, { max: 1 })
  try {
    const rows = await sql<{ rolname: string; bypass: boolean }[]>`
      SELECT rolname, rolbypassrls AS bypass
      FROM pg_roles
      WHERE rolname = current_user
    `
    const row = rows[0]
    if (!row) {
      console.error('Could not resolve current_user in pg_roles')
      return false
    }
    if (row.bypass) {
      console.error(`current_user '${row.rolname}' has BYPASSRLS=true — RLS would be ignored`)
      return false
    }
    return true
  } finally {
    await sql.end()
  }
}

/**
 * Confirms the staging DB has the latest migration applied by checking for
 * a column it introduced. There's no migration-tracking table (migrations
 * apply via a plain psql loop, see .github/workflows/ci.yml), so this is a
 * cheap proxy, not a full diff. Bump the column checked here whenever a new
 * migration lands in src/shared/db/migrations/.
 *
 * Latest as of writing: 035_closes_next_day.sql → tenants.closes_next_day
 */
async function migrationsAppliedCheck(): Promise<boolean> {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL not set; cannot probe migrations')
    return false
  }
  const postgres = (await import('postgres')).default
  const sql = postgres(url, { max: 1 })
  try {
    const rows = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tenants' AND column_name = 'closes_next_day'
      ) AS exists
    `
    if (!rows[0]?.exists) {
      console.error(
        'tenants.closes_next_day missing — migration 035_closes_next_day.sql not applied. ' +
          'Run the migration loop from .github/workflows/ci.yml against this DATABASE_URL.',
      )
      return false
    }
    return true
  } finally {
    await sql.end()
  }
}

/**
 * MP-WEBHOOK-001: fails if this staging deploy has no
 * MP_WEBHOOK_TEST_BYPASS_SECRET configured — scripts/replay-mp-webhook.ts
 * can't sign fixtures against it without one, so the harness would be
 * silently unusable here. Skipped when MP_MOCK_MODE=1: in that mode
 * verifyWebhookSignature() short-circuits on MP_MOCK_ENABLED before ever
 * looking at the bypass secret (see webhook-auth.ts), so there is nothing
 * for this env var to gate.
 */
async function webhookHarnessSecretCheck(): Promise<boolean> {
  if (process.env.MP_MOCK_MODE === '1') {
    console.log('(MP_MOCK_MODE=1 — signature check short-circuits, skipping bypass-secret check)')
    return true
  }
  if (!process.env.MP_WEBHOOK_TEST_BYPASS_SECRET) {
    console.error(
      'MP_WEBHOOK_TEST_BYPASS_SECRET not set — scripts/replay-mp-webhook.ts cannot sign ' +
        'fixtures against this staging deploy (see MP-WEBHOOK-001)',
    )
    return false
  }
  return true
}

/**
 * Same probe as launch-check.ts's mpCredentialsProbe. Skipped when
 * MP_MOCK_MODE=1 (staging commonly mocks MP to avoid real charges) — in
 * that mode MP_CLIENT_ID/SECRET are unused, so there's nothing to verify.
 */
async function mpCredentialsProbe(): Promise<boolean> {
  if (process.env.MP_MOCK_MODE === '1') {
    console.log('(MP_MOCK_MODE=1 — skipping live MercadoPago probe)')
    return true
  }
  const id = process.env.MP_CLIENT_ID
  const secret = process.env.MP_CLIENT_SECRET
  if (!id || !secret) {
    console.error('MP_CLIENT_ID or MP_CLIENT_SECRET not set')
    return false
  }
  try {
    const res = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: id,
        client_secret: secret,
        grant_type: 'refresh_token',
        refresh_token: 'probe-invalid',
      }),
    })
    if (res.status === 400) return true
    if (res.status === 401 || res.status === 403) {
      console.error(`MP oauth probe returned HTTP ${res.status} — credentials rejected`)
      return false
    }
    console.error(`MP oauth probe returned HTTP ${res.status} (expected 400 for valid creds)`)
    return false
  } catch (e) {
    console.error(`MP oauth probe failed: ${(e as Error).message}`)
    return false
  }
}

const steps: Step[] = [
  { name: 'env vars present', check: async () => envCheck(), fatal: true },
  {
    name: 'e2e bypass disabled',
    check: async () => {
      const r = e2eBypassDisabledCheck(process.env.NEXT_PUBLIC_E2E)
      if (!r.ok) console.error(r.error)
      return r.ok
    },
    fatal: true,
  },
  {
    name: 'e2e booking endpoint closed',
    check: async () => {
      const r = e2eEndpointSecretAbsentCheck(process.env.E2E_ENDPOINT_SECRET)
      if (!r.ok) console.error(r.error)
      return r.ok
    },
    fatal: true,
  },
  {
    name: 'encryption-key strength',
    check: async () => {
      const r = encryptionKeyStrengthCheck(process.env.ENCRYPTION_KEY)
      if (!r.ok) console.error(r.error)
      return r.ok
    },
    fatal: true,
  },
  { name: 'migrations applied', check: migrationsAppliedCheck, fatal: true },
  { name: 'bypassrls role check', check: bypassRlsCheck, fatal: true },
  { name: 'webhook harness secret present', check: webhookHarnessSecretCheck, fatal: true },
  { name: 'mp credentials probe', check: mpCredentialsProbe, fatal: false },
  { name: '/api/status healthy', check: statusCheck, fatal: true },
]

async function main(): Promise<void> {
  const failed: string[] = []
  for (const step of steps) {
    const t0 = Date.now()
    process.stdout.write(`▶ ${step.name}... `)
    try {
      const ok = await step.check()
      if (!ok) throw new Error('check returned false')
      console.log(`OK (${Date.now() - t0}ms)`)
    } catch (e) {
      console.log('FAIL')
      console.error(`  ${(e as Error).message}`)
      failed.push(step.name)
      if (step.fatal) break
    }
  }
  if (failed.length > 0) {
    console.error(`\n${failed.length} step(s) failed: ${failed.join(', ')}`)
    process.exit(1)
  }
  console.log('\nStaging is verifiable: all checks passed.')
}

void main()
