/**
 * Sonda de PERMISOS del token OAuth de un complejo, contra la API real de
 * MercadoPago y **sin mover un peso**.
 *
 * Por qué existe: durante la migración a dos aplicaciones de MercadoPago
 * (2026-08-22, `docs/planning/2026-08-22-dos-apps-mercadopago.md`) nos apoyamos
 * en el `scope` que devuelve el intercambio OAuth para decidir si una
 * aplicación podía reembolsar. Ese string resultó ser mala evidencia: la app de
 * Checkout Pro no lista NINGÚN permiso de `payments` —ni de lectura— y sin
 * embargo toda integración Checkout Pro consulta `/v1/payments/{id}` después
 * del webhook. O el listado de URNs no es autoritativo, o el producto sería
 * inservible. Adivinar cuál cuesta un ciclo entero de 15 minutos: crear la app,
 * configurarle webhooks, cambiar variables en Vercel y Railway, redeployar y
 * reconectar un complejo.
 *
 * Esta sonda reemplaza ese ciclo por un comando. Le pregunta a MercadoPago
 * directamente "¿este token puede X?" y se cree la respuesta de la API, no la
 * del `scope`.
 *
 * ── Por qué no mueve plata ──────────────────────────────────────────────────
 *
 * La sonda de reembolso hace un POST real a `/v1/payments/{id}/refunds`, pero
 * contra un `payment_id` INEXISTENTE. El chequeo de permisos de MercadoPago
 * corre en su gateway, ANTES de buscar el recurso — eso es exactamente lo que
 * significa el `403 At least one policy returned UNAUTHORIZED` que motivó todo
 * esto. Así que el código de respuesta separa las dos hipótesis sin que exista
 * un pago al que devolverle nada:
 *
 *   403  -> el token NO tiene permiso de reembolso  (falla la policy)
 *   404  -> el token SÍ tiene permiso               (pasa la policy, no hay recurso)
 *
 * El id que se manda es de 12 dígitos y no pertenece al vendedor; aunque
 * existiera en MercadoPago, un reembolso sobre un pago ajeno da 404, nunca una
 * devolución. Igual se puede pisar con `--refund-probe-id=<id>` si algún día
 * hace falta apuntar a uno propio.
 *
 * ── Uso ─────────────────────────────────────────────────────────────────────
 *
 *   SENTRY_ENV_FILE no: este script lee `.env.production` por defecto, igual que
 *   `inspect-mp-payment.ts`, y exige el MISMO `ENCRYPTION_KEY` que producción
 *   (el token está cifrado at-rest).
 *
 *   pnpm tsx scripts/probe-mp-permissions.ts <slug>
 *   MP_ENV_FILE=.env.production pnpm tsx scripts/probe-mp-permissions.ts complejo-elite-futbol
 *
 * Si el DSN local no sirve (el `.env.production` del repo no es foto de prod,
 * ver docs/planning), se puede saltear la base pasando el ciphertext:
 *
 *   MP_TOKEN_CIPHERTEXT_FILE=token.txt pnpm tsx scripts/probe-mp-permissions.ts
 */
import { readFileSync } from 'node:fs'
import postgres from 'postgres'

