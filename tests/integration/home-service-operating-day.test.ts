import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Sql } from 'postgres'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
  type TestTenant,
} from '../helpers/tenant'
import { insertCourt } from '../helpers/factories'
import { nightCutoffMins } from '@/shared/time/operating-day'
import { getHoyData } from '@/modules/home/home.service'
import type { OpeningHours } from '@/modules/tenants/tenant.types'

/**
 * Hallazgo CRÍTICO de la revisión adversarial de Fase 2: home-service.test.ts
 * fuerza cutoffMins=0/closesNextDay=false en TODOS sus casos — el branch real
 * de día operativo (operatingDayRangeUtc con cutoffMins>0) nunca se ejercita
 * para getHoyData, pese a que dashboard/page.tsx y daily-summary.worker.ts lo
 * calculan dinámico en producción. Mismo patrón que
 * tests/integration/cashflow-operating-day.test.ts, aplicado a home.service.
 */

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => closeSql())

// Único día con extensión de madrugada (viernes 20:00→02:00) — mismo fixture
// que cashflow-operating-day.test.ts, cutoff determinado sin ambigüedad (120 min).
const NIGHT_OPENING_HOURS: OpeningHours = {
  mon: { open: '08:00', close: '23:00' },
  tue: { open: '08:00', close: '23:00' },
  wed: { open: '08:00', close: '23:00' },
  thu: { open: '08:00', close: '23:00' },
  fri: { open: '20:00', close: '02:00' },
  sat: { open: '08:00', close: '23:00' },
  sun: { open: '08:00', close: '23:00' },
}

async function seedNightTenant(
  sql: Sql,
): Promise<{ tenant: TestTenant; staffId: string; courtId: string }> {
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)
  await sql`
    UPDATE tenants SET closes_next_day = true, opening_hours = ${sql.json(NIGHT_OPENING_HOURS)}
    WHERE id = ${tenant.id}
  `
  const courtId = await insertCourt(sql, tenant.id)
  return { tenant, staffId: staff.id, courtId }
}

const hoyOpts = (date: string, cutoffMins: number) => ({
  date,
  cutoffMins,
  openingHours: NIGHT_OPENING_HOURS,
  closedDates: null,
  closesNextDay: true,
})

describe('home.service — día operativo (closes_next_day)', () => {
  it('una seña rechazada de madrugada (post-medianoche) bucketea bajo el día operativo del viernes, no el sábado calendario', async () => {
    const sql = getSql()
    const { tenant, courtId } = await seedNightTenant(sql)
    const cutoffMins = nightCutoffMins(NIGHT_OPENING_HOURS, true)
    expect(cutoffMins).toBe(120) // control: mismo valor que cashflow-operating-day.test.ts

    // Booking del viernes operativo (2026-01-16), turno que cruza medianoche.
    const bookingRows = await sql<{ id: string }[]>`
      INSERT INTO bookings (tenant_id, court_id, date, time_start, time_end, starts_at, ends_at, price_snapshot, deposit_amount, deposit_status, status)
      VALUES (${tenant.id}, ${courtId}, '2026-01-16', '23:00', '24:00', '2026-01-17T02:00:00Z', '2026-01-17T03:00:00Z', 800000, 500000, 'pending', 'pending_payment')
      RETURNING id
    `
    const bookingId = bookingRows[0]!.id

    // Seña rechazada a las 01:00 ART del sábado calendario (2026-01-17T04:00:00Z)
    // — pertenece al día operativo del viernes (20:00 vie → 02:00 sáb).
    const paymentRows = await sql<{ id: string }[]>`
      INSERT INTO payments (tenant_id, booking_id, amount, type, method, status, created_at)
      VALUES (${tenant.id}, ${bookingId}, ${500000}, 'deposit', 'mercadopago', 'rejected', '2026-01-17T04:00:00Z')
      RETURNING id
    `
    await sql`UPDATE bookings SET payment_id = ${paymentRows[0]!.id} WHERE id = ${bookingId}`

    const friday = await withTenantContext(tenant.id, (tx) =>
      getHoyData(tenant.id, tx, hoyOpts('2026-01-16', cutoffMins)),
    )
    expect(
      friday.needsAttention.some(
        (a) => a.kind === 'failed_deposit' && 'bookingId' in a && a.bookingId === bookingId,
      ),
    ).toBe(true)

    const saturday = await withTenantContext(tenant.id, (tx) =>
      getHoyData(tenant.id, tx, hoyOpts('2026-01-17', cutoffMins)),
    )
    expect(
      saturday.needsAttention.some(
        (a) => a.kind === 'failed_deposit' && 'bookingId' in a && a.bookingId === bookingId,
      ),
    ).toBe(false)
  })

  it('"caja de ayer sin cerrar" (hasCashFlowsOnDate) respeta el mismo cutoff — un movimiento de madrugada no se le escapa al día operativo correcto', async () => {
    const sql = getSql()
    const { tenant, staffId } = await seedNightTenant(sql)
    const cutoffMins = nightCutoffMins(NIGHT_OPENING_HOURS, true)

    // "Hoy" = sábado operativo (2026-01-17); "ayer" = viernes operativo (2026-01-16).
    // Actividad de madrugada del viernes operativo, 01:00 ART sábado calendario.
    await sql`
      INSERT INTO cash_flows (tenant_id, type, category, amount, method, description, registered_by, occurred_at)
      VALUES (${tenant.id}, 'income', 'booking', ${500000}, 'cash', 'Venta de madrugada', ${staffId}, '2026-01-17T04:00:00Z')
    `

    const saturdayView = await withTenantContext(tenant.id, (tx) =>
      getHoyData(tenant.id, tx, hoyOpts('2026-01-17', cutoffMins)),
    )
    expect(saturdayView.needsAttention.some((a) => a.kind === 'yesterday_cash_unclosed')).toBe(true)

    // Control: visto desde el domingo operativo, "ayer" es el sábado (sin
    // actividad) — la alerta no debe aparecer (probaría que el bucketing NO
    // está usando UTC calendario puro, que hubiera dejado la venta en 'sábado').
    const sundayView = await withTenantContext(tenant.id, (tx) =>
      getHoyData(tenant.id, tx, hoyOpts('2026-01-18', cutoffMins)),
    )
    expect(sundayView.needsAttention.some((a) => a.kind === 'yesterday_cash_unclosed')).toBe(false)
  })
})
