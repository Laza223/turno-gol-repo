import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeSql, getSql, getWorkerSql } from '@/shared/db/client'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'
import { recordEvent, scrub, PII_KEYS } from '@/shared/observability/analytics'
import { setAnalyticsSink, track } from '@/shared/observability/breadcrumbs'

/**
 * `track.*` tenía ~46 call sites y un solo destino: `Sentry.addBreadcrumb`, que
 * solo transmite ADJUNTO A UN EVENTO DE ERROR. Si el flujo terminaba bien
 * —justo el caso que interesa medir— el evento no llegaba a ningún lado. Este
 * archivo prueba que ahora sí aterriza en una tabla.
 */

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  // En producción esto lo hace `instrumentation.ts` / `run-workers.ts`.
  setAnalyticsSink(recordEvent)
}, 30_000)

afterAll(async () => {
  setAnalyticsSink(null)
  await closeSql()
})

beforeEach(async () => {
  await getWorkerSql()`DELETE FROM analytics_events`
})

type Row = {
  category: string
  event: string
  tenant_id: string | null
  data: Record<string, unknown>
}

/**
 * `recordEvent` es fire-and-forget a propósito (una falla de instrumentación no
 * puede voltear un cobro), así que hay que esperar a que el INSERT aterrice.
 * Poll corto en vez de un sleep fijo: falla rápido si nunca llega.
 */
async function waitForEvents(expected: number, timeoutMs = 5000): Promise<Row[]> {
  const sql = getWorkerSql()
  const deadline = Date.now() + timeoutMs
  let rows: Row[] = []
  while (Date.now() < deadline) {
    rows = await sql<Row[]>`SELECT category, event, tenant_id, data FROM analytics_events`
    if (rows.length >= expected) return rows
    await new Promise((r) => setTimeout(r, 100))
  }
  return rows
}

describe('scrub — la disciplina anti-PII', () => {
  it('descarta las claves de PII y deja el resto intacto', () => {
    const out = scrub({
      tenantId: 't-1',
      bookingId: 'b-1',
      playerId: 'p-SECRETO',
      staffUserId: 's-SECRETO',
      endpoint: 'https://push.example/SECRETO',
      amountCents: 500000,
    })

    expect(out).toEqual({ tenantId: 't-1', bookingId: 'b-1', amountCents: 500000 })
    expect(Object.keys(out)).not.toContain('playerId')
    expect(Object.keys(out)).not.toContain('staffUserId')
    expect(Object.keys(out)).not.toContain('endpoint')
  })

  it('descarta los undefined (los *Ctx son todos opcionales y ensuciarían el jsonb)', () => {
    expect(scrub({ tenantId: 't-1', courtId: undefined, date: undefined })).toEqual({
      tenantId: 't-1',
    })
  })

  it('PII_KEYS cubre las tres claves identificatorias que hoy existen en los *Ctx', () => {
    // Candado: si alguien agrega un identificador de persona a un *Ctx sin
    // sumarlo acá, la afirmación de la migr. 072 ("no es dato personal") deja
    // de ser cierta en silencio.
    expect([...PII_KEYS].sort()).toEqual(['endpoint', 'playerId', 'staffUserId'])
  })
})

describe('track.* aterriza en analytics_events', () => {
  it('un evento con tenant persiste categoría, nombre, tenant y data', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)

    track.funnel('checkout.viewed', { tenantId: tenant.id, withDeposit: true })

    const rows = await waitForEvents(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.category).toBe('funnel')
    expect(rows[0]!.event).toBe('checkout.viewed')
    expect(rows[0]!.tenant_id).toBe(tenant.id)
    expect(rows[0]!.data).toEqual({ tenantId: tenant.id, withDeposit: true })
  })

  it('un evento SIN tenant persiste con tenant_id NULL (tráfico público)', async () => {
    // La búsqueda cross-tenant y el magic link ocurren sin complejo resuelto.
    // Si la policy de INSERT no aceptara NULL, estos eventos se perderían.
    track.auth('magiclink.sent', { flow: 'signup' })

    const rows = await waitForEvents(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.tenant_id).toBeNull()
    expect(rows[0]!.data).toEqual({ flow: 'signup' })
  })

  it('NUNCA persiste el playerId, aunque el call site lo pase', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)

    track.booking('booking.online.create.success', {
      tenantId: tenant.id,
      bookingId: '00000000-0000-0000-0000-0000000000bb',
      playerId: '00000000-0000-0000-0000-0000000000aa',
    })

    const rows = await waitForEvents(1)
    expect(rows).toHaveLength(1)
    const data = rows[0]!.data
    expect(data).not.toHaveProperty('playerId')
    // El resto del contexto sí queda: sirve para depurar sin identificar a nadie.
    expect(data).toHaveProperty('bookingId')
    expect(JSON.stringify(rows[0])).not.toContain('0000000000aa')
  })

  it('sin sink registrado no escribe nada (el navegador no toca la DB)', async () => {
    setAnalyticsSink(null)
    track.funnel('checkout.viewed', { withDeposit: false })
    // Espera activa corta: si escribiera, aparecería en este lapso.
    const rows = await waitForEvents(1, 800)
    expect(rows).toHaveLength(0)
    setAnalyticsSink(recordEvent)
  })
})

// El append-only (REVOKE UPDATE) y el aislamiento entre tenants se prueban en
// `isolation.test.ts`, que es el único lugar donde la conexión usa el rol real
// `turnogol_app`. Acá el DSN es de superusuario y un test de permisos daría
// verde por el motivo equivocado — la trampa que documenta
// [[pr30-turnogol-app-fallout]].
