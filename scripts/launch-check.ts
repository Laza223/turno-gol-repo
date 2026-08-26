import { config } from 'dotenv'
// De dónde salen las variables que audita el gate. Son dos modos, y la
// diferencia entre ellos es la diferencia entre auditar y creer:
//
//   LAUNCH_CHECK_ENV_FILE=.env.production pnpm launch:check --probe-only
//     audita un ARCHIVO. Prueba lo que dice ese archivo, que no es lo mismo que
//     lo que tiene cargado el ambiente real. Sirve para contrastar una copia
//     local contra la realidad; no sirve para saber si producción está sana.
//
//   LAUNCH_CHECK_ENV_FILE=platform railway run pnpm launch:check --probe-only
//     no carga ningún archivo: usa las variables que ya están en el proceso, o
//     sea las que inyecta la plataforma (Railway, Vercel, CI). Es la única
//     forma de auditar credenciales de producción desde afuera de la app.
//
// Sin el modo `platform` el archivo GANA (`override: true`) y taparía
// exactamente lo que se quiere medir: un gate que mezcla mitad prod y mitad dev
// no verifica nada.
const ENV_SOURCE = process.env.LAUNCH_CHECK_ENV_FILE ?? '.env.local'
if (ENV_SOURCE !== 'platform') config({ path: ENV_SOURCE, override: true })
// .env.local sets NODE_ENV=development for the app's own runtime; that must
// not leak into the execSync steps below (`pnpm build` needs Next.js to set
// it to 'production' itself, otherwise it prerenders with a dev/prod chunk
// mismatch — "Cannot read properties of null (reading 'useContext')").
Reflect.deleteProperty(process.env, 'NODE_ENV')

import { execSync } from 'node:child_process'
import {
  encryptionKeyStrengthCheck,
  e2eBypassDisabledCheck,
  e2eEndpointSecretAbsentCheck,
  statusTokenHeader,
  mpMockModeDisabledCheck,
  webhookTestBypassSecretAbsentCheck,
  selectSteps,
  REQUIRED_ENV,
  WEB_ONLY_ENV,
} from './launch-check.helpers'
import { dbSslOptions } from '@/shared/db/ssl'
import {
  probeImpersonationSecret,
  probeMpMasterToken,
  probeMpOauth,
  probeR2,
  probeR2PublicDomain,
  probeResend,
  probeSupabaseKeys,
  probeUpstash,
  probeVapidPair,
  type ProbeResult,
} from '@/shared/observability/credential-probes'

type Step = {
  name: string
  cmd?: () => void
  check?: () => Promise<boolean>
  fatal: boolean
  /**
   * Variables sin las cuales esta sonda no puede probar NADA. Si falta alguna,
   * el step sale como SKIP y no como FAIL.
   *
   * La diferencia no es cosmética: una auditoría sirve si distingue "esta
   * credencial está rota" de "esta credencial no está en el archivo que te di".
   * La primera corrida contra producción (2026-08-25) devolvió 13 rojos, y
   * NINGUNO era una credencial rota — el `.env.production` local estaba viejo e
   * incompleto. Trece rojos que significan lo mismo que cero rojos son peor que
   * no correr nada, porque enseñan a ignorar la salida.
   */
  needs?: readonly string[]
}

/**
 * `LAUNCH_CHECK_RUNTIME=worker` audita el proceso de background (Railway), que
 * legítimamente no tiene las variables del runtime web. Ver `WEB_ONLY_ENV`.
 */
function envCheck(): boolean {
  const webOnly: readonly string[] = WEB_ONLY_ENV
  const isWorker = process.env.LAUNCH_CHECK_RUNTIME === 'worker'
  const required = isWorker ? REQUIRED_ENV.filter((k) => !webOnly.includes(k)) : REQUIRED_ENV
  const missing = required.filter((k) => !process.env[k])
  if (missing.length > 0) {
    console.error(`Missing env vars: ${missing.join(', ')}`)
    return false
  }
  if (isWorker) {
    console.log(
      `  ${required.length} variables del worker presentes ` +
        `(${webOnly.length} del runtime web no aplican acá)`,
    )
  }
  return true
}

