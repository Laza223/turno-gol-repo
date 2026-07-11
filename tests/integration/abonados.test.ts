import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import {
  createAbonado,
  pauseAbonado,
  reactivateAbonado,
  cancelAbonado,
  getAbonadoSlotConflicts,
} from '@/modules/abonados/abonado.service'
import { createOnlineBooking } from '@/modules/bookings/booking.service'
import { runRollingSlotGeneration } from '@/shared/jobs/workers/generate-abonado-slots.worker'

// 2030-01-07 is a Monday (dayOfWeek=1) — far future, no conflicts expected
const ABO_START = '2030-01-07'
const ABO_DOW = 1 // Monday

async function insertCourt(tenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (
      ${tenantId}, ${'Cancha Abonado Test'}, ${10},
      ${sql.json({ rules: [{ days: ['mon','tue','wed','thu','fri','sat','sun'], from: '08:00', to: '23:00', price: 800000 }] })},
      'online'
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function countFutureBookings(abonadoId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM bookings
    WHERE abonado_id = ${abonadoId} AND date >= NOW()::date
  `
  return rows[0]!.n
}

async function countPtrRows(playerId: string, tenantId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM player_tenant_relationships
    WHERE player_id = ${playerId} AND tenant_id = ${tenantId}
  `
  return rows[0]!.n
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('abonado service', () => {
  it('creates abonado and generates 8 future fixed bookings', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    const { abonado, slotsGenerated, conflictDates } = await withTenantContext(tenant.id, (tx) =>
      createAbonado(tenant.id, staff.id, {
        courtId,
        contactName: 'Grupo Lunes',
        contactPhone: '1122334455',
        dayOfWeek: ABO_DOW,
        timeStart: '14:00',
        timeEnd: '15:00',
        pricePerSession: 800000,
        startsOn: ABO_START,
        paymentMethod: 'cash',
      }, tx),
    )

    expect(abonado.status).toBe('active')
    expect(abonado.dayOfWeek).toBe(ABO_DOW)
    expect(conflictDates).toHaveLength(0)
    expect(slotsGenerated).toBe(8)

    const bookingRows = await sql<{ type: string; status: string; abonado_id: string }[]>`
      SELECT type, status, abonado_id FROM bookings
      WHERE abonado_id = ${abonado.id}
    `
    expect(bookingRows).toHaveLength(8)
    for (const row of bookingRows) {
      expect(row.type).toBe('fixed')
      expect(row.status).toBe('confirmed')
      expect(row.abonado_id).toBe(abonado.id)
    }
  })

  it('pauses abonado and deletes future bookings', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    const { abonado } = await withTenantContext(tenant.id, (tx) =>
      createAbonado(tenant.id, staff.id, {
        courtId,
        contactName: 'Pausa Test',
        contactPhone: '0000000001',
        dayOfWeek: ABO_DOW,
        timeStart: '16:00',
        timeEnd: '17:00',
        pricePerSession: 800000,
        startsOn: ABO_START,
      }, tx),
    )

    expect(await countFutureBookings(abonado.id)).toBe(8)

    const paused = await withTenantContext(tenant.id, (tx) =>
      pauseAbonado(tenant.id, abonado.id, staff.id, tx),
    )

    expect(paused.status).toBe('paused')
    expect(await countFutureBookings(abonado.id)).toBe(0)
  })

  it('reactivates paused abonado and regenerates 8 weeks', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    const { abonado } = await withTenantContext(tenant.id, (tx) =>
      createAbonado(tenant.id, staff.id, {
        courtId,
        contactName: 'Reactivar Test',
        contactPhone: '0000000002',
        dayOfWeek: ABO_DOW,
        timeStart: '18:00',
        timeEnd: '19:00',
        pricePerSession: 800000,
        startsOn: ABO_START,
      }, tx),
    )

    await withTenantContext(tenant.id, (tx) =>
      pauseAbonado(tenant.id, abonado.id, staff.id, tx),
    )

    expect(await countFutureBookings(abonado.id)).toBe(0)

    const { abonado: reactivated, slotsGenerated } = await withTenantContext(tenant.id, (tx) =>
      reactivateAbonado(tenant.id, abonado.id, staff.id, tx),
    )

    expect(reactivated.status).toBe('active')
    expect(slotsGenerated).toBeGreaterThanOrEqual(8)
    expect(await countFutureBookings(abonado.id)).toBeGreaterThanOrEqual(8)
  })

  it('cancels abonado from date and preserves past bookings', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    const { abonado } = await withTenantContext(tenant.id, (tx) =>
      createAbonado(tenant.id, staff.id, {
        courtId,
        contactName: 'Cancelar Test',
        contactPhone: '0000000003',
        dayOfWeek: ABO_DOW,
        timeStart: '20:00',
        timeEnd: '21:00',
        pricePerSession: 800000,
        startsOn: ABO_START,
      }, tx),
    )

    // Manually insert a "past" booking (before ABO_START) to verify it's preserved
    await sql`
      INSERT INTO bookings (tenant_id, court_id, abonado_id, date, time_start, time_end,
        starts_at, ends_at,
        type, status, price_snapshot, deposit_amount, deposit_status)
      VALUES (
        ${tenant.id}, ${courtId}, ${abonado.id},
        ${'2025-01-06'}::date, '20:00'::time, '21:00'::time,
        (${'2025-01-06'}::date + '20:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
        (${'2025-01-06'}::date + '21:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
        'fixed', 'completed', ${800000}, 0, 'not_required'
      )
    `

    // Cancel from 3rd slot onward (2030-01-21)
    const fromDate = '2030-01-21'
    const canceled = await withTenantContext(tenant.id, (tx) =>
      cancelAbonado(tenant.id, abonado.id, fromDate, staff.id, tx),
    )

    expect(canceled.status).toBe('canceled')

    // Past booking preserved
    const pastRows = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM bookings
      WHERE abonado_id = ${abonado.id} AND date = '2025-01-06'::date
    `
    expect(pastRows[0]!.n).toBe(1)

    // Future bookings from fromDate deleted
    const futureRows = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM bookings
      WHERE abonado_id = ${abonado.id} AND date >= ${fromDate}::date
        AND status IN ('confirmed','pending_payment')
    `
    expect(futureRows[0]!.n).toBe(0)

    // Slots before fromDate preserved
    const beforeRows = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM bookings
      WHERE abonado_id = ${abonado.id} AND date >= ${ABO_START}::date AND date < ${fromDate}::date
    `
    expect(beforeRows[0]!.n).toBeGreaterThan(0)
  })

  it('rolling job: abonado with 3 future weeks → generates 4 more', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    const { abonado } = await withTenantContext(tenant.id, (tx) =>
      createAbonado(tenant.id, staff.id, {
        courtId,
        contactName: 'Rolling Test',
        contactPhone: '0000000004',
        dayOfWeek: ABO_DOW,
        timeStart: '09:00',
        timeEnd: '10:00',
        pricePerSession: 800000,
        startsOn: ABO_START,
      }, tx),
    )

    // Delete 5 of the 8 future bookings leaving 3
    await sql`
      DELETE FROM bookings
      WHERE abonado_id = ${abonado.id}
        AND date >= NOW()::date
        AND id IN (
          SELECT id FROM bookings
          WHERE abonado_id = ${abonado.id} AND date >= NOW()::date
          ORDER BY date DESC
          LIMIT 5
        )
    `

    expect(await countFutureBookings(abonado.id)).toBe(3)

    await runRollingSlotGeneration()

    expect(await countFutureBookings(abonado.id)).toBeGreaterThanOrEqual(4)
  })

  it('getAbonadoSlotConflicts returns all conflict dates (not just first)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    // Build 8 future Saturdays starting 2031-01-04
    // 2031-01-04 is a Saturday (dayOfWeek=6)
    const PREVIEW_START = '2031-01-04'
    const PREVIEW_DOW = 6 // Saturday

    // Generate the same 8 slot dates the preview action would use
    const { generateSlotDates } = await import('@/modules/abonados/slot-generator')
    const dates = generateSlotDates({
      dayOfWeek: PREVIEW_DOW,
      startsOn: PREVIEW_START,
      endsOn: null,
      fromDate: PREVIEW_START,
      count: 8,
      closedDates: [],
    })

    expect(dates).toHaveLength(8)

    // Seed conflicting bookings on the 2nd and 5th dates (index 1 and 4)
    const conflictDate1 = dates[1]!
    const conflictDate2 = dates[4]!

    await sql`
      INSERT INTO bookings (tenant_id, court_id, date, time_start, time_end,
        starts_at, ends_at,
        type, status, price_snapshot, deposit_amount, deposit_status)
      VALUES
        (${tenant.id}, ${courtId}, ${conflictDate1}::date, '14:00'::time, '15:00'::time,
         (${conflictDate1}::date + '14:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
         (${conflictDate1}::date + '15:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
         'spontaneous', 'confirmed', ${100000}, 0, 'not_required'),
        (${tenant.id}, ${courtId}, ${conflictDate2}::date, '14:00'::time, '15:00'::time,
         (${conflictDate2}::date + '14:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
         (${conflictDate2}::date + '15:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
         'spontaneous', 'confirmed', ${100000}, 0, 'not_required')
    `

    const conflicts = await withTenantContext(tenant.id, (tx) =>
      getAbonadoSlotConflicts(tenant.id, courtId, '14:00', '15:00', dates, tx),
    )

    // Should return both conflict dates (sorted)
    expect(conflicts).toHaveLength(2)
    expect(conflicts).toContain(conflictDate1)
    expect(conflicts).toContain(conflictDate2)
    expect(conflicts).toEqual([conflictDate1, conflictDate2].sort())

    // Non-conflicting dates should NOT appear
    for (const d of dates) {
      if (d !== conflictDate1 && d !== conflictDate2) {
        expect(conflicts).not.toContain(d)
      }
    }
  })

  it('PTR: createOnlineBooking creates player_tenant_relationships row', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    const player = await createTestPlayer(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    expect(await countPtrRows(player.id, tenant.id)).toBe(0)

    await withTenantContext(tenant.id, (tx) =>
      createOnlineBooking(tenant.id, {
        playerId: player.id,
        courtId,
        date: '2028-03-04',
        timeStart: '14:00',
        timeEnd: '15:00',
        requiresDeposit: false,
        depositPercentage: 0,
      }, tx),
    )

    expect(await countPtrRows(player.id, tenant.id)).toBe(1)
  })
})
