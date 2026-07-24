import { beforeEach, describe, expect, it, vi } from 'vitest'

// Regresión TG-P0-RETENTION-02: el worker de retención (Ley 25.326 §16) corría
// bajo `withTenantContext` (pool de app, rol `turnogol_app`) — un rol sin
// BYPASSRLS y sin GRANT de escritura sobre `feature_flags`/`audit_logs`/
// `daily_cash_closes` (037_turnogol_app_grants.sql). Cada DELETE a esas tablas
// tiraba error, la transacción por-tenant hacía rollback completo, y el catch
// del loop solo logueaba sin rethrow: el wipe semanal quedaba roto en silencio
// desde que PR #30 restringió el pool de app. Migrado a `getWorkerDb`/
// `getWorkerSql` (pool de servicio, bypasea RLS por diseño, mismo patrón que
// `auto-complete-bookings.worker.ts`). Este test mockea el pool (no la
// función) para probar el cableado real: si alguien revierte a
// `getSql`/`getDb`/`withTenantContext`, el "trap" de abajo lo detecta sin
// depender de una DB real (localmente DATABASE_URL/WORKER_DATABASE_URL
// apuntan al mismo superusuario y enmascararían el bug).
//
// tests/integration/data-retention-cleanup.test.ts complementa esto contra DB
// real (corre como superusuario, valida QUÉ se borra) y queda sin tocar.

const h = vi.hoisted(() => ({
  getSql: vi.fn(),
  getDb: vi.fn(),
  getWorkerSql: vi.fn(),
  getWorkerDb: vi.fn(),
  withTenantContext: vi.fn(),
}))

vi.mock('@/shared/db/client', () => ({
  getSql: h.getSql,
  getDb: h.getDb,
  getWorkerSql: h.getWorkerSql,
  getWorkerDb: h.getWorkerDb,
  withTenantContext: h.withTenantContext,
}))

vi.mock('@/shared/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

function makeSqlTag(rows: unknown[]): SqlTag {
  return (() => Promise.resolve(rows)) as unknown as SqlTag
}

const TRAP = () => {
  throw new Error(
    'TRAP: se llamó al pool restringido de app en vez del pool de servicio — ' +
      'la retención debe usar getWorkerSql/getWorkerDb, nunca getSql/getDb/withTenantContext',
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  h.getSql.mockImplementation(TRAP)
  h.getDb.mockImplementation(TRAP)
  h.withTenantContext.mockImplementation(TRAP)
})

describe('runDataRetentionCleanup — usa el pool worker (bypass-capable), nunca getSql/getDb/withTenantContext', () => {
  it('lee los targets y ejecuta el wipe transaccional vía getWorkerSql/getWorkerDb', async () => {
    h.getWorkerSql.mockReturnValue(makeSqlTag([{ id: 'tenant-1' }]))
    // TG-P0-RETENTION-03: `wipeTenant` ahora hace 2 SELECT dentro de la tx
    // (FOR UPDATE de tenant_subscriptions + el chequeo de elegibilidad fresco
    // de tenants) ANTES de los DELETE — necesitan devolver una fila con
    // `eligible: true` para que el wipe siga de largo (si no, el mock
    // resolvería `undefined` y el guard nuevo lo tomaría como no-elegible,
    // el test dejaría de ejercitar el wipe completo). `mp_subscription_id`
    // en null evita que el post-commit intente llamar a MP acá — esto es un
    // test de CABLEADO del pool, no de la lógica de cancelación (esa vive en
    // tests/integration/data-retention-cleanup.test.ts).
    const txExecute = vi
      .fn()
      .mockResolvedValue([{ mp_subscription_id: null, eligible: true }])
    const transaction = vi.fn(
      async (fn: (tx: { execute: typeof txExecute }) => Promise<void>) => {
        await fn({ execute: txExecute })
      },
    )
    h.getWorkerDb.mockReturnValue({ transaction })

    const { runDataRetentionCleanup } = await import(
      '@/shared/jobs/workers/data-retention-cleanup.worker'
    )
    await expect(runDataRetentionCleanup()).resolves.toBeUndefined()

    expect(h.getWorkerSql).toHaveBeenCalled()
    expect(h.getWorkerDb).toHaveBeenCalled()
    expect(transaction).toHaveBeenCalledTimes(1)
    // SET CONSTRAINTS fk_bookings_payment DEFERRED (migr. 058 — reemplazó al
    // session_replication_role que moría bajo turnogol_worker en prod) +
    // FOR UPDATE ts + chequeo de elegibilidad +
    // 23 DELETEs + 1 UPDATE tenants = 27 statements. (16 DELETEs = 20 hasta la
    // migr. 046; la 048 sumó stock_movements/canteen_tabs/canteen_products y
    // la 049 daily_cash_opens — rediseño Caja y Cantina, spec 2026-07-22; la
    // 062 sumó tournaments/tournament_teams/tournament_team_players — módulo
    // Torneos, docs/decisions/2026-07-24-torneos.md.)
    // Este número es el gate: si agregás una tabla tenant-aislada y no la
    // purgás acá, este test va rojo. Actualizalo SOLO junto con el DELETE nuevo.
    expect(txExecute.mock.calls.length).toBe(27)
    expect(h.getSql).not.toHaveBeenCalled()
    expect(h.getDb).not.toHaveBeenCalled()
    expect(h.withTenantContext).not.toHaveBeenCalled()
  })

  it('no abre ninguna transacción si no hay tenants objetivo', async () => {
    h.getWorkerSql.mockReturnValue(makeSqlTag([]))
    const transaction = vi.fn()
    h.getWorkerDb.mockReturnValue({ transaction })

    const { runDataRetentionCleanup } = await import(
      '@/shared/jobs/workers/data-retention-cleanup.worker'
    )
    await expect(runDataRetentionCleanup()).resolves.toBeUndefined()

    expect(transaction).not.toHaveBeenCalled()
    expect(h.getSql).not.toHaveBeenCalled()
    expect(h.getDb).not.toHaveBeenCalled()
  })

  it('acumula fallas por-tenant, sigue con los tenants restantes y hace fallar el job al final', async () => {
    h.getWorkerSql.mockReturnValue(
      makeSqlTag([{ id: 'tenant-bad' }, { id: 'tenant-good' }]),
    )
    let call = 0
    const transaction = vi.fn(async () => {
      call += 1
      if (call === 1) throw new Error('permission denied for table feature_flags')
    })
    h.getWorkerDb.mockReturnValue({ transaction })

    const { runDataRetentionCleanup } = await import(
      '@/shared/jobs/workers/data-retention-cleanup.worker'
    )
    const { logger } = await import('@/shared/lib/logger')

    // Ambos tenants se procesan (el segundo no se aborta por la falla del
    // primero) pero el job termina en rechazo porque hubo al menos una falla.
    await expect(runDataRetentionCleanup()).rejects.toThrow(/tenant-bad/)
    expect(transaction).toHaveBeenCalledTimes(2)
    expect(logger.error).toHaveBeenCalledWith(
      'failed wipe for tenant',
      expect.objectContaining({
        tenantId: 'tenant-bad',
        stage: 'tenant-wipe-transaction',
        error: expect.stringContaining('permission denied'),
      }),
    )
  })
})
