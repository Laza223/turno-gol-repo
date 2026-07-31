import { config } from 'dotenv'
// El archivo de env es configurable para poder auditar un ambiente REMOTO (prod)
// sin tener que pisar `.env.local`:
//   LAUNCH_CHECK_ENV_FILE=.env.production pnpm launch:check --probe-only
// `override: true` hace que el archivo elegido gane sobre lo que ya haya en la
// shell: un gate que mezcla mitad prod y mitad dev no verifica nada.
config({ path: process.env.LAUNCH_CHECK_ENV_FILE ?? '.env.local', override: true })
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
  selectSteps,
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
 * Fails if a DSN's login role isn't the expected app-specific role.
 *
 * D5 prod finding: pg-boss's WORKER_DATABASE_URL on Railway pointed at
 * `postgres` (the Supabase superuser/table owner), not `turnogol_worker`.
 * `bypassRlsCheck`/`workerBypassRlsCheck` above only check the
 * `rolbypassrls` attribute, which is FALSE for `postgres` — that check
 * alone doesn't catch this class: `postgres` bypasses RLS anyway because it
 * OWNS every table, and RLS only restricts non-owners on tables without
 * FORCE ROW LEVEL SECURITY (doc12). A DSN silently pointing at the owner
 * would pass `bypassRlsCheck` (rolbypassrls=false) while still bypassing
 * RLS in practice. This check asserts the actual login identity instead.
 */
async function roleIdentityCheck(): Promise<boolean> {
  const postgres = (await import('postgres')).default
  let ok = true

  const appUrl = process.env.DATABASE_URL
  if (!appUrl) {
    console.error('DATABASE_URL not set; cannot probe role identity')
    return false
  }
  const appSql = postgres(appUrl, { max: 1 })
  try {
    const rows = await appSql<{ role_name: string }[]>`SELECT current_user AS role_name`
    if (rows[0]?.role_name !== 'turnogol_app') {
      console.error(
        `DATABASE_URL logs in as '${rows[0]?.role_name}', expected 'turnogol_app' — ` +
          'a DSN pointing at the table owner (e.g. `postgres`) silently bypasses RLS ' +
          'even with rolbypassrls=false, because RLS only restricts non-owners without FORCE.',
      )
      ok = false
    }
  } finally {
    await appSql.end()
  }

  const workerUrl = process.env.WORKER_DATABASE_URL
  if (!workerUrl) {
    console.error('WORKER_DATABASE_URL not set; cannot probe worker role identity')
    return false
  }
  const workerSql = postgres(workerUrl, { max: 1 })
  try {
    const rows = await workerSql<{ role_name: string }[]>`SELECT current_user AS role_name`
    if (rows[0]?.role_name !== 'turnogol_worker') {
      console.error(
        `WORKER_DATABASE_URL logs in as '${rows[0]?.role_name}', expected 'turnogol_worker' — ` +
          'a DSN pointing at the table owner (e.g. `postgres`) silently bypasses RLS.',
      )
      ok = false
    }
  } finally {
    await workerSql.end()
  }

  return ok
}

/**
 * Fails if the session's statement_timeout isn't the value migración
 * 055_role_timeouts.sql sets for `turnogol_app` (15s). Reads the actual
 * runtime GUC via `SHOW` rather than the catalog (`pg_roles.rolconfig`, as
 * tests/integration/role-timeouts.test.ts does) on purpose: `ALTER ROLE ...
 * SET` only takes effect for sessions that LOG IN as that role (055's
 * header gotcha) — this check runs in the exact context that matters
 * (launch-check connecting with the real production DATABASE_URL), so a
 * failure here means either the DSN doesn't log in as turnogol_app (see
 * `roleIdentityCheck` above) or migración 055 hasn't reached this DB.
 */
async function roleSessionTimeoutCheck(): Promise<boolean> {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL not set; cannot probe statement_timeout')
    return false
  }
  const postgres = (await import('postgres')).default
  const sql = postgres(url, { max: 1 })
  try {
    const rows = await sql<{ statement_timeout: string }[]>`SHOW statement_timeout`
    if (rows[0]?.statement_timeout !== '15s') {
      console.error(
        `statement_timeout is '${rows[0]?.statement_timeout}', expected '15s' — ` +
          'either DATABASE_URL does not log in as turnogol_app, or migración 055 ' +
          '(ALTER ROLE turnogol_app SET statement_timeout) has not reached this DB.',
      )
      return false
    }
    return true
  } finally {
    await sql.end()
  }
}

/**
 * Fails if a DSN connection isn't using SSL (`pg_stat_ssl.ssl`). Meant for
 * prod/staging DSNs only (Supabase pooler/direct connections over the
 * internet) — localhost never negotiates SSL, so this check would always
 * fail against the local dev default
 * (postgres://postgres:postgres@127.0.0.1:54322/postgres). launch-check is
 * a pre-launch/pre-prod gate — same assumption `bypassRlsCheck`/
 * `workerBypassRlsCheck` already make: it expects to run against the real
 * deploy DSNs, not local Supabase.
 */
async function sslInUseCheck(): Promise<boolean> {
  const postgres = (await import('postgres')).default
  let ok = true

  for (const envVar of ['DATABASE_URL', 'WORKER_DATABASE_URL'] as const) {
    const url = process.env[envVar]
    if (!url) {
      console.error(`${envVar} not set; cannot probe SSL usage`)
      ok = false
      continue
    }
    const sql = postgres(url, { max: 1 })
    try {
      const rows = await sql<{ ssl: boolean }[]>`
        SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()
      `
      if (rows[0]?.ssl !== true) {
        console.error(`${envVar}: connection is not using SSL (pg_stat_ssl.ssl=false)`)
        ok = false
      }
    } finally {
      await sql.end()
    }
  }

  return ok
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
  { name: 'role identity check',       check: roleIdentityCheck,                                                                    fatal: true  },
  { name: 'role session timeouts',     check: roleSessionTimeoutCheck,                                                              fatal: true  },
  { name: 'ssl in use',                check: sslInUseCheck,                                                                        fatal: true  },
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
  const probeOnly = process.argv.includes('--probe-only') || process.env.PROBE_ONLY === '1'
  const selected = selectSteps(steps, probeOnly)
  if (probeOnly) {
    console.log(
      `Modo probe-only: ${selected.length} sondas de ambiente, ` +
        `${steps.length - selected.length} steps locales salteados ` +
        `(env file: ${process.env.LAUNCH_CHECK_ENV_FILE ?? '.env.local'})\n`,
    )
  }

  const failed: string[] = []
  for (const step of selected) {
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

void main()
