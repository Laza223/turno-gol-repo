import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, getWorkerDb, withTenantContext } from '@/shared/db/client'
import { createAbonado, updateAbonadoAgreement } from '@/modules/abonados/abonado.service'
import { cancelByAdmin, handleNoShow } from '@/modules/bookings/booking.cancellation'
import { createMultiDateEventBookings } from '@/modules/bookings/booking.service'
import { findAutoCreditCandidates } from '@/modules/bookings/booking.auto-credit'
import { getDebts } from '@/modules/bookings/booking.debts'
import { MultiDateSlotConflictError } from '@/modules/bookings/booking.errors'
import { writeOffBooking } from '@/modules/bookings/booking.write-off'
import { getRevenueReport } from '@/modules/reports/report.service'
import {
  listAbonadoCoverageByIds,
  settleAbonadoPeriod,
  settleBookingsBatch,
  voidSettlement,
} from '@/modules/settlements/settlement.service'
import { SettlementValidationError } from '@/modules/settlements/settlement.errors'
import { addDays, artTodayStr } from '@/shared/dates/art'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
  linkStaffToTenant,
} from '../helpers/tenant'
import { getOrCreatePlanId, insertCourt } from '../helpers/factories'

function dayOfWeekOf(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay()
}

let tenantId: string
let staffId: string
let courtId: string
let playerId: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)

  const tenant = await createTestTenant(sql)
  tenantId = tenant.id
  const staff = await createTestStaffUser(sql)
  staffId = staff.id
  await linkStaffToTenant(sql, tenantId, staffId, 'admin')

  const player = await createTestPlayer(sql)
  playerId = player.id
  await linkPlayerToTenant(sql, tenantId, playerId)

  const planId = await getOrCreatePlanId(sql)
  await sql`
    INSERT INTO tenant_subscriptions (
      tenant_id, plan_id, billing_cycle, status, current_period_start, current_period_end
    )
    VALUES (
      ${tenantId}, ${planId}, 'monthly'::billing_cycle, 'active'::subscription_status,
      NOW() - INTERVAL '1 day', NOW() + INTERVAL '90 days'
    )
  `
  await sql`UPDATE tenants SET status = 'active'::tenant_status WHERE id = ${tenantId}`

  courtId = await insertCourt(sql, tenantId)
  await sql`
    UPDATE courts
    SET pricing = ${sql.json({
      rules: [
        {
          days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
          from: '08:00',
          to: '23:00',
          price: 16_800_000 / 100,
        },
      ],
    })}
    WHERE id = ${courtId}
  `
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('booking_settlements + acuerdos mensuales/packs (migr. 121)', () => {
  it('enforce_booking_invariants_fn permite settlement_id en completed solo con app.booking_settlement = on y protege price_snapshot', async () => {
    const sql = getSql()
    const [b] = await sql<{ id: string }[]>`
      INSERT INTO bookings (
        tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
        price_snapshot, deposit_amount, deposit_status, payment_method, status
      )
      VALUES (
        ${tenantId}, ${courtId}, ${addDays(artTodayStr(), 1)}, '09:00', '10:00',
        NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day',
        100000, 0, 'not_required', NULL, 'completed'::booking_status
      )
      RETURNING id
    `
    const [s] = await sql<{ id: string }[]>`
      INSERT INTO booking_settlements (
        tenant_id, court_id, kind, payment_origin, amount, created_by_staff
      )
      VALUES (${tenantId}, ${courtId}, 'bookings', 'already_settled', 0, ${staffId})
      RETURNING id
    `

    await expect(
      sql`UPDATE bookings SET settlement_id = ${s!.id} WHERE id = ${b!.id}`,
    ).rejects.toThrow()

    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL app.booking_settlement = 'on'`)
        await tx`UPDATE bookings SET settlement_id = ${s!.id}, price_snapshot = 0 WHERE id = ${b!.id}`
      }),
    ).rejects.toThrow(/price_snapshot es inmutable/)

    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL app.booking_settlement = 'on'`)
      await tx`UPDATE bookings SET settlement_id = ${s!.id} WHERE id = ${b!.id}`
    })

    const [after] = await sql<{ settlement_id: string | null }[]>`
      SELECT settlement_id FROM bookings WHERE id = ${b!.id}
    `
    expect(after?.settlement_id).toBe(s!.id)
  })

  it('escuelita mensual en already_settled: price_snapshot=0, cubre el mes y no genera cash_flows', async () => {
    const sql = getSql()
    const startsOn = addDays(artTodayStr(), 2)
    const firstYm = startsOn.slice(0, 7)
    const nextYm = addDays(`${firstYm}-28`, 6).slice(0, 7)

    const outcome = await withTenantContext(tenantId, (tx) =>
      createAbonado(
        tenantId,
        staffId,
        {
          courtId,
          contactName: 'Escuelita El Vagón',
          dayOfWeek: dayOfWeekOf(startsOn),
          timeStart: '11:00',
          timeEnd: '12:00',
          pricePerSession: 0,
          billingMode: 'monthly',
          agreedAmount: 250_000_00,
          startsOn,
          initialSettlement: {
            kind: 'monthly',
            paymentOrigin: 'already_settled',
            amount: 250_000_00,
            month: firstYm,
          },
        },
        tx,
      ),
    )

    const rows = await sql<
      { date: string; price_snapshot: number; settlement_id: string | null }[]
    >`
      SELECT date::text AS date, price_snapshot, settlement_id
      FROM bookings
      WHERE abonado_id = ${outcome.abonado.id}
      ORDER BY date ASC
    `
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.price_snapshot === 0)).toBe(true)
    const inFirstMonth = rows.filter((r) => r.date.startsWith(firstYm))
    expect(inFirstMonth.length).toBeGreaterThan(0)
    expect(inFirstMonth.every((r) => r.settlement_id !== null)).toBe(true)

    const inNextMonth = rows.filter((r) => r.date.startsWith(nextYm))
    expect(inNextMonth.every((r) => r.settlement_id === null)).toBe(true)

    const cfCount = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n
      FROM cash_flows
      WHERE tenant_id = ${tenantId}
        AND settlement_id IN (
          SELECT id FROM booking_settlements WHERE abonado_id = ${outcome.abonado.id}
        )
    `
    expect(cfCount[0]?.n).toBe(0)
  })

  it('pack de 4 turnos: cancelación pasa crédito al 5to turno, no_show consume crédito sin rollover', async () => {
    const sql = getSql()
    const startsOn = addDays(artTodayStr(), 3)

    const { abonado } = await withTenantContext(tenantId, (tx) =>
      createAbonado(
        tenantId,
        staffId,
        {
          courtId,
          contactName: 'Grupo 4 Turnos',
          contactPhone: '1144556677',
          dayOfWeek: dayOfWeekOf(startsOn),
          timeStart: '12:00',
          timeEnd: '13:00',
          pricePerSession: 50_000_00,
          billingMode: 'pack',
          agreedAmount: 200_000_00,
          startsOn,
          initialSettlement: {
            kind: 'pack',
            paymentOrigin: 'caja',
            amount: 200_000_00,
            creditsTotal: 4,
            charges: [{ amount: 200_000_00, method: 'transfer' }],
          },
        },
        tx,
      ),
    )

    const initialSlots = await sql<{ id: string; settlement_id: string | null }[]>`
      SELECT id, settlement_id
      FROM bookings
      WHERE abonado_id = ${abonado.id}
      ORDER BY starts_at ASC
    `
    expect(initialSlots.length).toBeGreaterThanOrEqual(6)
    expect(initialSlots.slice(0, 4).every((s) => s.settlement_id !== null)).toBe(true)
    expect(initialSlots[4]!.settlement_id).toBeNull()
    expect(initialSlots[5]!.settlement_id).toBeNull()

    // Cancelar el 1er turno libera el crédito y lo pasa al 5to
    await withTenantContext(tenantId, (tx) =>
      cancelByAdmin(initialSlots[0]!.id, staffId, 'reschedule', 'jugador', tx),
    )

    const afterCancel = await sql<{ id: string; settlement_id: string | null; status: string }[]>`
      SELECT id, settlement_id, status
      FROM bookings
      WHERE abonado_id = ${abonado.id}
      ORDER BY starts_at ASC
    `
    expect(afterCancel[0]!.status).toBe('canceled_no_refund')
    expect(afterCancel[0]!.settlement_id).toBeNull()
    expect(afterCancel[4]!.settlement_id).not.toBeNull()
    expect(afterCancel[5]!.settlement_id).toBeNull()

    // Marcar no_show en el 2do turno CONSUME el crédito (no pasa al 6to)
    await sql`
      UPDATE bookings
      SET starts_at = NOW() - INTERVAL '3 hours', ends_at = NOW() - INTERVAL '2 hours'
      WHERE id = ${initialSlots[1]!.id}
    `
    await withTenantContext(tenantId, (tx) => handleNoShow(initialSlots[1]!.id, staffId, tx))

    const afterNoShow = await sql<{ id: string; settlement_id: string | null; status: string }[]>`
      SELECT id, settlement_id, status
      FROM bookings
      WHERE abonado_id = ${abonado.id}
      ORDER BY starts_at ASC
    `
    const slotNoShow = afterNoShow.find((r) => r.id === initialSlots[1]!.id)
    const slotSixth = afterNoShow.find((r) => r.id === initialSlots[5]!.id)
    expect(slotNoShow?.status).toBe('no_show')
    expect(slotNoShow?.settlement_id).not.toBeNull()
    expect(slotSixth?.settlement_id).toBeNull()

    const coverage = await withTenantContext(tenantId, (tx) =>
      listAbonadoCoverageByIds(tenantId, [abonado.id], tx),
    )
    // 4 créditos originales - 1 no_show consumido = 3 turnos futuros cubiertos
    expect(coverage.get(abonado.id)?.remainingPackSessions).toBe(3)
  })

  it('rescate de abonado semanal a mensual limpia precios futuros y excluye completados de auto-credit y deudas', async () => {
    const sql = getSql()
    const startsOn = addDays(artTodayStr(), 4)
    const { abonado } = await withTenantContext(tenantId, (tx) =>
      createAbonado(
        tenantId,
        staffId,
        {
          courtId,
          contactName: 'Escuelita Rescatada',
          contactPhone: '1199887766',
          dayOfWeek: dayOfWeekOf(startsOn),
          timeStart: '15:00',
          timeEnd: '16:00',
          pricePerSession: 168_000_00,
          startsOn,
        },
        tx,
      ),
    )

    const updateRes = await withTenantContext(tenantId, (tx) =>
      updateAbonadoAgreement(
        tenantId,
        staffId,
        {
          abonadoId: abonado.id,
          billingMode: 'monthly',
          pricePerSession: 0,
          agreedAmount: 250_000_00,
        },
        tx,
      ),
    )
    expect(updateRes.updatedBookings).toBeGreaterThanOrEqual(1)

    const futurePrices = await sql<{ price_snapshot: number }[]>`
      SELECT price_snapshot FROM bookings WHERE abonado_id = ${abonado.id}
    `
    expect(futurePrices.every((r) => r.price_snapshot === 0)).toBe(true)

    // Un turno completado saldado hace >24h NO entra ni en deudas ni en auto-credit 24h
    const [settledPast] = await sql<{ id: string }[]>`
      INSERT INTO bookings (
        tenant_id, court_id, abonado_id, date, time_start, time_end, starts_at, ends_at,
        price_snapshot, deposit_amount, deposit_status, payment_method, status, updated_at
      )
      VALUES (
        ${tenantId}, ${courtId}, ${abonado.id}, ${artTodayStr()}, '16:00', '17:00',
        NOW() - INTERVAL '30 hours', NOW() - INTERVAL '29 hours',
        16800000, 0, 'not_required', NULL, 'completed'::booking_status,
        NOW() - INTERVAL '28 hours'
      )
      RETURNING id
    `
    await withTenantContext(tenantId, (tx) =>
      settleAbonadoPeriod(
        tenantId,
        staffId,
        {
          abonadoId: abonado.id,
          kind: 'pack',
          paymentOrigin: 'already_settled',
          amount: 0,
          creditsTotal: 2,
        },
        tx,
      ),
    )

    const candidates = await getWorkerDb().transaction((tx) => findAutoCreditCandidates(tx))
    expect(candidates.some((c) => c.bookingId === settledPast!.id)).toBe(false)

    const debts = await withTenantContext(tenantId, (tx) => getDebts(tenantId, tx))
    expect(debts.some((d) => d.id === settledPast!.id)).toBe(false)
  })

  it('eventos multi-fecha atómicos, voidSettlement solo sin Caja y atribución por cancha en reportes', async () => {
    const sql = getSql()
    const d1 = addDays(artTodayStr(), 5)
    const d2 = addDays(artTodayStr(), 6)
    const d3 = addDays(artTodayStr(), 7)

    // Ocupar d2 para verificar rollback atómico de todo el lote
    await sql`
      INSERT INTO bookings (
        tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
        price_snapshot, deposit_amount, deposit_status, payment_method, status
      )
      VALUES (
        ${tenantId}, ${courtId}, ${d2}, '18:00', '20:00',
        (${d2}::date + '18:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
        (${d2}::date + '20:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
        100000, 0, 'not_required', NULL, 'confirmed'::booking_status
      )
    `

    await expect(
      withTenantContext(tenantId, (tx) =>
        createMultiDateEventBookings(
          tenantId,
          {
            courtId,
            dates: [d1, d2, d3],
            timeStart: '18:00',
            timeEnd: '20:00',
            staffUserId: staffId,
            guestName: 'Torneo Choque',
            paymentMode: 'already_settled',
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(MultiDateSlotConflictError)

    const afterFail = await sql<{ id: string }[]>`
      SELECT id FROM bookings WHERE tenant_id = ${tenantId} AND guest_name = 'Torneo Choque'
    `
    expect(afterFail.length).toBe(0)

    // Sin conflicto + cobro real en Caja -> impacta reporte byCourt y no permite voidSettlement
    const d4 = addDays(artTodayStr(), 8)
    const ok = await withTenantContext(tenantId, (tx) =>
      createMultiDateEventBookings(
        tenantId,
        {
          courtId,
          dates: [d3, d4],
          timeStart: '18:00',
          timeEnd: '20:00',
          staffUserId: staffId,
          guestName: 'Torneo Confirmado',
          totalAmount: 300_000_00,
          paymentMode: 'caja',
          charges: [{ amount: 300_000_00, method: 'cash' }],
        },
        tx,
      ),
    )
    expect(ok.bookings).toHaveLength(2)
    expect(ok.settlementId).toBeTruthy()

    await expect(
      withTenantContext(tenantId, (tx) => voidSettlement(tenantId, ok.settlementId!, staffId, tx)),
    ).rejects.toBeInstanceOf(SettlementValidationError)

    const openingHours = {
      mon: { open: '08:00', close: '23:00' },
      tue: { open: '08:00', close: '23:00' },
      wed: { open: '08:00', close: '23:00' },
      thu: { open: '08:00', close: '23:00' },
      fri: { open: '08:00', close: '23:00' },
      sat: { open: '08:00', close: '23:00' },
      sun: { open: '08:00', close: '23:00' },
    }
    const report = await getRevenueReport(tenantId, artTodayStr().slice(0, 7), openingHours)
    const courtRow = report.byCourt.find((c) => c.courtId === courtId)
    expect(courtRow?.income).toBeGreaterThanOrEqual(500_000_00)
  })

  it('dar por perdido y saldar son excluyentes: un turno saldado no se da por perdido y uno dado por perdido no se salda', async () => {
    const sql = getSql()
    const insertPastCompleted = async (timeStart: string, timeEnd: string): Promise<string> => {
      const [b] = await sql<{ id: string }[]>`
        INSERT INTO bookings (
          tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
          price_snapshot, deposit_amount, deposit_status, payment_method, status
        )
        VALUES (
          ${tenantId}, ${courtId}, ${addDays(artTodayStr(), -9)}, ${timeStart}, ${timeEnd},
          NOW() - INTERVAL '9 days', NOW() - INTERVAL '9 days' + INTERVAL '1 hour',
          100000, 0, 'not_required', NULL, 'completed'::booking_status
        )
        RETURNING id
      `
      return b!.id
    }
    const settledId = await insertPastCompleted('05:00', '06:00')
    const lostId = await insertPastCompleted('06:00', '07:00')

    // 1) Saldado -> no se da por perdido.
    await withTenantContext(tenantId, (tx) =>
      settleBookingsBatch(
        tenantId,
        staffId,
        { bookingIds: [settledId], paymentOrigin: 'already_settled', amount: 0 },
        tx,
      ),
    )
    await expect(
      withTenantContext(tenantId, (tx) =>
        writeOffBooking(tenantId, staffId, settledId, 100000, tx),
      ),
    ).rejects.toThrow('Este turno ya está saldado.')

    // 2) Dado por perdido -> no se salda, ni en Caja ni como "ya estaba saldado".
    await withTenantContext(tenantId, (tx) =>
      writeOffBooking(tenantId, staffId, lostId, 100000, tx),
    )
    await expect(
      withTenantContext(tenantId, (tx) =>
        settleBookingsBatch(
          tenantId,
          staffId,
          { bookingIds: [lostId], paymentOrigin: 'already_settled', amount: 0 },
          tx,
        ),
      ),
    ).rejects.toThrow('está dado por perdido')

    const [row] = await sql<{ settlement_id: string | null }[]>`
      SELECT settlement_id FROM bookings WHERE id = ${lostId}
    `
    expect(row?.settlement_id).toBeNull()
  })
})
