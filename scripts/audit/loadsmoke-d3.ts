import { config } from 'dotenv'
config({ path: '.env.local' })

import autocannon from 'autocannon'
import { closeSql, getWorkerSql } from '@/shared/db/client'

/**
 * D6 — smoke de concurrencia local sobre el seed de D3.
 *
 * Qué es y qué NO es (mismo disclaimer que dejó B11,
 * docs/audit/reports/2026-08-12-b11-carga-hot-paths.md:21-28): esto mide
 * contención bajo concurrencia — pool de conexiones, N+1 que un solo EXPLAIN
 * no ve, procesamiento duplicado de webhooks — CONTRA ESCRITORIO + Postgres
 * local. No es el p95 de producción (Vercel serverless + pooler de Supabase
 * + otra red). Para el p95 real: Sentry, ahora que los 6 presupuestos de
 * doc5 §2 están cargados como alertas (`src/shared/observability/latency-budgets.ts`).
 *
 * Requiere:
 *   - `pnpm dev` corriendo en BASE_URL (default http://localhost:3000), con
 *     MP_MOCK_MODE=1 en su entorno (si no, el webhook intenta pg-boss real).
 *   - El seed de D3 aplicado (scripts/audit/seed-d3-volume.sql) — provee el
 *     tenant `d3-heavy` (con `mp_access_token` placeholder, exigido por el
 *     handler incluso bajo mock) y un `booking` en `pending_payment` con seña
 *     para el burst del webhook. Re-correr el seed antes de cada corrida: es
 *     idempotente y deja uno fresco de nuevo.
 *
 * Uso:
 *   docker exec -i supabase_db_TurnoGol psql -U postgres -d postgres < scripts/audit/seed-d3-volume.sql
 *   MP_MOCK_MODE=1 pnpm dev &
 *   pnpm tsx scripts/audit/loadsmoke-d3.ts
 */

const BASE = process.env.LOADSMOKE_BASE_URL ?? 'http://localhost:3000'

/** Nunca contra nada que no sea un dev server local — mismo espíritu que
 * bootstrap-local-roles.mjs y replay-mp-webhook.ts: este script dispara
 * ráfagas de concurrencia, no algo para apuntar a staging/prod por error. */
function assertLocalBase(url: string): void {
  const hostname = new URL(url).hostname
  const LOCAL = new Set(['localhost', '127.0.0.1', '::1'])
  if (!LOCAL.has(hostname)) {
    throw new Error(
      `LOADSMOKE_BASE_URL="${url}" no es local (host="${hostname}"). ` +
        'Este script solo corre contra un dev server local.',
    )
  }
}

// Presupuestos de doc5 §2, citados a mano (no se importa latency-budgets.ts
// desde un script — mismo motivo que separa scripts/ de src/: evita que un
// export interno de la app se vuelva contrato público de un CLI).
const BUDGETS = {
  availability_grid: { p95: 500, p99: 800 },
  court_search: { p95: 600, p99: 1000 },
} as const

function artTodayPlus(days: number): string {
  const artNow = new Date(Date.now() - 3 * 60 * 60 * 1000)
  artNow.setUTCDate(artNow.getUTCDate() + days)
  return artNow.toISOString().slice(0, 10)
}

type EndpointResult = {
  name: keyof typeof BUDGETS
  url: string
  p50: number
  p95: number
  p99: number
  errors: number
  non2xx: number
}

async function runEndpointSmoke(name: keyof typeof BUDGETS, path: string): Promise<EndpointResult> {
  const url = `${BASE}${path}`
  const result = await autocannon({
    url,
    connections: 15,
    duration: 10,
    method: 'GET',
  })
  return {
    name,
    url,
    p50: result.latency.p50,
    p95: result.latency.p97_5, // autocannon no reporta p95 exacto; p97_5 es el escalón más cercano disponible
    p99: result.latency.p99,
    errors: result.errors,
    non2xx: result.non2xx,
  }
}

function printEndpointResult(r: EndpointResult): void {
  const budget = BUDGETS[r.name]
  const verdict = r.p99 <= budget.p99 ? 'OK' : 'POR ENCIMA DEL PRESUPUESTO'
  console.log(`\n${r.name} — ${r.url}`)
  console.log(
    `  p50=${r.p50}ms  p95≈${r.p95}ms (p97.5, autocannon no da p95 exacto)  p99=${r.p99}ms`,
  )
  console.log(`  budget doc5: p95<${budget.p95}ms p99<${budget.p99}ms → ${verdict}`)
  console.log(`  errors=${r.errors} non2xx=${r.non2xx}`)
}

