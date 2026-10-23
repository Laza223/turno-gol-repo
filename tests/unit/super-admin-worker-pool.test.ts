import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SQL } from 'drizzle-orm'

// caza-bugs #9/#10: tenant_subscriptions tiene RLS+FORCE (NO es una tabla
// global pese a lo que decía el comentario de cabecera de estos dos
// archivos) — getMrrCents (dashboard.service) y listTenants/getTenantDetail
// (tenants.service) la leían cross-tenant con getDb(), el pool restringido
// turnogol_app, que fuera de withTenantContext devuelve 0 filas en
// producción: MRR=$0 y plan/estado de suscripción NULL para todos los
// tenants en /super-admin. Localmente DATABASE_URL/WORKER_DATABASE_URL
// apuntan al mismo superusuario y lo enmascaran. Este test mockea el POOL
// (no el resultado) para probar el cableado, mismo patrón que
// staff-service-worker-pool.test.ts.

const h = vi.hoisted(() => ({
  getDb: vi.fn(),
  getWorkerDb: vi.fn(),
}))

// `withDisposableWorkerDb` abre su propio cliente worker: acá entrega el mismo
// fake de `h.getWorkerDb` para que el cableado (qué pool lee qué) siga a la vista.
vi.mock('@/shared/db/client', () => ({
  getDb: h.getDb,
  withDisposableWorkerDb: (_timeoutMs: number, fn: (db: unknown) => unknown) => fn(h.getWorkerDb()),
  withTenantContext: vi.fn(async (_id: string, cb: (tx: unknown) => unknown) => cb(makeChain([]))),
}))

vi.mock('@/shared/jobs/dlq', () => ({ ALL_QUEUES: [] }))
vi.mock('@/shared/jobs/queue-stats', () => ({ getQueueDepths: vi.fn(async () => []) }))
vi.mock('@/modules/staff/staff.service', () => ({ listStaffRoster: vi.fn(async () => []) }))

type FakeRow = Record<string, unknown>

// Chainable fake query builder covering every method these two services call
// (select/from/innerJoin/leftJoin/where/groupBy/orderBy/limit/offset), thenable
// so `await` on a chain missing a terminal `.limit()`/`.offset()` still resolves.
// `execute` (Fase 7, analytics): `getOnboardingFunnel` usa `db.execute(sql\`...\`)`
// para leer analytics_events — no pasa por el builder encadenado de arriba.
function makeChain(rows: FakeRow[]) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    groupBy: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    offset: () => chain,
    execute: () => Promise.resolve(rows),
    then: (onfulfilled: (v: FakeRow[]) => unknown, onrejected?: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(onfulfilled, onrejected),
  }
  return chain
}

// Pool restringido "trampa": si el código llamara a getDb() para una tabla
// RLS en vez de getWorkerDb(), el valor devuelto sería este centinela
// reconocible en vez del real (la RLS real bajo turnogol_app daría 0 filas).
const RESTRICTED_POOL_TRAP: FakeRow[] = [{ TRAP: 'FROM_RESTRICTED_POOL' }]

beforeEach(() => {
  vi.clearAllMocks()
  h.getDb.mockReturnValue(makeChain(RESTRICTED_POOL_TRAP))
})

describe('getMrrCents (dashboard.service) — lee tenant_subscriptions vía getWorkerDb, no getDb', () => {
  it('devuelve el MRR leído del pool worker, nunca del pool restringido', async () => {
    h.getWorkerDb.mockReturnValue(makeChain([{ mrr: '350000' }]))
    const { getDashboardData } = await import('@/modules/super-admin/dashboard.service')

    const data = await getDashboardData()

    expect(data.mrrCents).toBe(350000)
    expect(h.getWorkerDb).toHaveBeenCalled()
  })

  // Con `prepare: false` una query con parámetros va en dos tiempos y fue la que
  // se colgó en prod el 2026-09-21 (comentario del `.where` en dashboard.service).
  // Sumar Plus al MRR no puede volver a meterle un parámetro enlazado.
  it('la query del MRR no lleva parámetros enlazados (ni con el precio de lista de Plus)', async () => {
    const { PgDialect } = await import('drizzle-orm/pg-core')
    const captured: { select?: Record<string, SQL>; where?: SQL } = {}
    const chain = makeChain([{ mrr: '0' }])
    chain.select = (arg: Record<string, SQL>) => {
      captured.select ??= arg
      return chain
    }
    chain.where = (arg: SQL) => {
      captured.where ??= arg
      return chain
    }
    h.getWorkerDb.mockReturnValue(chain)
    const { getDashboardData } = await import('@/modules/super-admin/dashboard.service')

    await getDashboardData()

    const dialect = new PgDialect()
    const mrr = captured.select?.mrr
    expect(mrr).toBeDefined()
    expect(dialect.sqlToQuery(mrr as SQL).params).toEqual([])
    expect(dialect.sqlToQuery(captured.where as SQL).params).toEqual([])
  })
})

