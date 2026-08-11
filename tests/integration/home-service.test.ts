import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { artDateOf } from '@/shared/time/art-date'
import { addDays } from '@/shared/dates/art'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
  type TestTenant,
} from '../helpers/tenant'
import { insertBooking, insertCourt } from '../helpers/factories'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { closeDailyRegister } from '@/modules/cashflow/daily-close.service'
import { openDay } from '@/modules/cashflow/cash-open.service'
import { getStreetMoney, sumStreetMoney } from '@/modules/cashflow/street-money.service'
import { getHoyData } from '@/modules/home/home.service'
import type { OpeningHours } from '@/modules/tenants/tenant.types'

/**
 * Horarios de un tenant REAL, no el default crudo de la migración 003.
 *
 * La 003 pone `fri`/`sat` cerrando a la `01:00`, pero `closes_next_day` nace en
 * `false` (migr. 035): un cierre post-medianoche sin ese flag es un rango
 * inválido y `generateTimeSlots` devuelve `[]` — el día entero sin slots. Con
 * `slotsCount = 0`, `occupancyForDay` calcula `available = 0` y este suite se
 * ponía rojo LOS VIERNES Y SÁBADOS, verde el resto de la semana (medido:
 * lun-jue 16 slots, vie 0, sáb 0, dom 14). Falló así en CI el 2026-08-07.
 *
 * Ningún tenant de producción está en ese estado: `sanitizeWizardHours`
 * (`src/app/onboarding/wizard-hours.ts`) baja esos cierres a `00:00` durante el
 * onboarding justamente porque el default crudo es inválido. El fixture ahora
 * refleja lo que el wizard produce, que es lo que estos tests deben simular.
 *
 * Si algún día hace falta ejercitar la madrugada de verdad, va con
 * `closesNextDay: true` en `hoyOpts` — no volviendo a poner `01:00` acá.
 */
const DEFAULT_OPENING_HOURS: OpeningHours = {
  mon: { open: '08:00', close: '00:00' },
  tue: { open: '08:00', close: '00:00' },
  wed: { open: '08:00', close: '00:00' },
  thu: { open: '08:00', close: '00:00' },
  fri: { open: '08:00', close: '00:00' },
  sat: { open: '09:00', close: '00:00' },
  sun: { open: '09:00', close: '23:00' },
}

/**
 * Fase 2 del contrato (docs/planning/2026-08-01-decisiones-de-fase-v2.md §3):
 * "Hoy" agrega 3 números + 2 listas ("Mientras no estabas"/"Necesita tu
 * atención") sobre datos que YA existen en tablas distintas. Este archivo
 * verifica la taxonomía de alertas (docs/decisions/2026-08-02-taxonomia-alertas-hoy.md)
 * contra código real y que "plata en la calle" nunca se recalcula — se reusa
 * la MISMA getStreetMoney de Fase 1 (criterio de "fuente única").
 */

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

async function seedTenant(): Promise<{ tenant: TestTenant; staffId: string; courtId: string }> {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)
  const courtId = await insertCourt(sql, tenant.id)
  return { tenant, staffId: staff.id, courtId }
}

/** payments no tiene factory compartida con type/status configurables —
 * se inserta directo acá para no tocar tests/helpers/factories.ts (usado
 * por ~90 archivos) por un caso de uso propio de esta suite.
 *
 * También apunta bookings.payment_id a la fila nueva — mismo efecto que
 * upsertPaymentRow en producción (payment.service.ts): getFailedDepositsToday
 * filtra por `p.id = b.payment_id` (fix de la revisión adversarial de Fase 2,
 * evita alertas de "seña rechazada" obsoletas tras un reintento exitoso), así
 * que sin este UPDATE el seed no simula el flujo real y la alerta no dispara. */
