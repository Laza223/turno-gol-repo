import { createECDH, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

/**
 * ─── Sondas de credenciales: presencia no es funcionamiento ──────────────────
 *
 * Existen porque había tres capas mirando las variables de entorno y ninguna
 * probaba lo único que importa:
 *
 *   `src/shared/env.ts`  → FORMA (largo, regex, url) al arrancar
 *   `/api/status`        → PRESENCIA (`!!process.env.X`) para MP, email, Sentry
 *   `launch-check.ts`    → FUNCIONAMIENTO real, pero solo MP, SSL y roles de DB
 *
 * Una API key revocada, una clave pegada de otra cuenta o un bucket renombrado
 * pasaban las tres y fallaban recién en producción.
 *
 * Viven acá y no en `scripts/` por un motivo concreto: correrlas contra un
 * archivo `.env` local prueba lo que dice ESE ARCHIVO, no lo que tiene cargado
 * el ambiente real. La primera corrida contra producción (2026-08-25) devolvió
 * 13 rojos y ninguno era una credencial rota: el `.env.production` local estaba
 * viejo. Desde acá las importan los DOS lados — el script, y el runtime de la
 * app, donde las variables son las de verdad.
 *
 * Reglas que cumplen todas:
 *   · son de LECTURA — no mueven plata ni escriben datos de negocio;
 *   · NUNCA devuelven el valor de un secreto, solo el identificador de la
 *     cuenta o del recurso, que es lo que hay que comparar;
 *   · una variable ausente da `skip`, no `fail`: la auditoría tiene que
 *     distinguir "está rota" de "no me la diste".
 */

type ProbeStatus = 'ok' | 'fail' | 'skip'

export type ProbeResult = {
  /** Identificador estable; se usa como clave en el panel y en los tests. */
  name: string
  status: ProbeStatus
  /** Legible por humanos. Nunca contiene un secreto. */
  detail: string
}

function skip(name: string, missing: string[]): ProbeResult {
  return { name, status: 'skip', detail: `sin probar: falta ${missing.join(', ')}` }
}

function missingFrom(keys: string[]): string[] {
  return keys.filter((k) => !process.env[k])
}

/**
 * Resend: la key sirve **y** hay un dominio verificado.
 *
 * Lo segundo importa tanto como lo primero: una key válida con el dominio sin
 * verificar manda igual, pero los mails rebotan o caen en spam — el modo de
 * falla que nadie mira. Los mails salen como `no-reply@turnogol.app`
 * (`email.provider.ts`) firmados por el subdominio `send.turnogol.app`.
 */
export async function probeResend(): Promise<ProbeResult> {
  const name = 'resend'
  const missing = missingFrom(['RESEND_API_KEY'])
  if (missing.length > 0) return skip(name, missing)
  try {
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    })
    if (res.status === 401 || res.status === 403) {
      return { name, status: 'fail', detail: `key rechazada (HTTP ${res.status})` }
    }
    if (!res.ok) return { name, status: 'fail', detail: `HTTP ${res.status}` }
    const body = (await res.json()) as { data?: { name: string; status: string }[] }
    const domains = body.data ?? []
    if (domains.length === 0) {
      return { name, status: 'fail', detail: 'la key sirve pero la cuenta no tiene dominios' }
    }
    const listado = domains.map((d) => `${d.name}=${d.status}`).join(', ')
    if (!domains.some((d) => d.status === 'verified')) {
      return { name, status: 'fail', detail: `ningún dominio verificado (${listado})` }
    }
    return { name, status: 'ok', detail: listado }
  } catch (e) {
    return { name, status: 'fail', detail: (e as Error).message }
  }
}

/**
 * R2: las credenciales abren el bucket que dice `R2_BUCKET`.
 *
 * `HeadBucket` prueba las tres cosas a la vez — clave válida, permiso, y que el
 * bucket exista con ese nombre exacto. `/api/status` solo miraba que las cinco
 * variables estuvieran definidas, así que un `R2_BUCKET` mal tipeado le daba
 * verde.
 */
export async function probeR2(): Promise<ProbeResult> {
  const name = 'r2-bucket'
  const keys = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']
  const missing = missingFrom(keys)
  if (missing.length > 0) return skip(name, missing)
  const bucket = process.env.R2_BUCKET as string
  try {
    const { S3Client, HeadBucketCommand } = await import('@aws-sdk/client-s3')
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
      },
    })
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
    return { name, status: 'ok', detail: `bucket "${bucket}" accesible` }
  } catch (e) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number }; message: string }
    const code = err.$metadata?.httpStatusCode
    if (code === 404) return { name, status: 'fail', detail: `el bucket "${bucket}" no existe` }
    if (code === 401 || code === 403) {
      return { name, status: 'fail', detail: `credenciales rechazadas (HTTP ${code})` }
    }
    return { name, status: 'fail', detail: `${err.name ?? ''} ${err.message}`.trim() }
  }
}

