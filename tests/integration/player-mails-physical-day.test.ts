import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { cancelByAdmin, cancelByPlayer } from '@/modules/bookings/booking.cancellation'
import { createOnlineBooking } from '@/modules/bookings/booking.service'
import { rescheduleBooking } from '@/modules/bookings/booking.reschedule'
import { processWebhook } from '@/modules/payments/payment.service'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import { addDays, artTodayStr } from '@/shared/dates/art'
import { physicalRange } from '@/shared/time/physical-range'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
  linkStaffToTenant,
} from '../helpers/tenant'

/**
 * Los mails que lee el JUGADOR dicen el día calendario en que se juega (de `starts_at`), no el día
 * operativo (`bookings.date`). Con `closes_next_day`, el turno de 00:00 del día operativo D se juega
 * el D+1: el mail no puede decirle "sábado" a quien juega el domingo. Control negativo en cada caso:
 * un turno de 20:00 (mismo día operativo y calendario) dice D.
 */

// 00:00–02:00 cubierto a propósito: el turno de madrugada tiene que tener tarifa.
const PRICING = {
  rules: [
    {
      days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
      from: '00:00',
      to: '23:00',
      price: 800000,
    },
  ],
}

const dateIn = (days: number): string => addDays(artTodayStr(), days)
const ddmmyyyy = (iso: string): string => iso.split('-').reverse().join('/')

let tenantId: string
let staffUserId: string
let playerId: string
let courtId: string