describe('listTenants (tenants.service) — cross-tenant vía getWorkerDb, no getDb', () => {
  it('devuelve filas leídas del pool worker, nunca del pool restringido', async () => {
    const rows: FakeRow[] = [
      {
        id: 't1',
        name: 'Complejo 1',
        slug: 'c1',
        email: 'c1@test.com',
        status: 'active',
        trialEndsAt: null,
        createdAt: new Date('2026-01-01'),
        billedCourts: 5,
        priceFirstCourtCents: 4_700_000,
        priceExtraCourtCents: 3_000_000,
        annualDiscountBps: 1000,
        plusEnabled: false,
        plusPricePerCourtCents: null,
        billingCycle: 'monthly',
        subscriptionStatus: 'active',
      },
    ]
    h.getWorkerDb.mockReturnValue(makeChain(rows))
    const { listTenants } = await import('@/modules/super-admin/tenants.service')

    const result = await listTenants({ page: 1, pageSize: 20 })

    expect(result.rows).toHaveLength(1)
    // 5 canchas mensual: 4.700.000 + 4 × 3.000.000.
    expect(result.rows[0]).toMatchObject({ id: 't1', billedCourts: 5, mrrCents: 16_700_000 })
    expect(h.getWorkerDb).toHaveBeenCalled()
    expect(h.getDb).not.toHaveBeenCalled()
  })

  // Bug de plata: el MRR es una TASA MENSUAL. El ciclo anual aporta su
  // equivalente mensual con el descuento aplicado (annual_discount_bps), no el
  // cobro del año — que es ese mismo número × 12.
  it('ciclo anual: mrrCents es el equivalente MENSUAL con descuento, no el cobro del año', async () => {
    const rows: FakeRow[] = [
      {
        id: 't2',
        name: 'Complejo 2',
        slug: 'c2',
        email: 'c2@test.com',
        status: 'active',
        trialEndsAt: null,
        createdAt: new Date('2026-01-01'),
        billedCourts: 5,
        priceFirstCourtCents: 4_700_000,
        priceExtraCourtCents: 3_000_000,
        annualDiscountBps: 1000,
        plusEnabled: false,
        plusPricePerCourtCents: null,
        billingCycle: 'annual',
        subscriptionStatus: 'active',
      },
    ]
    h.getWorkerDb.mockReturnValue(makeChain(rows))
    const { listTenants } = await import('@/modules/super-admin/tenants.service')

    const result = await listTenants({ page: 1, pageSize: 20 })

    // 16.700.000 × 0,90 = 15.030.000 por mes (el cobro anual es ×12 de eso).
    expect(result.rows[0]).toMatchObject({ id: 't2', mrrCents: 15_030_000 })
  })
})

describe('getTenantDetail (tenants.service) — subscription vía getWorkerDb, tenant vía getDb', () => {
  it('el tenant sale del pool restringido (tabla global) y la suscripción del pool worker', async () => {
    const tenantRow: FakeRow = {
      id: 't1',
      slug: 'c1',
      name: 'Complejo 1',
      description: null,
      address: 'Calle 1',
      city: 'CABA',
      province: 'Buenos Aires',
      phone: '11',
      email: 'c1@test.com',
      status: 'active',
      trialEndsAt: null,
      scheduledDeletionAt: null,
      mpConnectedAt: null,
      createdAt: new Date('2026-01-01'),
      settings: {},
    }
    const subRow: FakeRow = {
      status: 'active',
      planId: 'p1',
      billedCourts: 5,
      pendingBilledCourts: null,
      priceFirstCourtCents: 4_700_000,
      priceExtraCourtCents: 3_000_000,
      annualDiscountBps: 1000,
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
      mpSubscriptionId: null,
      pendingChangeAt: null,
      canceledAt: null,
      cancellationReason: null,
      scheduledDeletionAt: null,
      dunningStartedAt: null,
      lastPaymentAt: null,
      lastPaymentFailedAt: null,
    }
    h.getDb.mockReturnValue(makeChain([tenantRow]))
    h.getWorkerDb.mockReturnValue(makeChain([subRow]))

    const { getTenantDetail } = await import('@/modules/super-admin/tenants.service')
    const detail = await getTenantDetail('t1')

    expect(detail).not.toBeNull()
    expect(detail!.tenant.id).toBe('t1')
    // Si getTenantDetail volviera a leer la suscripción del pool restringido,
    // esto traería el centinela TRAP en vez de la fila real de subRow.
    expect(detail!.subscription).toMatchObject({ billedCourts: 5, status: 'active' })
    expect(h.getWorkerDb).toHaveBeenCalled()
  })
})
