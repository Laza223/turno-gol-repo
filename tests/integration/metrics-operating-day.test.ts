import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { addDaysUtc, getTenantMetrics } from '@/modules/metrics/metrics.service'
import { todayART } from '@/shared/time/art-date'
import { operatingDateOf } from '@/shared/time/operating-day'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

let tenant: { id: string }
let staffId: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  staffId = staff.id
  await linkStaffToTenant(sql, tenant.id, staffId)
  // Complejo que cierra después de medianoche: apertura 20:00, cierre 02:00
  // (mismo horario que booking-physical-overlap.test.ts) → nightCutoffMins = 120.
  await sql`
    UPDATE tenants SET closes_next_day = true,
      opening_hours = ${sql.json({
        mon: { open: '20:00', close: '02:00' }, tue: { open: '20:00', close: '02:00' },
        wed: { open: '20:00', close: '02:00' }, thu: { open: '20:00', close: '02:00' },
        fri: { open: '20:00', close: '02:00' }, sat: { open: '20:00', close: '02:00' },
        sun: { open: '20:00', close: '02:00' },
      })}
    WHERE id = ${tenant.id}
  `
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('getTenantMetrics — bucketing de cash_flows por día operativo', () => {
  it('un ingreso a la madrugada (01:00 ART) se atribuye al día operativo anterior, no al día calendario', async () => {
    const today = todayART()
    const yesterday = addDaysUtc(today, -1)
    // 01:00 ART = 04:00 UTC (ART = UTC-3 fijo). Cae dentro de la ventana de
    // madrugada [00:00, 02:00) ART que el cutoff de 120 min desplaza al día
    // operativo anterior.
    const madrugada = new Date(`${today}T04:00:00Z`)

    await withTenantContext(tenant.id, (tx) =>
      createCashFlow(
        tenant.id,
        staffId,
        {
          type: 'income',
          category: 'product_sale',
          amount: 500_000,
          method: 'cash',
          description: 'Venta cantina de madrugada',
          occurredAt: madrugada,
        },
        tx,
      ),
    )

    const metrics = await withTenantContext(tenant.id, (tx) => getTenantMetrics(tenant.id, tx))

    const yesterdayBucket = metrics.revenuePerDay.find((d) => d.date === yesterday)
    const todayBucket = metrics.revenuePerDay.find((d) => d.date === today)

    expect(yesterdayBucket?.amountCents).toBe(500_000)
    expect(todayBucket?.amountCents).toBe(0)
  }, 30_000)

  it('el borde "hoy" de la ventana de 30 días es el día operativo del instante evaluado, no el calendario', async () => {
    // "Ahora" simulado (parámetro `now` inyectable — evita fake timers, que
    // rompen el I/O real de postgres-js en este repo, ver hallazgo del
    // verificador adversarial). 01:00 ART de `today` cae dentro del cutoff de
    // 120 min → el día operativo de ESE instante es `today` menos uno.
    const today = todayART()
    const cutoffMins = 120
    const madrugada = new Date(`${today}T04:00:00Z`)
    const expectedOperatingToday = operatingDateOf(madrugada, cutoffMins)

    const metrics = await withTenantContext(tenant.id, (tx) =>
      getTenantMetrics(tenant.id, tx, madrugada),
    )

    // Antes del fix, getTenantMetrics anclaba la ventana a todayART() (el
    // calendario), no al día operativo de `now` — el último bucket de la
    // serie quedaba en `today`, un día por delante del día operativo real.
    const lastBucket = metrics.revenuePerDay.at(-1)
    expect(lastBucket?.date).toBe(expectedOperatingToday)
    expect(lastBucket?.date).not.toBe(today)
  }, 30_000)
})