async function webhookConcurrencyBurst(): Promise<boolean> {
  const sql = getWorkerSql()

  const [heavy] = await sql<{ id: string }[]>`
    SELECT id FROM tenants WHERE slug = 'd3-heavy' LIMIT 1
  `
  if (!heavy) {
    console.error(
      'No existe el tenant d3-heavy — corré scripts/audit/seed-d3-volume.sql antes de este script.',
    )
    return false
  }

  // La seña seedeada (`payments.mp_payment_id = 'd3-mp-<hash>'`, seed-d3-volume.sql)
  // no matchea NI el formato real de MP NI MOCK_MP_ID_RE — webhookPayloadSchema
  // la rechaza con 400 antes de llegar a ningún dedup. Bajo MP_MOCK_ENABLED el
  // gateway resuelve el pago DECODIFICANDO el propio mpPaymentId
  // (`MOCK-APPROVED-<bookingId>`, mock-mp.ts:46), sin tocar la tabla payments —
  // así que el objetivo real es un booking pending_payment, no una fila de payments.
  const [target] = await sql<{ id: string; status: string }[]>`
    SELECT id, status FROM bookings
    WHERE tenant_id = ${heavy.id} AND status = 'pending_payment' AND deposit_amount > 0
    LIMIT 1
  `
  if (!target) {
    console.error(
      'No hay ningún booking pending_payment con seña en d3-heavy — re-corré el seed y probá de nuevo.',
    )
    return false
  }

  const mockPaymentId = `MOCK-APPROVED-${target.id}`
  // Evento fresco por corrida: si se reusara un id ya procesado por una
  // corrida anterior, el dedup de processed_webhooks lo bloquearía ANTES de
  // llegar al burst y el resultado (0 procesados de N) se leería como que el
  // sistema falló, cuando en realidad está haciendo exactamente lo correcto.
  const mpEventId = `loadsmoke-${Date.now()}`
  const payload = {
    id: mpEventId,
    live_mode: false,
    type: 'payment',
    date_created: new Date().toISOString(),
    action: 'payment.updated',
    data: { id: mockPaymentId },
    user_id: 'loadsmoke',
    api_version: 'v1',
  }

  const CONCURRENT = 12
  console.log(
    `\nwebhook — ${CONCURRENT} POST concurrentes, mismo mp_event_id="${mpEventId}", ` +
      `mismo data.id="${mockPaymentId}" (simula MP reintentando la misma notificación), ` +
      `booking=${target.id}`,
  )

  const barrier = new Promise<void>((resolve) => setTimeout(resolve, 50))
  const attempts = Array.from({ length: CONCURRENT }, async (_, i) => {
    await barrier
    const res = await fetch(`${BASE}/api/webhooks/mercadopago?tenant=${heavy.id}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // MP_MOCK_ENABLED hace bypass de la firma (webhook-auth.ts:28) — estos
        // headers solo necesitan existir, el valor es irrelevante bajo mock.
        'x-request-id': `loadsmoke-${i}`,
        'x-signature': 'ts=0,v1=mock',
      },
      body: JSON.stringify(payload),
    })
    return res.status
  })
  const statuses = await Promise.all(attempts)
  const byStatus = new Map<number, number>()
  for (const s of statuses) byStatus.set(s, (byStatus.get(s) ?? 0) + 1)
  console.log(`  HTTP status: ${[...byStatus.entries()].map(([s, n]) => `${s}×${n}`).join(', ')}`)

  const [{ c: processedCount }] = await sql<{ c: number }[]>`
    SELECT COUNT(*)::int AS c FROM processed_webhooks WHERE mp_event_id = ${mpEventId}
  `
  const [{ status: finalStatus }] = await sql<{ status: string }[]>`
    SELECT status FROM bookings WHERE id = ${target.id}
  `
  const [{ c: paymentRows }] = await sql<{ c: number }[]>`
    SELECT COUNT(*)::int AS c FROM payments WHERE booking_id = ${target.id} AND mp_payment_id = ${mockPaymentId}
  `

  console.log(`  processed_webhooks rows para mp_event_id="${mpEventId}": ${processedCount}`)
  console.log(`  bookings.status final: ${finalStatus} (esperado: confirmed)`)
  console.log(`  payments rows creadas para este mpPaymentId: ${paymentRows} (esperado: 1, no 12)`)

  const ok = processedCount === 1 && finalStatus === 'confirmed' && paymentRows === 1
  console.log(
    ok
      ? '  OK — exactamente 1 procesamiento sobrevivió a 12 POSTs concurrentes, el turno quedó confirmado una sola vez.'
      : `  FALLO — esperaba processed_webhooks=1, bookings.status=confirmed, payments=1; dio ` +
          `processed_webhooks=${processedCount} status=${finalStatus} payments=${paymentRows}.`,
  )
  return ok
}

async function main(): Promise<void> {
  assertLocalBase(BASE)

  console.log(`D6 — smoke de concurrencia local contra ${BASE}`)
  console.log('(esto NO es el p95 de producción — ver el comentario al inicio del archivo)\n')

  const availability = await runEndpointSmoke(
    'availability_grid',
    `/api/public/availability?slug=d3-heavy&date=${artTodayPlus(1)}`,
  )
  printEndpointResult(availability)

  const search = await runEndpointSmoke(
    'court_search',
    '/api/public/search?sort=distance&lat=-34.6037&lng=-58.3816',
  )
  printEndpointResult(search)

  let webhookOk = false
  try {
    webhookOk = await webhookConcurrencyBurst()
  } finally {
    await closeSql()
  }

  const budgetsOk =
    availability.p99 <= BUDGETS.availability_grid.p99 && search.p99 <= BUDGETS.court_search.p99
  if (!budgetsOk || !webhookOk) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
