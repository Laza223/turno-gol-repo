import { config } from 'dotenv'
config({ path: '.env.local' })
// .env.local sets NODE_ENV=development for the app's own runtime; that must
// not leak into the execSync steps below (`pnpm build` needs Next.js to set
// it to 'production' itself, otherwise it prerenders with a dev/prod chunk
// mismatch — "Cannot read properties of null (reading 'useContext')").
Reflect.deleteProperty(process.env, 'NODE_ENV')

import { execSync } from 'node:child_process'
import {
  encryptionKeyStrengthCheck,
  e2eBypassDisabledCheck,
  mpMockModeDisabledCheck,
  webhookTestBypassSecretAbsentCheck,
  REQUIRED_ENV,
} from './launch-check.helpers'

type Step = {
  name: string
  cmd?: () => void
  check?: () => Promise<boolean>
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
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${base}/api/status`)
    if (res.status !== 200) {
      console.error(`/api/status returned ${res.status}`)
      return false
    }
    const body = (await res.json()) as { status: string }
    return body.status === 'ok'
  } catch (e) {
    console.error(`/api/status fetch failed: ${(e as Error).message}`)
    return false
  }
}

/**
 * Fails if the DB role used by the app (current_user from DATABASE_URL) has
 * the BYPASSRLS attribute. In production, BYPASSRLS=true would silently
 * disable Row-Level Security for the entire application — RLS policies on
 * `bookings`, `payments`, etc. would be ignored. Catching this in
 * launch-check is the cheapest defense.
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
      console.error(
        `current_user '${row.rolname}' has BYPASSRLS=true — RLS would be ignored in production`,
      )
      return false
    }
    return true
  } finally {
    await sql.end()
  }
}

/**
 * Fails if the DB role used by background jobs (current_user from
 * WORKER_DATABASE_URL, falling back to DATABASE_URL) does NOT have BYPASSRLS.
 * Workers run cross-tenant sweeps (dunning, retention, expiry) that can't be
 * scoped to a single `app.current_tenant_id` — under the app's restricted
 * role (enforced by `bypassRlsCheck` above) those sweeps would silently
 * process 0 rows in production (Fable 5 P0: DSN dual).
 */
async function workerBypassRlsCheck(): Promise<boolean> {
  const url = process.env.WORKER_DATABASE_URL ?? process.env.DATABASE_URL
  if (!url) {
    console.error('WORKER_DATABASE_URL/DATABASE_URL not set; cannot probe worker BYPASSRLS')
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
      console.error('Could not resolve current_user in pg_roles for the worker DSN')
      return false
    }
    if (!row.bypass) {
      console.error(
        `Worker DB role '${row.rolname}' does NOT have BYPASSRLS — cross-tenant ` +
          'background sweeps would silently see 0 rows. Set WORKER_DATABASE_URL to a role with BYPASSRLS.',
      )
      return false
    }
    return true
  } finally {
    await sql.end()
  }
}

/**
 * Probes MP OAuth with a deliberately-invalid refresh token. MP responds:
 *   - 400 → client_id + client_secret authenticated successfully, grant rejected
 *           (this is what we want: credentials are valid)
 *   - 401 / 403 → bad client credentials
 *   - other → MP unavailable / unexpected (warn + fail; non-fatal at caller)
 *
 * Marked non-fatal in the steps list because MP itself can be slow or
 * unreachable from some build environments; we don't want a transient MP
 * outage to block a launch. Operators should re-run when MP is healthy.
 */
async function mpCredentialsProbe(): Promise<boolean> {
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
      console.error(
        `MP oauth probe returned HTTP ${res.status} — credentials rejected (bad client_id/secret)`,
      )
      return false
    }
    console.error(
      `MP oauth probe returned HTTP ${res.status} (expected 400 for valid creds)`,
    )
    return false
  } catch (e) {
    console.error(`MP oauth probe failed: ${(e as Error).message}`)
    return false
  }
}

const steps: Step[] = [
  { name: 'env vars present',          check: async () => envCheck(),                                                              fatal: true  },
  {
    name: 'e2e bypass disabled',
    check: async () => {
      const r = e2eBypassDisabledCheck(process.env.NEXT_PUBLIC_E2E)
      if (!r.ok) console.error(r.error)
      return r.ok
    },
    fatal: true,
  },
  { name: 'bypassrls role check',      check: bypassRlsCheck,                                                                       fatal: true  },
  { name: 'worker bypassrls role check', check: workerBypassRlsCheck,                                                               fatal: true  },
  {
    name: 'mp mock mode disabled',
    check: async () => {
      const r = mpMockModeDisabledCheck(process.env.MP_MOCK_MODE)
      if (!r.ok) console.error(r.error)
      return r.ok
    },
    fatal: true,
  },
  {
    name: 'webhook test bypass secret absent',
    check: async () => {
      const r = webhookTestBypassSecretAbsentCheck(process.env.MP_WEBHOOK_TEST_BYPASS_SECRET)
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
  { name: 'mp credentials probe',      check: mpCredentialsProbe,                                                                   fatal: false },
  { name: 'typecheck',                 cmd:   () => execSync('pnpm typecheck',         { stdio: 'inherit' }),                       fatal: true  },
  { name: 'lint',                      cmd:   () => execSync('pnpm lint',              { stdio: 'inherit' }),                       fatal: true  },
  { name: 'unit tests',                cmd:   () => execSync('pnpm test',              { stdio: 'inherit' }),                       fatal: true  },
  { name: 'integration tests',         cmd:   () => execSync('pnpm test:integration',  { stdio: 'inherit' }),                       fatal: true  },
  { name: 'isolation tests',           cmd:   () => execSync('pnpm test:isolation',    { stdio: 'inherit' }),                       fatal: true  },
  { name: 'build',                     cmd:   () => execSync('pnpm build',             { stdio: 'inherit' }),                       fatal: true  },
  { name: 'e2e',                       cmd:   () => execSync('pnpm test:e2e:ci',       { stdio: 'inherit' }),                       fatal: true  },
  { name: 'stress (1 accepted)',       cmd:   () => execSync('pnpm stress:bookings',   { stdio: 'inherit' }),                       fatal: true  },
  { name: '/api/status healthy',       check: statusCheck,                                                                          fatal: false },
]

async function main(): Promise<void> {
  const failed: string[] = []
  for (const step of steps) {
    const t0 = Date.now()
    process.stdout.write(`▶ ${step.name}... `)
    try {
      if (step.cmd) step.cmd()
      else if (step.check) {
        const ok = await step.check()
        if (!ok) throw new Error('check returned false')
      }
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
  console.log('\nAll launch checks passed.')
}

main()