async function statusCheck(): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  try {
    // B10 — contra un deploy real (NODE_ENV=production) el detalle por
    // subsistema sale solo con STATUS_TOKEN; el semáforo que este check mira
    // es público igual.
    const res = await fetch(`${base}/api/status`, { headers: statusTokenHeader() })
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
  const sql = postgres(url, { max: 1, ssl: dbSslOptions(url) })
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
  const sql = postgres(url, { max: 1, ssl: dbSslOptions(url) })
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
  const appSql = postgres(appUrl, { max: 1, ssl: dbSslOptions(appUrl) })
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
  const workerSql = postgres(workerUrl, { max: 1, ssl: dbSslOptions(workerUrl) })
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
  const sql = postgres(url, { max: 1, ssl: dbSslOptions(url) })
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
 * Verifica que las conexiones a Postgres viajen cifradas.
 *
 * OJO con `pg_stat_ssl`: **a través del pooler de Supabase siempre devuelve
 * `false`**, y eso NO significa que la conexión sea en texto plano. `pg_stat_ssl`
 * describe el tramo Supavisor→Postgres (interno, sin TLS), no el tramo
 * cliente→Supavisor, que es el que cruza internet. Medido contra producción el
 * 2026-08-25 con las variables reales de Railway: los dos DSN dan
 * `pg_stat_ssl.ssl=false` conecten con TLS o sin TLS.
 *
 * Ese mismo experimento dejó ver algo más incómodo: **el pooler acepta también
 * conexiones sin cifrar**. O sea que ningún chequeo del lado del servidor puede
 * garantizar el cifrado — lo único que lo garantiza es que el cliente lo pida
 * siempre, y eso hoy lo fija el código en `src/shared/db/ssl.ts` (con candado en
 * `tests/unit/db-ssl-options.test.ts`) en vez del `?sslmode=` del DSN, que es
 * editable desde un panel y que cada librería interpreta distinto.
 *
 * Así que este check hace lo único honesto que puede hacer: confirma que el DSN
 * apunta a un host remoto y que se puede abrir una conexión TLS contra él. Si es
 * una conexión directa (sin pooler), además exige `pg_stat_ssl.ssl = true`.
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
    if (dbSslOptions(url) === false) {
      console.error(`${envVar}: apunta a localhost — este gate espera los DSN de deploy`)
      ok = false
      continue
    }
    const throughPooler = new URL(url).hostname.includes('pooler.supabase.com')
    const sql = postgres(url, { max: 1, ssl: dbSslOptions(url) })
    try {
      const rows = await sql<{ ssl: boolean }[]>`
        SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()
      `
      if (throughPooler) {
        console.log(`  ${envVar}: TLS negociado contra el pooler`)
      } else if (rows[0]?.ssl !== true) {
        console.error(`${envVar}: conexión directa sin SSL (pg_stat_ssl.ssl=false)`)
        ok = false
      }
    } finally {
      await sql.end()
    }
  }

  return ok
}

/**
 * ─── Sondas de credenciales ──────────────────────────────────────────────────
 *
 * Las implementaciones viven en `src/shared/observability/credential-probes.ts`
 * y NO acá, a propósito: correrlas contra un `.env` local prueba lo que dice
 * ESE ARCHIVO, no lo que tiene cargado el ambiente real. La primera corrida
 * contra producción (2026-08-25) devolvió 13 rojos y ninguno era una credencial
 * rota — el `.env.production` local estaba viejo. Al vivir en `src/`, las mismas
 * sondas las corre también el runtime de la app (`/api/admin/system-status`),
 * donde las variables son las de verdad: las que Vercel tiene cargadas.
 *
 * Este archivo solo las adapta a la forma que espera el gate (boolean + salida
 * por consola).
 */