async function insertBooking(opts: {
  date: string
  timeStart: string
  timeEnd: string
  status?: 'confirmed' | 'pending_payment' | 'expired'
}): Promise<string> {
  const sql = getSql()
  const { startsAt, endsAt } = physicalRange({
    date: opts.date,
    timeStart: opts.timeStart,
    timeEnd: opts.timeEnd,
    physicallyNextDay: opts.timeStart < '08:00',
  })
  const status = opts.status ?? 'confirmed'
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end, starts_at, ends_at,
      price_snapshot, deposit_amount, deposit_status, payment_method, status
    ) VALUES (
      ${tenantId}, ${courtId}, ${playerId}, ${opts.date}::date, ${opts.timeStart}::time,
      ${opts.timeEnd}::time, ${startsAt.toISOString()}::timestamptz, ${endsAt.toISOString()}::timestamptz,
      ${800000}, ${status === 'confirmed' ? 0 : 240000},
      ${status === 'confirmed' ? 'not_required' : 'pending'}::deposit_status, NULL,
      ${status}::booking_status
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function mailDates(template: string): Promise<Record<string, unknown>[]> {
  const sql = getSql()
  const rows = await sql<{ content: Record<string, unknown> }[]>`
    SELECT content FROM notifications
    WHERE tenant_id = ${tenantId} AND recipient_id = ${playerId} AND template_name = ${template}
    ORDER BY created_at DESC
  `
  return rows.map((r) => r.content)
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  const tenant = await createTestTenant(sql)
  tenantId = tenant.id
  const staff = await createTestStaffUser(sql)
  staffUserId = staff.id
  await linkStaffToTenant(sql, tenantId, staff.id)
  const player = await createTestPlayer(sql)
  playerId = player.id
  await linkPlayerToTenant(sql, tenantId, player.id)
  await sql`
    UPDATE tenants
    SET closes_next_day = true, settings = settings || '{"booking_advance_days": 60}'::jsonb
    WHERE id = ${tenantId}
  `
  const court = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, ${'Cancha Madrugada'}, ${10}, ${sql.json(PRICING)}, 'online')
    RETURNING id
  `
  courtId = court[0]!.id
}, 40_000)

afterAll(async () => {
  await closeSql()
})

describe('mails al jugador — día físico', () => {
  it('booking_canceled (el jugador cancela): 00:00 de closes_next_day → D+1; 20:00 → D', async () => {
    const d = dateIn(3)
    const madrugada = await insertBooking({ date: d, timeStart: '00:00', timeEnd: '01:00' })
    const noche = await insertBooking({ date: d, timeStart: '20:00', timeEnd: '21:00' })

    await withTenantContext(tenantId, (tx) => cancelByPlayer(madrugada, playerId, undefined, tx))
    await withTenantContext(tenantId, (tx) => cancelByPlayer(noche, playerId, undefined, tx))

    const dates = (await mailDates('booking_canceled')).map((c) => [c.timeStart, c.date])
    expect(dates).toContainEqual(['00:00', ddmmyyyy(addDays(d, 1))])
    expect(dates).toContainEqual(['20:00', ddmmyyyy(d)])
  })

  it('booking_canceled_by_complex (cancela el complejo): 00:00 → D+1; 20:00 → D', async () => {
    const d = dateIn(5)
    const madrugada = await insertBooking({ date: d, timeStart: '00:00', timeEnd: '01:00' })
    const noche = await insertBooking({ date: d, timeStart: '20:00', timeEnd: '21:00' })

    await withTenantContext(tenantId, (tx) =>
      cancelByAdmin(madrugada, staffUserId, 'lluvia', 'complejo', tx),
    )
    await withTenantContext(tenantId, (tx) =>
      cancelByAdmin(noche, staffUserId, 'lluvia', 'complejo', tx),
    )

    const dates = (await mailDates('booking_canceled_by_complex')).map((c) => [c.timeStart, c.date])
    expect(dates).toContainEqual(['00:00', ddmmyyyy(addDays(d, 1))])
    expect(dates).toContainEqual(['20:00', ddmmyyyy(d)])
  })

  it('booking_rescheduled: origen y destino en día físico (00:00 → D+1), el 20:00 queda en D', async () => {
    const from = dateIn(7)
    const to = dateIn(9)
    const a = await insertBooking({ date: from, timeStart: '00:00', timeEnd: '01:00' })
    await withTenantContext(tenantId, (tx) =>
      rescheduleBooking(
        tenantId,
        {
          bookingId: a,
          courtId,
          date: to,
          timeStart: '00:00',
          timeEnd: '01:00',
          staffUserId,
        },
        tx,
      ),
    )
    const b = await insertBooking({ date: from, timeStart: '20:00', timeEnd: '21:00' })
    await withTenantContext(tenantId, (tx) =>
      rescheduleBooking(
        tenantId,
        { bookingId: b, courtId, date: to, timeStart: '21:00', timeEnd: '22:00', staffUserId },
        tx,
      ),
    )

    const mails = await mailDates('booking_rescheduled')
    expect(mails).toContainEqual(
      expect.objectContaining({
        fromDate: ddmmyyyy(addDays(from, 1)),
        toDate: ddmmyyyy(addDays(to, 1)),
        toTimeStart: '00:00',
      }),
    )
    expect(mails).toContainEqual(
      expect.objectContaining({
        fromDate: ddmmyyyy(from),
        toDate: ddmmyyyy(to),
        toTimeStart: '21:00',
      }),
    )
  })

  it('booking_confirmed (reserva online sin seña): 00:00 → D+1; 20:00 → D', async () => {
    const d = dateIn(2)
    for (const [timeStart, timeEnd] of [
      ['00:00', '01:00'],
      ['20:00', '21:00'],
    ] as const) {
      await withTenantContext(tenantId, (tx) =>
        createOnlineBooking(
          tenantId,
          {
            playerId,
            courtId,
            date: d,
            timeStart,
            timeEnd,
            requiresDeposit: false,
            depositPercentage: 0,
          },
          tx,
        ),
      )
    }

    const dates = (await mailDates('booking_confirmed')).map((c) => [c.timeStart, c.date])
    expect(dates).toContainEqual(['00:00', ddmmyyyy(addDays(d, 1))])
    expect(dates).toContainEqual(['20:00', ddmmyyyy(d)])
  })

  it('booking_confirmed (webhook de MP aprobado): 00:00 → D+1; 20:00 → D', async () => {
    const d = dateIn(4)
    for (const [timeStart, timeEnd] of [
      ['00:00', '01:00'],
      ['20:00', '21:00'],
    ] as const) {
      const id = await insertBooking({
        date: d,
        timeStart,
        timeEnd,
        status: 'pending_payment',
      })
      const mpPaymentId = `mp-pay-${id.slice(0, 8)}`
      const gateway = new MockGateway()
      gateway.statusByPaymentId[mpPaymentId] = {
        mpPaymentId,
        status: 'approved',
        amount: 240_000,
        externalReference: id,
        paymentMethodId: 'visa',
      }
      await withTenantContext(tenantId, (tx) =>
        processWebhook(
          {
            mpEventId: `evt-${id.slice(0, 8)}`,
            eventType: 'payment',
            mpPaymentId,
            rawPayload: { id: 'evt', data: { id: mpPaymentId } },
          },
          tenantId,
          gateway,
          tx,
        ),
      )
    }

    const dates = (await mailDates('booking_confirmed')).map((c) => [c.timeStart, c.date])
    expect(dates).toContainEqual(['00:00', ddmmyyyy(addDays(d, 1))])
    expect(dates).toContainEqual(['20:00', ddmmyyyy(d)])
  })
})