function loadEnvFile(path: string): void {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    console.error(`No pude leer ${path}`)
    process.exit(1)
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (!m) continue
    const [, key, valRaw] = m
    if (process.env[key]) continue
    process.env[key] = valRaw.replace(/^["']|["']$/g, '')
  }
}

loadEnvFile(process.env.MP_ENV_FILE ?? '.env.production')

const args = process.argv.slice(2)
const slug = args.find((a) => !a.startsWith('--'))
const refundProbeId =
  args.find((a) => a.startsWith('--refund-probe-id='))?.split('=')[1] ?? '999999999999'

if (!slug && !process.env.MP_TOKEN_CIPHERTEXT && !process.env.MP_TOKEN_CIPHERTEXT_FILE) {
  console.error('Uso: pnpm tsx scripts/probe-mp-permissions.ts <slug-del-complejo>')
  process.exit(1)
}

type Sonda = {
  nombre: string
  detalle: string
  status: number
  veredicto: string
  cuerpo: string
}

const MP = 'https://api.mercadopago.com'

/** Recorta el cuerpo: alcanza con el `error`/`message` para diagnosticar. */
function recortar(texto: string): string {
  return texto.replace(/\s+/g, ' ').slice(0, 220)
}

async function sondear(
  nombre: string,
  detalle: string,
  init: { url: string; method?: string; token: string; body?: unknown },
  interpretar: (status: number) => string,
): Promise<Sonda> {
  const res = await fetch(init.url, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${init.token}`,
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      // Obligatoria en los POST de reembolso; un UUID nuevo por corrida para
      // que MercadoPago no colapse dos sondas distintas en la misma operación.
      'X-Idempotency-Key': crypto.randomUUID(),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  const cuerpo = recortar(await res.text().catch(() => ''))
  return { nombre, detalle, status: res.status, veredicto: interpretar(res.status), cuerpo }
}

async function main(): Promise<void> {
  const { decrypt } = await import('../src/lib/crypto/encrypt')

  const ctFile = process.env.MP_TOKEN_CIPHERTEXT_FILE
  const ctFromEnv = ctFile ? readFileSync(ctFile, 'utf8').trim() : process.env.MP_TOKEN_CIPHERTEXT

  let cipher: string
  let tenantId: string | null = null
  let sql: ReturnType<typeof postgres> | null = null

  if (ctFromEnv) {
    cipher = ctFromEnv
  } else {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false })
    const rows = await sql<{ id: string; name: string; token: string | null }[]>`
      SELECT id, name, mp_access_token AS token FROM tenants WHERE slug = ${slug!} LIMIT 1
    `
    const tenant = rows[0]
    if (!tenant?.token) {
      console.error(`El complejo ${slug} no existe o no tiene MercadoPago conectado.`)
      await sql.end()
      process.exit(1)
    }
    cipher = tenant.token
    tenantId = tenant.id
    console.log(`complejo: ${tenant.name} (${tenant.id})`)
  }

  let accessToken: string
  try {
    accessToken = decrypt(cipher)
  } catch (err) {
    console.error('No se pudo DESCIFRAR el token del complejo.')
    console.error('Eso significa que ENCRYPTION_KEY de este env NO es la de producción.')
    console.error(err instanceof Error ? err.message : String(err))
    if (sql) await sql.end()
    process.exit(1)
  }

  // Un pago propio del complejo, para que la sonda de LECTURA pruebe el caso
  // real (leer un pago que le pertenece) y no un 404 por recurso ajeno.
  let pagoPropio: string | null = null
  if (sql && tenantId) {
    const rows = await sql<{ mp_payment_id: string | null }[]>`
      SELECT mp_payment_id FROM payments
      WHERE tenant_id = ${tenantId} AND mp_payment_id IS NOT NULL AND type <> 'refund'
      ORDER BY created_at DESC LIMIT 1
    `
    pagoPropio = rows[0]?.mp_payment_id ?? null
  }
  if (sql) await sql.end()

  const sondas: Sonda[] = []

  sondas.push(
    await sondear(
      'identidad',
      'GET /users/me',
      { url: `${MP}/users/me`, token: accessToken },
      (s) => (s === 200 ? 'OK — el token es válido y vive' : `INESPERADO (${s})`),
    ),
  )

  if (pagoPropio) {
    sondas.push(
      await sondear(
        'leer pagos',
        `GET /v1/payments/${pagoPropio}`,
        { url: `${MP}/v1/payments/${pagoPropio}`, token: accessToken },
        (s) =>
          s === 200
            ? 'PUEDE LEER pagos'
            : s === 403
              ? 'NO PUEDE LEER pagos — la confirmación de señas NO va a funcionar'
              : `INESPERADO (${s})`,
      ),
    )
  } else {
    console.log('(sin pagos propios en la base: se saltea la sonda de lectura)\n')
  }

  sondas.push(
    await sondear(
      'reembolsar',
      `POST /v1/payments/${refundProbeId}/refunds  (pago inexistente — no mueve plata)`,
      {
        url: `${MP}/v1/payments/${refundProbeId}/refunds`,
        method: 'POST',
        token: accessToken,
      },
      (s) =>
        s === 403
          ? 'NO PUEDE REEMBOLSAR — la policy rechaza antes de mirar el recurso'
          : s === 404
            ? 'PUEDE REEMBOLSAR — pasó la policy y sólo falta el recurso'
            : `AMBIGUO (${s}) — leer el cuerpo`,
    ),
  )

  console.log('\n===== permisos reales del token =====\n')
  for (const s of sondas) {
    console.log(`${s.nombre.padEnd(12)} ${String(s.status).padEnd(4)} ${s.veredicto}`)
    console.log(`             ${s.detalle}`)
    if (s.cuerpo) console.log(`             ${s.cuerpo}`)
    console.log('')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
