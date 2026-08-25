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
  e2eEndpointSecretAbsentCheck,
  statusTokenHeader,
  mpMockModeDisabledCheck,
  webhookTestBypassSecretAbsentCheck,
  selectSteps,
  REQUIRED_ENV,
  vapidPairMatches,
} from './launch-check.helpers'

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
    console.error(`MP oauth probe returned HTTP ${res.status} (expected 400 for valid creds)`)
    return false
  } catch (e) {
    console.error(`MP oauth probe failed: ${(e as Error).message}`)
    return false
  }
}

/**
 * Sonda del token master, el que cobra la suscripción SaaS.
 *
 * Por qué hace falta aparte: `mpCredentialsProbe` valida `MP_CLIENT_ID` /
 * `MP_CLIENT_SECRET`, que desde la migración del 2026-08-22 son los de la app
 * de **Checkout Pro** (señas por OAuth). `MP_TURNOGOL_ACCESS_TOKEN` es de la
 * **otra** aplicación, la de Suscripciones, y no lo tocaba ninguna sonda: la
 * única credencial con la que TurnoGol cobra SU plata podía estar vencida,
 * revocada o pegada de la cuenta equivocada y nadie se enteraba hasta que un
 * complejo intentaba activar el plan.
 *
 * `GET /users/me` es de lectura pura y no mueve un peso. Además imprime el id
 * de la cuenta, que es el chequeo que de verdad importa: un token válido pero
 * de la cuenta de un complejo autentica igual, y cobraría a la cuenta
 * equivocada. Compará ese id contra el de la cuenta master.
 *
 * Nunca imprime el token.
 */
async function mpMasterTokenProbe(): Promise<boolean> {
  const token = process.env.MP_TURNOGOL_ACCESS_TOKEN
  if (!token) {
    console.error('MP_TURNOGOL_ACCESS_TOKEN not set — no se puede cobrar la suscripción SaaS')
    return false
  }
  try {
    const res = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401 || res.status === 403) {
      console.error(
        `MP master token probe returned HTTP ${res.status} — token vencido, revocado o mal copiado`,
      )
      return false
    }
    if (!res.ok) {
      console.error(`MP master token probe returned HTTP ${res.status} (esperado 200)`)
      return false
    }
    const me = (await res.json()) as { id?: number; nickname?: string; site_id?: string }
    console.log(
      `MP master token OK — cuenta ${me.id ?? '?'} (${me.nickname ?? '?'}), site ${me.site_id ?? '?'}`,
    )
    console.log('  ^ verificá que ese id sea el de la cuenta master, no el de un complejo')
    return true
  } catch (e) {
    console.error(`MP master token probe failed: ${(e as Error).message}`)
    return false
  }
}

/**
 * ─── Sondas de credenciales: presencia no es funcionamiento ──────────────────
 *
 * Todo lo de abajo existe porque `src/shared/env.ts` valida FORMA (que la
 * variable esté y tenga la pinta correcta) y `/api/status` valida PRESENCIA
 * (`!!process.env.X`) para MercadoPago, email y Sentry. Ninguno de los dos
 * prueba que la credencial SIRVA. Una API key revocada, una clave pegada de
 * otra cuenta o un bucket renombrado pasan los dos chequeos y fallan recién en
 * producción, en el peor momento y casi siempre en silencio.
 *
 * Todas son de LECTURA y no mueven plata ni escriben datos de negocio. Ninguna
 * imprime el secreto: cuando hace falta imprimen el identificador de la cuenta
 * o del recurso, que es lo que de verdad hay que comparar.
 */

/**
 * Resend: la key existe, y el dominio desde el que se manda está verificado.
 *
 * `GET /domains` es lectura pura. Lo segundo importa tanto como lo primero: una
 * key válida con el dominio sin verificar manda igual, pero los mails caen en
 * spam o rebotan, que es exactamente el modo de falla que nadie mira. Los mails
 * salen como `no-reply@turnogol.app` (email.provider.ts) firmados por el
 * subdominio `send.turnogol.app`.
 */