/**
 * El dominio público de las imágenes responde por HTTPS.
 *
 * Un 404 es ÉXITO: el DNS resuelve, el certificado sirve y Cloudflare contesta;
 * que no haya un objeto en la raíz es lo esperado. Lo que busca es el otro caso
 * — que apunte a un dominio inexistente, como `media.turnogol.com`, que estuvo
 * meses en `next.config.ts` hasta el 2026-08-25.
 */
export async function probeR2PublicDomain(): Promise<ProbeResult> {
  const name = 'r2-public-domain'
  const missing = missingFrom(['R2_PUBLIC_BASE_URL'])
  if (missing.length > 0) return skip(name, missing)
  const base = process.env.R2_PUBLIC_BASE_URL as string
  try {
    const res = await fetch(base, { method: 'HEAD' })
    return { name, status: 'ok', detail: `${base} responde HTTP ${res.status}` }
  } catch (e) {
    return { name, status: 'fail', detail: `${base} no responde: ${(e as Error).message}` }
  }
}

/**
 * Las dos claves de Supabase son de ESTE proyecto y tienen el poder que dicen.
 *
 * La `service_role` va contra `/auth/v1/admin/users`, que solo responde con
 * privilegios de admin: si alguien pegó ahí la `anon` —mismo formato JWT, mismo
 * largo, indistinguibles a ojo— el `min(20)` de `env.ts` le daba verde y recién
 * fallaba al crear usuarios de staff. La `anon` va contra `/auth/v1/settings`,
 * que rechaza una key de otro proyecto; esa es la que viaja al navegador.
 */
export async function probeSupabaseKeys(): Promise<ProbeResult> {
  const name = 'supabase-keys'
  const keys = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ]
  const missing = missingFrom(keys)
  if (missing.length > 0) return skip(name, missing)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const problemas: string[] = []
  try {
    const res = await fetch(`${url}/auth/v1/admin/users?per_page=1`, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    })
    if (!res.ok) {
      problemas.push(
        `service_role sin privilegios de admin (HTTP ${res.status}) — de otro proyecto, ` +
          'revocada, o es la anon pegada en el lugar equivocado',
      )
    }
  } catch (e) {
    problemas.push(`service_role: ${(e as Error).message}`)
  }
  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string },
    })
    if (!res.ok) problemas.push(`anon rechazada (HTTP ${res.status}) — no es de este proyecto`)
  } catch (e) {
    problemas.push(`anon: ${(e as Error).message}`)
  }
  return problemas.length > 0
    ? { name, status: 'fail', detail: problemas.join(' | ') }
    : { name, status: 'ok', detail: 'service_role con privilegios de admin y anon del proyecto' }
}

/**
 * Upstash: la URL y el token abren la base de rate-limit, y se puede escribir.
 *
 * Va y vuelve sobre una clave descartable con TTL de 60 s. Sin esto el
 * rate-limit falla abierto (`apply.ts`) y los caminos de plata quedan sin freno.
 */