async function insertDepositPayment(
  tenantId: string,
  bookingId: string,
  status: 'rejected' | 'canceled' | 'approved',
  processedAt: Date | null = null,
): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO payments (tenant_id, booking_id, amount, type, method, status, processed_at)
    VALUES (${tenantId}, ${bookingId}, ${500000}, 'deposit', 'mercadopago', ${status}, ${processedAt ? processedAt.toISOString() : null})
    RETURNING id
  `
  const paymentId = rows[0]!.id
  await sql`UPDATE bookings SET payment_id = ${paymentId} WHERE id = ${bookingId}`
  return paymentId
}

const midday = (date: string) => new Date(`${date}T12:00:00Z`)
const hoyOpts = (tenant: TestTenant, date: string) => ({
  date,
  cutoffMins: 0,
  openingHours: DEFAULT_OPENING_HOURS,
  closedDates: null,
  closesNextDay: false,
})

describe('home.service — números de Hoy', () => {
  it('suma la plata cobrada hoy y la del mismo día de la semana pasada por separado', async () => {
    const { tenant, staffId } = await seedTenant()
    const today = artDateOf(new Date())
    const lastWeek = addDays(today, -7)

    await withTenantContext(tenant.id, (tx) =>
      createCashFlow(
        tenant.id,
        staffId,
        {
          type: 'income',
          category: 'other',
          amount: 100000,
          method: 'cash',
          description: 'Hoy',
          occurredAt: midday(today),
        },
        tx,
      ),
    )
    await withTenantContext(tenant.id, (tx) =>
      createCashFlow(
        tenant.id,
        staffId,
        {
          type: 'income',
          category: 'other',
          amount: 70000,
          method: 'cash',
          description: 'Semana pasada',
          occurredAt: midday(lastWeek),
        },
        tx,
      ),
    )

    const data = await withTenantContext(tenant.id, (tx) =>
      getHoyData(tenant.id, tx, hoyOpts(tenant, today)),
    )

    expect(data.numbers.collectedTodayCents).toBe(100000)
    expect(data.numbers.collectedSameWeekdayLastWeekCents).toBe(70000)
  })

  it('plata en la calle es EXACTAMENTE la de getStreetMoney — nunca se recalcula', async () => {
    const { tenant } = await seedTenant()
    const courtId = await insertCourt(getSql(), tenant.id)
    await insertBooking(getSql(), { tenantId: tenant.id, courtId, status: 'completed' })
    const today = artDateOf(new Date())

    const [data, directRows] = await Promise.all([
      withTenantContext(tenant.id, (tx) => getHoyData(tenant.id, tx, hoyOpts(tenant, today))),
      withTenantContext(tenant.id, (tx) => getStreetMoney(tenant.id, tx)),
    ])

    expect(data.numbers.streetMoneyCents).toBe(sumStreetMoney(directRows))
    expect(data.numbers.streetMoneyCents).toBeGreaterThan(0)
  })

  it('occupancy cuenta el turno confirmado de hoy (wiring SQL de getOccupancy, no solo la matemática pura)', async () => {
    const { tenant, courtId } = await seedTenant()
    const today = artDateOf(new Date())
    await insertBooking(getSql(), {
      tenantId: tenant.id,
      courtId,
      status: 'confirmed',
      date: today,
      timeStart: '10:00',
      timeEnd: '11:00',
    })

    const data = await withTenantContext(tenant.id, (tx) =>
      getHoyData(tenant.id, tx, hoyOpts(tenant, today)),
    )

    expect(data.numbers.occupancy.occupied).toBeGreaterThanOrEqual(1)
    expect(data.numbers.occupancy.available).toBeGreaterThan(0)
  })

  it('cashClosed refleja el cierre de HOY (no el de ayer) — false sin cerrar, true tras cerrar', async () => {
    const { tenant, staffId } = await seedTenant()
    const today = artDateOf(new Date())

    const before = await withTenantContext(tenant.id, (tx) =>
      getHoyData(tenant.id, tx, hoyOpts(tenant, today)),
    )
    expect(before.numbers.cashClosed).toBe(false)

    await withTenantContext(tenant.id, (tx) =>
      closeDailyRegister(tenant.id, today, staffId, {}, 0, tx),
    )

    const after = await withTenantContext(tenant.id, (tx) =>
      getHoyData(tenant.id, tx, hoyOpts(tenant, today)),
    )
    expect(after.numbers.cashClosed).toBe(true)
  })
})

describe('home.service — "Necesita tu atención" (taxonomía, docs/decisions/2026-08-02-taxonomia-alertas-hoy.md)', () => {
  it('turno terminado sin cobrar hoy aparece como P1, con el mismo pendingCents que street-money', async () => {
    const { tenant, courtId } = await seedTenant()
    const today = artDateOf(new Date())
    const bookingId = await insertBooking(getSql(), {
      tenantId: tenant.id,
      courtId,
      status: 'completed',
      date: today,
    })

    const data = await withTenantContext(tenant.id, (tx) =>
      getHoyData(tenant.id, tx, hoyOpts(tenant, today)),
    )

    const alert = data.needsAttention.find((a) => a.kind === 'unpaid_completed_booking')
    expect(alert).toBeDefined()
    expect((alert as { bookingId: string }).bookingId).toBe(bookingId)
    expect((alert as { pendingCents: number }).pendingCents).toBe(800000)
  })

  it('seña rechazada hoy aparece como alerta de seña fallida', async () => {
    const { tenant, courtId } = await seedTenant()
    const bookingId = await insertBooking(getSql(), {
      tenantId: tenant.id,
      courtId,
      status: 'pending_payment',
    })
    await insertDepositPayment(tenant.id, bookingId, 'rejected')
    const today = artDateOf(new Date())

    const data = await withTenantContext(tenant.id, (tx) =>
      getHoyData(tenant.id, tx, hoyOpts(tenant, today)),
    )

    const alert = data.needsAttention.find((a) => a.kind === 'failed_deposit')
    expect(alert).toBeDefined()
    expect((alert as { bookingId: string }).bookingId).toBe(bookingId)
  })

  it('un reintento exitoso tras una seña rechazada NO deja la alerta colgada (hallazgo de revisión adversarial)', async () => {
    const { tenant, courtId } = await seedTenant()
    const bookingId = await insertBooking(getSql(), {
      tenantId: tenant.id,
      courtId,
      status: 'pending_payment',
    })
    await insertDepositPayment(tenant.id, bookingId, 'rejected')
    // Reintento: 2da fila de payments, bookings.payment_id se mueve a la nueva
    // (mismo efecto que retryDepositPaymentAction en producción).
    await insertDepositPayment(tenant.id, bookingId, 'approved', new Date())
    const today = artDateOf(new Date())

    const data = await withTenantContext(tenant.id, (tx) =>
      getHoyData(tenant.id, tx, hoyOpts(tenant, today)),
    )

    expect(data.needsAttention.some((a) => a.kind === 'failed_deposit')).toBe(false)
  })

  it('una seña aprobada NO genera alerta de seña fallida', async () => {
    const { tenant, courtId } = await seedTenant()
    const bookingId = await insertBooking(getSql(), {
      tenantId: tenant.id,
      courtId,
      status: 'confirmed',
    })
    await insertDepositPayment(tenant.id, bookingId, 'approved', new Date())
    const today = artDateOf(new Date())

    const data = await withTenantContext(tenant.id, (tx) =>
      getHoyData(tenant.id, tx, hoyOpts(tenant, today)),
    )

    expect(data.needsAttention.some((a) => a.kind === 'failed_deposit')).toBe(false)
  })

  it('caja de ayer con actividad y sin cierre aparece como alerta; con cierre desaparece', async () => {
    const { tenant, staffId } = await seedTenant()
    const today = artDateOf(new Date())
    const yesterday = addDays(today, -1)

    await withTenantContext(tenant.id, (tx) =>
      createCashFlow(
        tenant.id,
        staffId,
        {
          type: 'income',
          category: 'other',
          amount: 50000,
          method: 'cash',
          description: 'Ayer',
          occurredAt: midday(yesterday),
        },
        tx,
      ),
    )

    const before = await withTenantContext(tenant.id, (tx) =>
      getHoyData(tenant.id, tx, hoyOpts(tenant, today)),
    )
    expect(before.needsAttention.some((a) => a.kind === 'yesterday_cash_unclosed')).toBe(true)

    await withTenantContext(tenant.id, (tx) =>
      closeDailyRegister(tenant.id, yesterday, staffId, {}, 0, tx),
    )

    const after = await withTenantContext(tenant.id, (tx) =>
      getHoyData(tenant.id, tx, hoyOpts(tenant, today)),
    )
    expect(after.needsAttention.some((a) => a.kind === 'yesterday_cash_unclosed')).toBe(false)
  })

  it('caja de ayer ABIERTA pero SIN movimientos también aparece como alerta (operando yesterdayOpen del OR, aislado de yesterdayHadActivity)', async () => {
    const { tenant, staffId } = await seedTenant()
    const today = artDateOf(new Date())
    const yesterday = addDays(today, -1)

    // Apertura sin ningún cash_flow — createCashFlow/assertDayOpen nunca toca
    // daily_cash_opens, así que esto ejercita el operando IZQUIERDO del OR
    // (yesterdayOpen !== null) de forma aislada del derecho (yesterdayHadActivity).
    await withTenantContext(tenant.id, (tx) =>
      openDay(tenant.id, staffId, { date: yesterday, openingCash: 500000 }, 0, tx),
    )

    const data = await withTenantContext(tenant.id, (tx) =>
      getHoyData(tenant.id, tx, hoyOpts(tenant, today)),
    )
    expect(data.needsAttention.some((a) => a.kind === 'yesterday_cash_unclosed')).toBe(true)
  })

  it('ordena las alertas por prioridad P1 (turno)→P2 (seña)→P3 (caja de ayer), y por antigüedad DENTRO de la misma prioridad', async () => {
    const { tenant, staffId, courtId } = await seedTenant()
    const today = artDateOf(new Date())
    const yesterday = addDays(today, -1)

    await withTenantContext(tenant.id, (tx) =>
      createCashFlow(
        tenant.id,
        staffId,
        {
          type: 'income',
          category: 'other',
          amount: 50000,
          method: 'cash',
          description: 'Ayer',
          occurredAt: midday(yesterday),
        },
        tx,
      ),
    )
    const failedBookingId = await insertBooking(getSql(), {
      tenantId: tenant.id,
      courtId,
      status: 'pending_payment',
    })
    await insertDepositPayment(tenant.id, failedBookingId, 'rejected')
    // 2 turnos P1 con horarios distintos — since viene de starts_at
    // (street-money.service.ts), así que el más temprano debe listarse primero.
    // Prueba que sortAttentionItems se invoca de verdad: con ≤1 ítem por
    // categoría el orden de concatenación del código fuente ya "parecía"
    // correcto sin el sort (hallazgo de la revisión adversarial).
    const laterBookingId = await insertBooking(getSql(), {
      tenantId: tenant.id,
      courtId,
      status: 'completed',
      date: today,
      timeStart: '20:00',
      timeEnd: '21:00',
    })
    const earlierBookingId = await insertBooking(getSql(), {
      tenantId: tenant.id,
      courtId,
      status: 'completed',
      date: today,
      timeStart: '10:00',
      timeEnd: '11:00',
    })

    const data = await withTenantContext(tenant.id, (tx) =>
      getHoyData(tenant.id, tx, hoyOpts(tenant, today)),
    )

    expect(data.needsAttention.map((a) => a.kind)).toEqual([
      'unpaid_completed_booking',
      'unpaid_completed_booking',
      'failed_deposit',
      'yesterday_cash_unclosed',
    ])
    const p1BookingIds = data.needsAttention
      .filter((a) => a.kind === 'unpaid_completed_booking')
      .map((a) => (a as { bookingId: string }).bookingId)
    expect(p1BookingIds).toEqual([earlierBookingId, laterBookingId])
  })

  it('sin ninguna anomalía, "Necesita tu atención" queda vacío', async () => {
    const { tenant } = await seedTenant()
    const today = artDateOf(new Date())

    const data = await withTenantContext(tenant.id, (tx) =>
      getHoyData(tenant.id, tx, hoyOpts(tenant, today)),
    )

    expect(data.needsAttention).toEqual([])
  })
})

describe('home.service — "Mientras no estabas"', () => {
  it('reserva online entrante, cancelación y seña acreditada aparecen en el feed', async () => {
    const { tenant, staffId, courtId } = await seedTenant()
    const today = artDateOf(new Date())

    const onlineBookingId = await insertBooking(getSql(), {
      tenantId: tenant.id,
      courtId,
      status: 'confirmed',
    })

    // Creadas por staff (no online) para aislar cada evento bajo prueba —
    // sin esto también contarían como "reserva online entrante" (created_by_staff
    // NULL es el default de insertBooking) y ensuciarían esta aserción puntual.
    const canceledBookingId = await insertBooking(getSql(), {
      tenantId: tenant.id,
      courtId,
      timeStart: '16:00',
      timeEnd: '17:00',
    })
    await getSql()`
      UPDATE bookings SET status = 'canceled_no_refund', canceled_at = NOW(), canceled_by = 'player', created_by_staff = ${staffId}
      WHERE id = ${canceledBookingId}
    `

    const paidBookingId = await insertBooking(getSql(), {
      tenantId: tenant.id,
      courtId,
      timeStart: '18:00',
      timeEnd: '19:00',
    })
    await getSql()`UPDATE bookings SET created_by_staff = ${staffId} WHERE id = ${paidBookingId}`
    await insertDepositPayment(tenant.id, paidBookingId, 'approved', new Date())

    const data = await withTenantContext(tenant.id, (tx) =>
      getHoyData(tenant.id, tx, hoyOpts(tenant, today)),
    )

    const kinds = data.whileYouWereAway.map((i) => i.kind).sort()
    expect(kinds).toEqual(['booking_online', 'cancellation', 'deposit_paid'])
    expect(data.whileYouWereAway.find((i) => i.kind === 'booking_online')?.bookingId).toBe(
      onlineBookingId,
    )
    expect(data.whileYouWereAway.find((i) => i.kind === 'cancellation')?.bookingId).toBe(
      canceledBookingId,
    )
    expect(data.whileYouWereAway.find((i) => i.kind === 'deposit_paid')?.bookingId).toBe(
      paidBookingId,
    )
  })

  it('una cancelación hecha POR el admin no aparece (no es algo que pasó "sin él")', async () => {
    const { tenant, courtId } = await seedTenant()
    const today = artDateOf(new Date())

    const bookingId = await insertBooking(getSql(), { tenantId: tenant.id, courtId })
    await getSql()`
      UPDATE bookings SET status = 'canceled_no_refund', canceled_at = NOW(), canceled_by = 'admin'
      WHERE id = ${bookingId}
    `

    const data = await withTenantContext(tenant.id, (tx) =>
      getHoyData(tenant.id, tx, hoyOpts(tenant, today)),
    )

    expect(data.whileYouWereAway.some((i) => i.kind === 'cancellation')).toBe(false)
  })
})

describe('home.service — aislamiento entre tenants', () => {
  it('no mezcla números ni alertas entre tenants', async () => {
    const { tenant: tenantA, courtId: courtA } = await seedTenant()
    const { tenant: tenantB } = await seedTenant()
    const today = artDateOf(new Date())
    await insertBooking(getSql(), {
      tenantId: tenantA.id,
      courtId: courtA,
      status: 'completed',
      date: today,
    })

    const [dataA, dataB] = await Promise.all([
      withTenantContext(tenantA.id, (tx) => getHoyData(tenantA.id, tx, hoyOpts(tenantA, today))),
      withTenantContext(tenantB.id, (tx) => getHoyData(tenantB.id, tx, hoyOpts(tenantB, today))),
    ])

    expect(dataA.needsAttention.length).toBeGreaterThan(0)
    expect(dataB.needsAttention).toEqual([])
    expect(dataB.numbers.streetMoneyCents).toBe(0)
  })
})