async function resendProbe(): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.error('RESEND_API_KEY not set')
    return false
  }
  try {
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (res.status === 401 || res.status === 403) {
      console.error(`Resend rechazo la key (HTTP ${res.status}) — revocada o de otra cuenta`)
      return false
    }
    if (!res.ok) {
      console.error(`Resend probe devolvio HTTP ${res.status}`)
      return false
    }
    const body = (await res.json()) as { data?: { name: string; status: string }[] }
    const domains = body.data ?? []
    if (domains.length === 0) {
      console.error('Resend: la key sirve pero la cuenta no tiene ningun dominio cargado')
      return false
    }
    console.log(`  Resend: ${domains.map((d) => `${d.name}=${d.status}`).join(', ')}`)
    if (!domains.some((d) => d.status === 'verified')) {
      console.error('Resend: ningun dominio VERIFICADO — los mails van a rebotar o caer en spam')
      return false
    }
    return true
  } catch (e) {
    console.error(`Resend probe fallo: ${(e as Error).message}`)
    return false
  }
}

/**
 * R2: las credenciales abren el bucket que dice `R2_BUCKET`.
 *
 * `HeadBucket` es la operación más barata que prueba las tres cosas a la vez:
 * que la clave es válida, que tiene permiso, y que el bucket existe con ese
 * nombre exacto. `/api/status` solo mira que las cinco variables estén
 * definidas, así que un `R2_BUCKET` mal tipeado le da verde.
 */
async function r2Probe(): Promise<boolean> {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    console.error(
      'R2_* incompletas (hacen falta ACCOUNT_ID, ACCESS_KEY_ID, SECRET_ACCESS_KEY, BUCKET)',
    )
    return false
  }
  try {
    const { S3Client, HeadBucketCommand } = await import('@aws-sdk/client-s3')
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    })
    await client.send(new HeadBucketCommand({ Bucket: R2_BUCKET }))
    console.log(`  R2: bucket "${R2_BUCKET}" accesible`)
    return true
  } catch (e) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number }; message: string }
    const code = err.$metadata?.httpStatusCode
    if (code === 404) console.error(`R2: el bucket "${R2_BUCKET}" no existe en esa cuenta`)
    else if (code === 401 || code === 403)
      console.error(`R2: credenciales rechazadas (HTTP ${code})`)
    else console.error(`R2 probe fallo: ${err.name ?? ''} ${err.message}`)
    return false
  }
}

/**
 * El dominio público de las imágenes responde por HTTPS.
 *
 * Un 404 acá es ÉXITO: significa que el DNS resuelve, el certificado sirve y
 * Cloudflare contesta; que no haya un objeto en la raíz es lo esperado. Lo que
 * se está buscando es el otro caso — que `R2_PUBLIC_BASE_URL` apunte a un
 * dominio que no existe, como pasaba con `media.turnogol.com` en
 * `next.config.ts` hasta el 2026-08-25.
 */
async function r2PublicDomainProbe(): Promise<boolean> {
  const base = process.env.R2_PUBLIC_BASE_URL
  if (!base) {
    console.error('R2_PUBLIC_BASE_URL not set')
    return false
  }
  try {
    const res = await fetch(base, { method: 'HEAD' })
    console.log(`  R2 publico: ${base} responde HTTP ${res.status}`)
    return true
  } catch (e) {
    console.error(`R2_PUBLIC_BASE_URL (${base}) no responde: ${(e as Error).message}`)
    return false
  }
}

/**
 * Las dos claves de Supabase son de ESTE proyecto y tienen el poder que dicen.
 *
 * - La `service_role` se prueba contra `/auth/v1/admin/users`, que solo
 *   responde con privilegios de admin: si alguien pegó ahí la `anon` por error
 *   —mismo formato JWT, mismo largo, indistinguibles a ojo— el chequeo de
 *   `env.ts` (`min(20)`) le da verde y recién falla al crear usuarios de staff.
 * - La `anon` se prueba contra `/auth/v1/settings`, que rechaza una key de otro
 *   proyecto. Esa es la que viaja al navegador.
 */
async function supabaseKeysProbe(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !service || !anon) {
    console.error(
      'Falta NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_SUPABASE_ANON_KEY',
    )
    return false
  }
  let ok = true
  try {
    const res = await fetch(`${url}/auth/v1/admin/users?per_page=1`, {
      headers: { apikey: service, Authorization: `Bearer ${service}` },
    })
    if (res.ok) console.log('  Supabase service_role: privilegios de admin confirmados')
    else {
      console.error(
        `Supabase service_role rechazada (HTTP ${res.status}) — key de otro proyecto, revocada, ` +
          'o es en realidad la anon pegada en el lugar equivocado',
      )
      ok = false
    }
  } catch (e) {
    console.error(`Supabase service_role probe fallo: ${(e as Error).message}`)
    ok = false
  }
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anon } })
    if (res.ok) console.log('  Supabase anon: valida para este proyecto')
    else {
      console.error(`Supabase anon rechazada (HTTP ${res.status}) — no es de este proyecto`)
      ok = false
    }
  } catch (e) {
    console.error(`Supabase anon probe fallo: ${(e as Error).message}`)
    ok = false
  }
  return ok
}