export async function probeUpstash(): Promise<ProbeResult> {
  const name = 'upstash'
  const missing = missingFrom(['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'])
  if (missing.length > 0) return skip(name, missing)
  const url = process.env.UPSTASH_REDIS_REST_URL as string
  const headers = { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` }
  const key = 'credential-probe'
  try {
    const write = await fetch(`${url}/set/${key}/ok?EX=60`, { headers })
    if (!write.ok)
      return { name, status: 'fail', detail: `escritura rechazada (HTTP ${write.status})` }
    const read = await fetch(`${url}/get/${key}`, { headers })
    const body = (await read.json()) as { result?: string }
    if (body.result !== 'ok') {
      return { name, status: 'fail', detail: `escribió pero leyó "${body.result}"` }
    }
    return { name, status: 'ok', detail: 'escritura y lectura confirmadas' }
  } catch (e) {
    return { name, status: 'fail', detail: (e as Error).message }
  }
}

/**
 * `IMPERSONATION_COOKIE_SECRET` firma y verifica de verdad.
 *
 * Es la cookie con la que un SuperAdmin entra como un complejo. `env.ts` solo
 * exige 16 caracteres; esto hace el viaje completo — firma, verifica, y rechaza
 * una firma hecha con otro secreto.
 */
export function probeImpersonationSecret(): ProbeResult {
  const name = 'impersonation-secret'
  const missing = missingFrom(['IMPERSONATION_COOKIE_SECRET'])
  if (missing.length > 0) return skip(name, missing)
  const secret = process.env.IMPERSONATION_COOKIE_SECRET as string
  const sign = (payload: string, k: string) => createHmac('sha256', k).update(payload).digest('hex')
  const payload = 'credential-probe'
  const good = Buffer.from(sign(payload, secret))
  const forged = Buffer.from(sign(payload, `${secret}-otro`))
  if (good.length !== forged.length || timingSafeEqual(good, forged)) {
    return { name, status: 'fail', detail: 'el HMAC no discrimina — secreto inservible' }
  }
  if (!timingSafeEqual(good, Buffer.from(sign(payload, secret)))) {
    return { name, status: 'fail', detail: 'la firma no es reproducible' }
  }
  return { name, status: 'ok', detail: 'firma y rechaza como corresponde' }
}

/**
 * ¿El par de claves VAPID es realmente un par?
 *
 * `env.ts` valida LARGOS y `web-push` valida el formato, pero ninguno comprueba
 * lo único que importa: que la pública se derive de la privada. Rotar una y
 * olvidarse de la otra pasa los dos chequeos y deja push roto **en silencio** —
 * el navegador acepta la suscripción con la pública vieja, el servidor firma con
 * la privada nueva, y cada envío muere con un 403 de los servidores de push que
 * nadie mira. El síntoma que ve el dueño es "dejaron de sonar las reservas
 * online", sin un solo error en la app.
 *
 * VAPID es P-256: la pública es el punto sin comprimir (0x04 || X || Y, 65
 * bytes) derivable de la privada (escalar de 32 bytes). Determinístico y sin red.
 *
 * También compara `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, que viaja al navegador: si
 * difiere, el cliente se suscribe contra una clave con la que el servidor no
 * firma, con el mismo final silencioso.
 */
export function vapidPairMatches(
  publicKey: string | undefined,
  privateKey: string | undefined,
  clientPublicKey?: string | undefined,
): { ok: true } | { ok: false; error: string } {
  if (!publicKey || !privateKey) {
    return { ok: false, error: 'VAPID_PUBLIC_KEY o VAPID_PRIVATE_KEY sin definir' }
  }
  if (clientPublicKey !== undefined && clientPublicKey !== publicKey) {
    return {
      ok: false,
      error:
        'NEXT_PUBLIC_VAPID_PUBLIC_KEY no coincide con VAPID_PUBLIC_KEY: el navegador se ' +
        'suscribiría con una clave con la que el servidor no firma, y cada push moriría con 403',
    }
  }
  let derived: Buffer
  try {
    const ecdh = createECDH('prime256v1')
    ecdh.setPrivateKey(Buffer.from(privateKey, 'base64url'))
    derived = ecdh.getPublicKey()
  } catch (e) {
    return {
      ok: false,
      error: `VAPID_PRIVATE_KEY no es un escalar P-256 válido: ${(e as Error).message}`,
    }
  }
  if (!derived.equals(Buffer.from(publicKey, 'base64url'))) {
    return {
      ok: false,
      error:
        'VAPID_PUBLIC_KEY no se deriva de VAPID_PRIVATE_KEY: no son un par. ' +
        'Push queda roto en silencio (403 de los servidores de push, sin error en la app)',
    }
  }
  return { ok: true }
}

export function probeVapidPair(): ProbeResult {
  const name = 'vapid-pair'
  const missing = missingFrom(['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'])
  if (missing.length > 0) return skip(name, missing)
  const r = vapidPairMatches(
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  )
  return r.ok
    ? { name, status: 'ok', detail: 'la pública se deriva de la privada' }
    : { name, status: 'fail', detail: r.error }
}

/**
 * MercadoPago Checkout Pro: el par `client_id` / `client_secret` del OAuth por
 * complejo. Un `refresh_token` inválido contra credenciales VÁLIDAS devuelve
 * 400; credenciales malas devuelven 401/403. No mueve un peso.
 */
export async function probeMpOauth(): Promise<ProbeResult> {
  const name = 'mp-oauth'
  const missing = missingFrom(['MP_CLIENT_ID', 'MP_CLIENT_SECRET'])
  if (missing.length > 0) return skip(name, missing)
  try {
    const res = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.MP_CLIENT_ID,
        client_secret: process.env.MP_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: 'probe-invalid',
      }),
    })
    if (res.status === 400) return { name, status: 'ok', detail: 'credenciales aceptadas' }
    if (res.status === 401 || res.status === 403) {
      return { name, status: 'fail', detail: `credenciales rechazadas (HTTP ${res.status})` }
    }
    return { name, status: 'fail', detail: `HTTP ${res.status} (se esperaba 400)` }
  } catch (e) {
    return { name, status: 'fail', detail: (e as Error).message }
  }
}

