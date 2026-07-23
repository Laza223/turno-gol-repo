import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import { insertCashFlow } from '../helpers/factories'
import { getDayOpen, openDay } from '@/modules/cashflow/cash-open.service'
import { closeDailyRegister } from '@/modules/cashflow/daily-close.service'
import {
  DayAlreadyClosedError,
  OpenDateInFutureError,
} from '@/modules/cashflow/cashflow.errors'
import { todayART } from '@/shared/time/art-date'

const TODAY = todayART()

async function seedTenant() {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)
  return { tenantId: tenant.id, staffId: staff.id }
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => closeSql())

describe('apertura de caja (migr. 049) — openDay/getDayOpen + snapshot en el cierre', () => {
  it('abre el día con fondo inicial y lo relee', async () => {
    const { tenantId, staffId } = await seedTenant()

    const open = await withTenantContext(tenantId, (tx) =>
      openDay(tenantId, staffId, { date: TODAY, openingCash: 250000, note: 'cambio chico' }, tx),
    )
    expect(open.openingCash).toBe(250000)
    expect(open.note).toBe('cambio chico')

    const read = await withTenantContext(tenantId, (tx) => getDayOpen(tenantId, TODAY, tx))
    expect(read?.id).toBe(open.id)
    expect(read?.openingCash).toBe(250000)
  })

  it('openDay es UPSERT: corregir el fondo mientras el día está abierto', async () => {
    const { tenantId, staffId } = await seedTenant()

    const first = await withTenantContext(tenantId, (tx) =>
      openDay(tenantId, staffId, { date: TODAY, openingCash: 100000 }, tx),
    )
    const second = await withTenantContext(tenantId, (tx) =>
      openDay(tenantId, staffId, { date: TODAY, openingCash: 180000 }, tx),
    )
    // Misma fila (unique tenant+date), fondo pisado.
    expect(second.id).toBe(first.id)
    expect(second.openingCash).toBe(180000)

    const sql = getSql()
    const [count] = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM daily_cash_opens
      WHERE tenant_id = ${tenantId} AND date = ${TODAY}::date
    `
    expect(count.c).toBe(1)

    // Trazabilidad del UPSERT (hallazgo del panel de Fase 5): la corrección
    // no deja historial propio, así que audit_logs debe registrar apertura
    // Y corrección con el valor previo.
    const audits = await sql<{ action: string; metadata: { previousOpeningCash: number | null } }[]>`
      SELECT action, metadata FROM audit_logs
      WHERE tenant_id = ${tenantId} AND resource_type = 'daily_cash_open'
      ORDER BY created_at ASC
    `
    expect(audits.map((a) => a.action)).toEqual(['cashflow.day_opened', 'cashflow.open_corrected'])
    expect(audits[1]!.metadata.previousOpeningCash).toBe(100000)
  })

  it('rechaza abrir una fecha futura', async () => {
    const { tenantId, staffId } = await seedTenant()
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    await expect(
      withTenantContext(tenantId, (tx) =>
        openDay(tenantId, staffId, { date: future, openingCash: 0 }, tx),
      ),
    ).rejects.toBeInstanceOf(OpenDateInFutureError)
  })

  it('rechaza abrir/editar un día ya cerrado', async () => {
    const { tenantId, staffId } = await seedTenant()

    await withTenantContext(tenantId, (tx) =>
      closeDailyRegister(tenantId, TODAY, staffId, {}, tx),
    )

    await expect(
      withTenantContext(tenantId, (tx) =>
        openDay(tenantId, staffId, { date: TODAY, openingCash: 50000 }, tx),
      ),
    ).rejects.toBeInstanceOf(DayAlreadyClosedError)
  })

  it('el cierre snapshotea opening/expected: expected = fondo + neto cash', async () => {
    const { tenantId, staffId } = await seedTenant()

    await withTenantContext(tenantId, (tx) =>
      openDay(tenantId, staffId, { date: TODAY, openingCash: 200000 }, tx),
    )
    // 2 ingresos cash de 500000 (factories) + 1 gasto cash de 100000.
    await insertCashFlow(getSql(), { tenantId, registeredBy: staffId })
    await insertCashFlow(getSql(), { tenantId, registeredBy: staffId })
    await getSql()`
      INSERT INTO cash_flows (tenant_id, type, category, amount, method, description, registered_by, occurred_at)
      VALUES (${tenantId}, 'expense', 'operating_expense', ${100000}, 'cash', ${'Hielo'}, ${staffId}, NOW())
    `

    const close = await withTenantContext(tenantId, (tx) =>
      closeDailyRegister(tenantId, TODAY, staffId, { declaredCash: 1100000 }, tx),
    )

    // expected = 200000 + (1000000 − 100000) = 1100000; declared igual → diff 0.
    expect(close.openingCash).toBe(200000)
    expect(close.expectedCash).toBe(1100000)
    expect(close.diffAmount).toBe(0)
    expect(close.balance).toBe(900000) // balance sigue siendo global, no solo cash
  })

  it('carrera open-vs-close: bajo el advisory lock, o abre antes del cierre o rebota', async () => {
    const { tenantId, staffId } = await seedTenant()
    await insertCashFlow(getSql(), { tenantId, registeredBy: staffId })

    const results = await Promise.allSettled([
      withTenantContext(tenantId, (tx) =>
        openDay(tenantId, staffId, { date: TODAY, openingCash: 70000 }, tx),
      ),
      withTenantContext(tenantId, (tx) =>
        closeDailyRegister(tenantId, TODAY, staffId, {}, tx),
      ),
    ])

    const [openRes, closeRes] = results
    // El cierre siempre gana o pierde limpio; nunca las dos cosas a medias.
    expect(closeRes.status).toBe('fulfilled')

    const sql = getSql()
    const [closeRow] = await sql<{ opening_cash: number | null }[]>`
      SELECT opening_cash FROM daily_cash_closes
      WHERE tenant_id = ${tenantId} AND date = ${TODAY}::date
    `
    if (openRes.status === 'fulfilled') {
      // La apertura entró ANTES del cierre (serializados por el advisory lock):
      // el snapshot del cierre la tiene que reflejar.
      expect(closeRow.opening_cash).toBe(70000)
    } else {
      // La apertura llegó después: rebotó con DayAlreadyClosedError y el
      // cierre quedó con fondo 0.
      expect((openRes.reason as Error).name).toBe('DayAlreadyClosedError')
      expect(closeRow.opening_cash).toBe(0)
    }
  })
})