function adapt(fn: () => Promise<ProbeResult> | ProbeResult): () => Promise<boolean> {
  return async () => {
    const r = await fn()
    if (r.status === 'ok') {
      console.log(`  ${r.detail}`)
      return true
    }
    console.error(`  ${r.detail}`)
    // `skip` no es falla: la sonda no pudo probar nada porque falta la variable.
    // El gate ya lo filtra antes vía `needs`; esto es la red por si alguna sonda
    // exige una variable que el step no declaró.
    return r.status === 'skip'
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
  { name: 'bypassrls role check', check: bypassRlsCheck, fatal: true, needs: ['DATABASE_URL'] },
  {
    name: 'worker bypassrls role check',
    check: workerBypassRlsCheck,
    fatal: true,
    needs: ['WORKER_DATABASE_URL'],
  },
  {
    name: 'role identity check',
    check: roleIdentityCheck,
    fatal: true,
    needs: ['DATABASE_URL', 'WORKER_DATABASE_URL'],
  },
  {
    name: 'role session timeouts',
    check: roleSessionTimeoutCheck,
    fatal: true,
    needs: ['DATABASE_URL'],
  },
  { name: 'ssl in use', check: sslInUseCheck, fatal: true, needs: ['DATABASE_URL'] },
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
    needs: ['ENCRYPTION_KEY'],
    check: async () => {
      const r = encryptionKeyStrengthCheck(process.env.ENCRYPTION_KEY)
      if (!r.ok) console.error(r.error)
      return r.ok
    },
    fatal: true,
  },
  {
    name: 'mp credentials probe (Checkout Pro)',
    check: adapt(probeMpOauth),
    fatal: false,
    needs: ['MP_CLIENT_ID', 'MP_CLIENT_SECRET'],
  },
  {
    name: 'mp master token probe (Suscripciones)',
    check: adapt(probeMpMasterToken),
    fatal: false,
    needs: ['MP_TURNOGOL_ACCESS_TOKEN'],
  },
  {
    name: 'resend probe (email)',
    check: adapt(probeResend),
    fatal: false,
    needs: ['RESEND_API_KEY'],
  },
  {
    name: 'r2 probe (bucket de imagenes)',
    check: adapt(probeR2),
    fatal: false,
    needs: ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'],
  },
  {
    name: 'r2 public domain probe',
    check: adapt(probeR2PublicDomain),
    fatal: false,
    needs: ['R2_PUBLIC_BASE_URL'],
  },
  {
    name: 'supabase keys probe (service_role + anon)',
    check: adapt(probeSupabaseKeys),
    fatal: false,
    needs: [
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ],
  },
  {
    name: 'upstash probe (rate-limit)',
    check: adapt(probeUpstash),
    fatal: false,
    needs: ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
  },
  {
    name: 'impersonation secret probe',
    check: adapt(probeImpersonationSecret),
    fatal: false,
    needs: ['IMPERSONATION_COOKIE_SECRET'],
  },
  {
    name: 'vapid pair (push)',
    needs: ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'],
    check: adapt(probeVapidPair),
    fatal: false,
  },
  { name: 'typecheck', cmd: () => execSync('pnpm typecheck', { stdio: 'inherit' }), fatal: true },
  { name: 'lint', cmd: () => execSync('pnpm lint', { stdio: 'inherit' }), fatal: true },
  { name: 'unit tests', cmd: () => execSync('pnpm test', { stdio: 'inherit' }), fatal: true },
  {
    name: 'integration tests',
    cmd: () => execSync('pnpm test:integration', { stdio: 'inherit' }),
    fatal: true,
  },
  {
    name: 'isolation tests',
    cmd: () => execSync('pnpm test:isolation', { stdio: 'inherit' }),
    fatal: true,
  },
  { name: 'build', cmd: () => execSync('pnpm build', { stdio: 'inherit' }), fatal: true },
  { name: 'e2e', cmd: () => execSync('pnpm test:e2e:ci', { stdio: 'inherit' }), fatal: true },
  {
    name: 'stress (1 accepted)',
    cmd: () => execSync('pnpm stress:bookings', { stdio: 'inherit' }),
    fatal: true,
  },
  { name: '/api/status healthy', check: statusCheck, fatal: false },
]

async function main(): Promise<void> {
  const probeOnly = process.argv.includes('--probe-only') || process.env.PROBE_ONLY === '1'
  const selected = selectSteps(steps, probeOnly)
  if (probeOnly) {
    console.log(
      `Modo probe-only: ${selected.length} sondas de ambiente, ` +
        `${steps.length - selected.length} steps locales salteados ` +
        `(variables: ${ENV_SOURCE === 'platform' ? 'las de la plataforma, sin archivo' : ENV_SOURCE})\n`,
    )
  }

  const failed: string[] = []
  const skipped: string[] = []
  for (const step of selected) {
    const missing = (step.needs ?? []).filter((k) => !process.env[k])
    if (missing.length > 0) {
      console.log(`▶ ${step.name}... SKIP (falta ${missing.join(', ')})`)
      skipped.push(step.name)
      continue
    }
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
      // En `--probe-only` un fatal NO corta la corrida. El modo existe para
      // auditar un ambiente entero, y frenar en el primer rojo esconde los
      // otros 20 resultados: la primera corrida real (2026-08-25) murió en
      // `env vars present` por cinco variables ausentes del `.env.production`
      // LOCAL y no reportó ni una sonda, con la producción andando perfecto.
      // Cada sonda ya avisa por su cuenta si le falta lo suyo, así que seguir
      // informa más de lo que arriesga. El exit code sigue siendo 1.
      if (step.fatal && !probeOnly) break
    }
  }
  if (skipped.length > 0) {
    console.log(
      `\n${skipped.length} sonda(s) sin correr por falta de variables: ${skipped.join(', ')}` +
        '\n  (no dicen nada sobre el ambiente real — completá el env file para que signifiquen algo)',
    )
  }
  if (failed.length > 0) {
    console.error(`\n${failed.length} step(s) failed: ${failed.join(', ')}`)
    process.exit(1)
  }
  console.log('\nAll launch checks passed.')
}

void main()