/**
 * El token master, con el que TurnoGol cobra SU plata (la suscripción SaaS).
 *
 * `GET /users/me` es lectura pura. El id de cuenta que imprime es el chequeo que
 * de verdad importa: un token válido pero de la cuenta de un complejo autentica
 * igual y cobraría a la cuenta equivocada.
 */
export async function probeMpMasterToken(): Promise<ProbeResult> {
  const name = 'mp-master-token'
  const missing = missingFrom(['MP_TURNOGOL_ACCESS_TOKEN'])
  if (missing.length > 0) return skip(name, missing)
  try {
    const res = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${process.env.MP_TURNOGOL_ACCESS_TOKEN}` },
    })
    if (!res.ok) {
      return { name, status: 'fail', detail: `token rechazado (HTTP ${res.status})` }
    }
    const body = (await res.json()) as { id?: number; nickname?: string }
    return { name, status: 'ok', detail: `cuenta ${body.id ?? '?'} (${body.nickname ?? '?'})` }
  } catch (e) {
    return { name, status: 'fail', detail: (e as Error).message }
  }
}

/**
 * Sentry (servidor): `SENTRY_DSN` sirve para ingerir un evento real.
 *
 * `env.ts` NO valida esta var — Sentry se inicializa aparte, en
 * `sentry.server.config.ts`/`instrumentation.ts`, y una clave vacía, un
 * placeholder o una URL mal armada saltean el init EN SILENCIO: sin este
 * chequeo, "la var está seteada" (`/api/status`, `!!process.env.SENTRY_DSN`)
 * es la única señal que existe, y no distingue un DSN real de basura. Medido
 * el 2026-08-26/27: 14 días sin un solo evento del runtime de servidor de
 * Vercel — ver docs/audit/2026-08-25-auditoria-infra.md §19.
 *
 * Manda un evento de PRUEBA directo al endpoint de ingesta de Sentry (mismo
 * formato de envelope que usa el SDK, verificado contra un receptor propio en
 * dev) — no pasa por `@sentry/nextjs`, a propósito: si el SDK nunca arrancó,
 * probar A TRAVÉS de él no distingue "DSN malo" de "SDK no inicializado". Un
 * `fingerprint` fijo agrupa todas las corridas en un solo issue de Sentry, no
 * uno por vez.
 */
export async function probeSentry(): Promise<ProbeResult> {
  const name = 'sentry'
  const missing = missingFrom(['SENTRY_DSN'])
  if (missing.length > 0) return skip(name, missing)
  const dsn = process.env.SENTRY_DSN as string
  let url: URL
  try {
    url = new URL(dsn)
  } catch {
    return { name, status: 'fail', detail: 'SENTRY_DSN no es una URL válida' }
  }
  const publicKey = url.username
  const projectId = url.pathname.replace(/^\//, '')
  if (!publicKey || !projectId) {
    return {
      name,
      status: 'fail',
      detail: 'la URL no tiene clave pública o id de proyecto — no es un DSN',
    }
  }
  const eventId = randomUUID().replace(/-/g, '')
  const nowIso = new Date().toISOString()
  const envelope = [
    JSON.stringify({ event_id: eventId, sent_at: nowIso }),
    JSON.stringify({ type: 'event', content_type: 'application/json' }),
    JSON.stringify({
      event_id: eventId,
      timestamp: nowIso,
      platform: 'node',
      level: 'info',
      logger: 'credential-probe',
      message: { formatted: 'credential-probe: sonda de configuración, no es un error real' },
      fingerprint: ['credential-probe-sentry'],
    }),
  ].join('\n')
  try {
    const res = await fetch(
      `${url.origin}/api/${projectId}/envelope/?sentry_version=7&sentry_key=${publicKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-sentry-envelope' },
        body: envelope,
      },
    )
    if (res.status === 401 || res.status === 403) {
      return {
        name,
        status: 'fail',
        detail: `clave rechazada (HTTP ${res.status}) — DSN inválido o revocado`,
      }
    }
    if (res.status === 404) {
      return { name, status: 'fail', detail: `proyecto "${projectId}" no existe en ese host` }
    }
    if (!res.ok) return { name, status: 'fail', detail: `HTTP ${res.status}` }
    return {
      name,
      status: 'ok',
      detail: `evento de prueba aceptado (host ${url.host}, proyecto ${projectId})`,
    }
  } catch (e) {
    return { name, status: 'fail', detail: (e as Error).message }
  }
}

