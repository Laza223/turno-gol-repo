import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Sql } from 'postgres'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import { createCashFlow, getCashFlows, getDaySummary } from '@/modules/cashflow/cashflow.service'
import { closeDailyRegister } from '@/modules/cashflow/daily-close.service'
import { DayAlreadyClosedError } from '@/modules/cashflow/cashflow.errors'
import { nightCutoffMins, operatingDateOf } from '@/shared/time/operating-day'

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => closeSql())

// Único día con extensión de madrugada (viernes 20:00→02:00); el resto de la
// semana cierra antes de medianoche. nightCutoffMins toma el MÁXIMO semanal,
// así que este fixture deja el cutoff determinado por un solo día, sin
// ambigüedad en el valor esperado (120 min).
function nightOpeningHours() {
  return {
    mon: { open: '08:00', close: '23:00' },
    tue: { open: '08:00', close: '23:00' },
    wed: { open: '08:00', close: '23:00' },
    thu: { open: '08:00', close: '23:00' },
    fri: { open: '20:00', close: '02:00' },
    sat: { open: '08:00', close: '23:00' },
    sun: { open: '08:00', close: '23:00' },
  }
}

async function seedNightTenant(sql: Sql) {
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)
  await sql`
    UPDATE tenants SET closes_next_day = true, opening_hours = ${sql.json(nightOpeningHours())}
    WHERE id = ${tenant.id}
  `
  return { tenant, staff }
}

async function insertCashFlow(
  sql: Sql,
  tenantId: string,
  staffId: string,
  occurredAtIso: string,
  amount: number,
  description: string,
): Promise<void> {
  await sql`
    INSERT INTO cash_flows (tenant_id, type, category, amount, method, description, registered_by, occurred_at)
    VALUES (${tenantId}, 'income', 'booking', ${amount}, 'cash', ${description}, ${staffId}, ${occurredAtIso})
  `
}

describe('cashflow bucketing — día operativo (closes_next_day)', () => {
  it('nightCutoffMins del fixture da 120 min (el único día con extensión es el viernes)', () => {
    expect(nightCutoffMins(nightOpeningHours(), true)).toBe(120)
  })

  it('operatingDateOf ubica la madrugada del sábado calendario en el día operativo viernes', () => {
    const cutoffMins = nightCutoffMins(nightOpeningHours(), true)
    // 01:00 ART del sábado calendario = 04:00 UTC.
    expect(operatingDateOf(new Date('2026-01-17T04:00:00Z'), cutoffMins)).toBe('2026-01-16')
  })

  it('getCashFlows/getDaySummary bucketean una venta de madrugada bajo el día operativo, no el calendario ART', async () => {
    const sql = getSql()
    const { tenant, staff } = await seedNightTenant(sql)
    const cutoffMins = nightCutoffMins(nightOpeningHours(), true)

    // 2026-01-17 04:00 UTC = 01:00 ART del sábado calendario, pero pertenece
    // al día operativo del viernes 2026-01-16 (20:00 vie → 02:00 sáb).
    await insertCashFlow(
      sql,
      tenant.id,
      staff.id,
      '2026-01-17T04:00:00Z',
      500000,
      'Venta de madrugada',
    )

    const fridayList = await withTenantContext(tenant.id, (tx) =>
      getCashFlows(tenant.id, '2026-01-16', cutoffMins, tx),
    )
    expect(fridayList.map((cf) => cf.description)).toContain('Venta de madrugada')

    const saturdayList = await withTenantContext(tenant.id, (tx) =>
      getCashFlows(tenant.id, '2026-01-17', cutoffMins, tx),
    )
    expect(saturdayList.some((cf) => cf.description === 'Venta de madrugada')).toBe(false)

    const fridaySummary = await withTenantContext(tenant.id, (tx) =>
      getDaySummary(tenant.id, '2026-01-16', cutoffMins, tx),
    )
    expect(fridaySummary.totalIncome).toBe(500000)

    const saturdaySummary = await withTenantContext(tenant.id, (tx) =>
      getDaySummary(tenant.id, '2026-01-17', cutoffMins, tx),
    )
    expect(saturdaySummary.totalIncome).toBe(0)
  })

  it('un alta en la ventana de madrugada de un día operativo YA CERRADO es rechazada (atomicidad escritura/lectura)', async () => {
    const sql = getSql()
    const { tenant, staff } = await seedNightTenant(sql)
    const cutoffMins = nightCutoffMins(nightOpeningHours(), true)

    await insertCashFlow(
      sql,
      tenant.id,
      staff.id,
      '2026-01-17T04:00:00Z',
      500000,
      'Venta de madrugada',
    )

    await withTenantContext(tenant.id, (tx) =>
      closeDailyRegister(tenant.id, '2026-01-16', staff.id, {}, cutoffMins, tx),
    )

    // Sin el fix, assertDayOpen comparaba contra artDateOf (calendario ART puro:
    // '2026-01-17', sábado) y este alta pasaba igual — quedando fuera del cierre
    // ya hecho para siempre (decisión B del ADR: sin re-bucketing histórico).
    await expect(
      withTenantContext(tenant.id, (tx) =>
        createCashFlow(
          tenant.id,
          staff.id,
          {
            type: 'income',
            category: 'booking',
            amount: 100000,
            method: 'cash',
            description: 'Segunda venta, misma madrugada ya cerrada',
            occurredAt: new Date('2026-01-17T04:30:00Z'),
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(DayAlreadyClosedError)

    // Control: un movimiento de un día operativo DISTINTO (sábado, sin cerrar)
    // sí se acepta — el guard no bloquea de más.
    const accepted = await withTenantContext(tenant.id, (tx) =>
      createCashFlow(
        tenant.id,
        staff.id,
        {
          type: 'income',
          category: 'booking',
          amount: 70000,
          method: 'cash',
          description: 'Venta sábado diurno',
          occurredAt: new Date('2026-01-17T20:00:00Z'),
        },
        tx,
      ),
    )
    expect(accepted.id).toBeDefined()
  })

  it('cutoffMins=0 (closes_next_day=false) mantiene el comportamiento actual sin cambios (regresión cero)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    // 2026-01-15 02:00 UTC == 2026-01-14 23:00 ART. Mismo escenario que el
    // GAP G3 de cashflow.test.ts, exigiendo ahora cutoffMins=0 explícito.
    await insertCashFlow(sql, tenant.id, staff.id, '2026-01-15T02:00:00Z', 300000, 'Cierre tarde')

    const artDay = await withTenantContext(tenant.id, (tx) =>
      getCashFlows(tenant.id, '2026-01-14', 0, tx),
    )
    expect(artDay.map((cf) => cf.description)).toContain('Cierre tarde')

    const utcDay = await withTenantContext(tenant.id, (tx) =>
      getCashFlows(tenant.id, '2026-01-15', 0, tx),
    )
    expect(utcDay.some((cf) => cf.description === 'Cierre tarde')).toBe(false)

    const summary = await withTenantContext(tenant.id, (tx) =>
      getDaySummary(tenant.id, '2026-01-14', 0, tx),
    )
    expect(summary.totalIncome).toBe(300000)

    const close = await withTenantContext(tenant.id, (tx) =>
      closeDailyRegister(tenant.id, '2026-01-14', staff.id, {}, 0, tx),
    )
    expect(close.totalIncome).toBe(300000)
  })
})