/**
 * Upstash: la URL y el token abren la base de rate-limit, y se puede escribir.
 *
 * Va y vuelve sobre una clave descartable con TTL de 60 s. Sin esto el
 * rate-limit falla abierto (`apply.ts`) y los caminos de plata quedan sin
 * freno, que es justo lo contrario de lo que se supone que hacen.
 */
async function upstashProbe(): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    console.error('Falta UPSTASH_REDIS_REST_URL o UPSTASH_REDIS_REST_TOKEN')
    return false
  }
  const key = 'launch-check:probe'
  try {
    const res = await fetch(`${url}/set/${key}/ok?EX=60`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      console.error(`Upstash rechazo la escritura (HTTP ${res.status})`)
      return false
    }
    const read = await fetch(`${url}/get/${key}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = (await read.json()) as { result?: string }
    if (body.result !== 'ok') {
      console.error(`Upstash escribio pero devolvio "${body.result}" al leer`)
      return false
    }
    console.log('  Upstash: escritura y lectura confirmadas')
    return true
  } catch (e) {
    console.error(`Upstash probe fallo: ${(e as Error).message}`)
    return false
  }
}

/**
 * `IMPERSONATION_COOKIE_SECRET` firma y verifica de verdad.
 *
 * Es la cookie con la que un SuperAdmin entra como un complejo. `env.ts` solo
 * exige 16 caracteres; esto hace el viaje completo (firmar, verificar, y que
 * una firma con otro secreto sea rechazada) con el mismo HMAC que usa la app.
 */
async function impersonationSecretProbe(): Promise<boolean> {
  const secret = process.env.IMPERSONATION_COOKIE_SECRET
  if (!secret) {
    console.error('IMPERSONATION_COOKIE_SECRET not set')
    return false
  }
  const { createHmac, timingSafeEqual } = await import('node:crypto')
  const sign = (payload: string, k: string) => createHmac('sha256', k).update(payload).digest('hex')
  const payload = 'launch-check-probe'
  const good = Buffer.from(sign(payload, secret))
  const forged = Buffer.from(sign(payload, `${secret}-otro`))
  if (good.length !== forged.length || timingSafeEqual(good, forged)) {
    console.error('IMPERSONATION_COOKIE_SECRET: el HMAC no discrimina — secreto inservible')
    return false
  }
  if (!timingSafeEqual(good, Buffer.from(sign(payload, secret)))) {
    console.error('IMPERSONATION_COOKIE_SECRET: la firma no es reproducible')
    return false
  }
  console.log('  Impersonation secret: firma y rechaza como corresponde')
  return true
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
    check: mpCredentialsProbe,
    fatal: false,
    needs: ['MP_CLIENT_ID', 'MP_CLIENT_SECRET'],
  },
  {
    name: 'mp master token probe (Suscripciones)',
    check: mpMasterTokenProbe,
    fatal: false,
    needs: ['MP_TURNOGOL_ACCESS_TOKEN'],
  },
  { name: 'resend probe (email)', check: resendProbe, fatal: false, needs: ['RESEND_API_KEY'] },
  {
    name: 'r2 probe (bucket de imagenes)',
    check: r2Probe,
    fatal: false,
    needs: ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'],
  },
  {
    name: 'r2 public domain probe',
    check: r2PublicDomainProbe,
    fatal: false,
    needs: ['R2_PUBLIC_BASE_URL'],
  },
  {
    name: 'supabase keys probe (service_role + anon)',
    check: supabaseKeysProbe,
    fatal: false,
    needs: [
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ],
  },
  {
    name: 'upstash probe (rate-limit)',
    check: upstashProbe,
    fatal: false,
    needs: ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
  },
  {
    name: 'impersonation secret probe',
    check: impersonationSecretProbe,
    fatal: false,
    needs: ['IMPERSONATION_COOKIE_SECRET'],
  },
  {
    name: 'vapid pair (push)',
    needs: ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'],
    check: async () => {
      const r = vapidPairMatches(
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY,
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      )
      if (!r.ok) console.error(r.error)
      return r.ok
    },
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
        `(env file: ${process.env.LAUNCH_CHECK_ENV_FILE ?? '.env.local'})\n`,
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