/**
 * Sentry **por el SDK**, no por HTTP crudo. Es el complemento de `probeSentry`.
 *
 * `probeSentry` prueba la credencial y la red salteándose `@sentry/nextjs` a
 * propósito. Esta hace lo contrario: recorre el camino REAL que usan los ~84
 * `captureException` de la app, y reporta en qué eslabón se corta. Nace porque
 * en producción esos dos caminos NO coinciden — el crudo entrega y el del SDK
 * no (docs/audit/2026-08-25-auditoria-infra.md §19), y sin instrumento no había
 * forma de saber dónde se pierde.
 *
 * Los tres eslabones, en orden:
 *   1. ¿hay cliente? — si `getClient()` es `undefined`, `Sentry.init()` no
 *      corrió en ESTE runtime (o corrió sobre otra copia del SDK);
 *   2. ¿el evento sobrevive a `beforeSend`? — `captureMessage` devuelve el id
 *      igual, así que se mira el `dsn` del cliente y se confía en el flush;
 *   3. ¿el transporte lo entrega? — `flush()` devuelve `false` si quedó algo
 *      sin mandar antes del timeout.
 *
 * Manda un evento real, con el MISMO `fingerprint` que `probeSentry` para que
 * las dos sondas agrupen en un solo issue y no ensucien el proyecto.
 */
export async function probeSentrySdk(): Promise<ProbeResult> {
  const name = 'sentry-sdk'
  const missing = missingFrom(['SENTRY_DSN'])
  if (missing.length > 0) return skip(name, missing)
  try {
    const Sentry = await import('@sentry/nextjs')
    const client = Sentry.getClient()
    if (!client) {
      return {
        name,
        status: 'fail',
        detail:
          'Sentry.init() no dejó un cliente activo en este runtime — ' +
          'instrumentation.ts no corrió, o corrió sobre otra copia del SDK',
      }
    }
    const opciones = client.getOptions()
    // `NODE_ENV` no es un secreto y decide el `beforeSend` de
    // sentry.server.config.ts, que descarta TODO si no vale 'production'.
    const nodeEnv = process.env.NODE_ENV ?? '(sin definir)'
    const eventId = Sentry.captureMessage(
      'credential-probe: sonda de configuración, no es un error real',
      { level: 'info', fingerprint: ['credential-probe-sentry'] },
    )
    const entregado = await Sentry.flush(5000)
    const partes = [
      `NODE_ENV=${nodeEnv}`,
      `environment=${opciones.environment ?? '(sin definir)'}`,
      `dsn=${opciones.dsn ? 'presente' : 'AUSENTE'}`,
      `eventId=${eventId ? 'sí' : 'NO'}`,
      `flush=${entregado ? 'ok' : 'incompleto'}`,
    ].join(', ')
    if (!eventId || !entregado) {
      return { name, status: 'fail', detail: `el SDK no entregó — ${partes}` }
    }
    return { name, status: 'ok', detail: `evento entregado por el SDK — ${partes}` }
  } catch (e) {
    return { name, status: 'fail', detail: (e as Error).message }
  }
}

/**
 * Corre todas las sondas en paralelo. El orden del resultado es estable.
 *
 * Ninguna lanza: cada una atrapa lo suyo y devuelve `fail`. Así el llamador
 * —panel o script— siempre recibe la lista completa.
 */
export async function runCredentialProbes(): Promise<ProbeResult[]> {
  const [resend, r2, r2Public, supabase, upstash, mpOauth, mpMaster, sentry, sentrySdk] =
    await Promise.all([
      probeResend(),
      probeR2(),
      probeR2PublicDomain(),
      probeSupabaseKeys(),
      probeUpstash(),
      probeMpOauth(),
      probeMpMasterToken(),
      probeSentry(),
      probeSentrySdk(),
    ])
  return [
    mpOauth,
    mpMaster,
    resend,
    r2,
    r2Public,
    supabase,
    upstash,
    sentry,
    sentrySdk,
    probeImpersonationSecret(),
    probeVapidPair(),
  ]
}
