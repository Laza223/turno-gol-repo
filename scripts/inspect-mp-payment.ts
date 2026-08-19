/**
 * Inspecciona en la API de MercadoPago los pagos reales de un booking, con los
 * campos que ninguna captura de pantalla muestra: fecha exacta de liberación
 * del dinero (`money_release_date`), cuotas, comisiones desglosadas y el neto
 * que efectivamente recibe el complejo.
 *
 * Por qué existe: durante la primera prueba de cobro real (2026-08-18) quedó
 * sin resolver si el dinero se liberaba por el plazo configurado en la cuenta
 * (0–70 días, "Costos y cuotas") o por una retención preventiva. La app de MP
 * no muestra la fecha en ningún lado navegable; la API sí, en un solo campo.
 *
 * Lee el token OAuth del complejo desde la DB (cifrado at-rest) y lo descifra
 * con `ENCRYPTION_KEY` — o sea que exige el MISMO env que usa producción.
 *
 * Uso:
 *   SENTRY_ENV_FILE=.env.production pnpm tsx scripts/inspect-mp-payment.ts <slug> [bookingId]
 *
 * Sin `bookingId` lista los últimos pagos del complejo por su `external_reference`.
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

const slug = process.argv[2]
const bookingId = process.argv[3]
if (!slug) {
  console.error('Uso: tsx scripts/inspect-mp-payment.ts <slug> [bookingId]')
  process.exit(1)
}

async function main(): Promise<void> {
  const { decrypt } = await import('../src/lib/crypto/encrypt')

  // El ciphertext puede venir por env (`MP_TOKEN_CIPHERTEXT`) cuando el DSN local
  // no sirve — el .env.production del repo NO es foto de prod y su password puede
  // estar rotada. Con la env var seteada, el script no toca la base para nada.
  const ctFile = process.env.MP_TOKEN_CIPHERTEXT_FILE
  const ctFromEnv = ctFile ? readFileSync(ctFile, 'utf8').trim() : process.env.MP_TOKEN_CIPHERTEXT
  let cipher: string
  let tenantId: string | null = null
  let sql: ReturnType<typeof postgres> | null = null

  if (ctFromEnv) {
    cipher = ctFromEnv
  } else {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false })
    const rows = await sql<{ id: string; token: string | null }[]>`
    SELECT id, mp_access_token AS token FROM tenants WHERE slug = ${slug} LIMIT 1
  `
    const tenant = rows[0]
    if (!tenant?.token) {
      console.error(`El complejo ${slug} no tiene MercadoPago conectado.`)
      await sql.end()
      process.exit(1)
    }
    cipher = tenant.token
    tenantId = tenant.id
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
  console.log(`token descifrado OK (empieza con ${accessToken.slice(0, 8)}…)\n`)

  let refs: string[]
  if (bookingId) {
    refs = [bookingId]
  } else if (sql && tenantId) {
    refs = (
      await sql<{ id: string }[]>`
      SELECT b.id FROM bookings b
      JOIN payments p ON p.booking_id = b.id
      WHERE b.tenant_id = ${tenantId} AND p.mp_preference_id IS NOT NULL
      ORDER BY b.created_at DESC LIMIT 5
    `
    ).map((r) => r.id)
  } else {
    console.error('Sin acceso a la base: pasá el bookingId como segundo argumento.')
    process.exit(1)
  }

  if (sql) await sql.end()

  if (refs.length === 0) {
    console.log('No hay bookings con checkout iniciado para este complejo.')
    return
  }

  for (const ref of refs) {
    const url = `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(ref)}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) {
      console.error(`booking ${ref}: MP respondió ${res.status} ${await res.text()}`)
      continue
    }
    const body = (await res.json()) as { results?: Record<string, unknown>[] }
    const results = body.results ?? []
    console.log(`\n===== booking ${ref} — ${results.length} pago(s) en MP =====`)

    for (const p of results) {
      const fees = (p.fee_details ?? []) as { type?: string; amount?: number }[]
      console.log({
        mp_payment_id: p.id,
        status: p.status,
        status_detail: p.status_detail,
        // El dato que buscamos: cuándo MP libera la plata al complejo.
        money_release_date: p.money_release_date,
        money_release_status: p.money_release_status,
        money_release_schema: p.money_release_schema,
        date_approved: p.date_approved,
        // Cuotas: 1 = pago único. >1 explicaría una liberación mes a mes.
        installments: p.installments,
        payment_type_id: p.payment_type_id,
        payment_method_id: p.payment_method_id,
        transaction_amount: p.transaction_amount,
        net_received_amount: (p.transaction_details as { net_received_amount?: number } | undefined)
          ?.net_received_amount,
        fee_details: fees.map((f) => `${f.type}: ${f.amount}`),
        // `live_mode: false` significaría que fue un pago de sandbox, no real.
        live_mode: p.live_mode,
      })
    }
  }
}

void main()
