/**
 * "Dar por perdido" (docs/decisions/2026-11-07-cobrar-varios-y-dar-por-perdido.md):
 * el staff resigna lo que falta de un turno jugado. Tabla `booking_write_offs`,
 * saldo derivado (lo perdido se resta), nunca se acredita solo a las 24 h.
 *
 * Requires a running Supabase instance (`supabase start`) con DATABASE_URL.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('unexpected redirect')
  }),
}))
vi.mock('@/modules/staff/guards', () => ({ requireOperatorStaff: vi.fn() }))

import { requireOperatorStaff } from '@/modules/staff/guards'
import {
  chargeDebtAction,
  undoWriteOffAction,
  writeOffBookingAction,
} from '@/app/(admin)/caja/deudas/actions'
import { addBookingChargeAction } from '@/app/(admin)/reservas/actions'
import { getDebts } from '@/modules/bookings/booking.debts'
import { autoCreditBooking, findAutoCreditCandidates } from '@/modules/bookings/booking.auto-credit'
import { markNoShow } from '@/modules/bookings/booking.service'
import { getWrittenOffForDay } from '@/modules/cashflow/cashflow.service'
import { getWrittenOffForMonth } from '@/modules/reports/report.service'
import {
  getBookingCharges,
  listUnpaidGridBookingsBefore,
  sumBookingChargesByBooking,
} from '@/app/(admin)/reservas/queries'
import { artTodayStr } from '@/shared/dates/art'

const PRICE = 100_00
const HOUR = 3600_000
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString()

async function setup() {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)
  const [court] = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenant.id}, 'Cancha WO', 10, ${sql.json({ rules: [] })}, 'online')
    RETURNING id
  `
  vi.mocked(requireOperatorStaff).mockResolvedValue({
    ok: true,
    user: { staffUserId: staff.id },
    tenant: { id: tenant.id },
  } as never)
  return { sql, tenantId: tenant.id, staffId: staff.id, courtId: court!.id }
}

/** Turno que terminó hace `endedHoursAgo` horas, en el estado pedido; `updated_at` = cuando terminó. */
async function seedBooking(
  s: { tenantId: string; courtId: string },
  opts: { status?: 'completed' | 'confirmed'; endedHoursAgo?: number } = {},
) {
  const sql = getSql()
  const endedHoursAgo = opts.endedHoursAgo ?? 2
  const endsAt = ago(endedHoursAgo)
  const startsAt = ago(endedHoursAgo + 1)
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
      type, status, price_snapshot, deposit_amount, deposit_status, guest_name, updated_at
    )
    VALUES (
      ${s.tenantId}, ${s.courtId}, ${startsAt.slice(0, 10)}::date, '10:00', '11:00',
      ${startsAt}::timestamptz, ${endsAt}::timestamptz,
      'spontaneous', ${opts.status ?? 'completed'}::booking_status, ${PRICE}, 0,
      'not_required'::deposit_status, 'Joaco', ${endsAt}::timestamptz
    )
    RETURNING id
  `
  return row!.id
}

async function seedCharge(tenantId: string, staffId: string, bookingId: string, amount: number) {
  await getSql()`
    INSERT INTO cash_flows (tenant_id, type, category, amount, method, description,
                            booking_id, registered_by, occurred_at)
    VALUES (${tenantId}, 'income', 'booking', ${amount}, 'cash', 'Cobro de turno',
            ${bookingId}, ${staffId}, NOW())
  `
}

async function writeOffRows(bookingId: string) {
  return getSql()<{ amount: number }[]>`
    SELECT amount FROM booking_write_offs WHERE booking_id = ${bookingId}
  `
}

beforeAll(async () => {
  await ensureRoles()
})
beforeEach(async () => {
  vi.clearAllMocks()
  await cleanupAll()
})
afterAll(async () => {
  await cleanupAll()
  await closeSql()
})

describe('Dar por perdido — saldo y lecturas', () => {
  it('parcial + perdido → saldo 0, fuera de getDebts, de los candidatos y de la lista de no cobrados', async () => {
    const s = await setup()
    // 25 h: ya pasó el plazo de la acreditación automática (ends_at y updated_at).
    const id = await seedBooking(s, { endedHoursAgo: 25 })
    await seedCharge(s.tenantId, s.staffId, id, 40_00)

    const antes = await withTenantContext(s.tenantId, (tx) => getDebts(s.tenantId, tx))
    expect(antes.find((d) => d.id === id)?.pending).toBe(60_00)

    const res = await writeOffBookingAction({ bookingId: id, expectedPendingCents: 60_00 })
    expect(res).toEqual({ success: true, amount: 60_00 })

    const debts = await withTenantContext(s.tenantId, (tx) => getDebts(s.tenantId, tx))
    expect(debts.map((d) => d.id)).not.toContain(id)

    const candidates = await withTenantContext(s.tenantId, (tx) => findAutoCreditCandidates(tx))
    expect(candidates.map((c) => c.bookingId)).not.toContain(id)

    const credited = await withTenantContext(s.tenantId, (tx) =>
      autoCreditBooking(s.tenantId, id, s.staffId, tx),
    )
    expect(credited).toBe(0)

    const unpaid = await withTenantContext(s.tenantId, (tx) =>
      listUnpaidGridBookingsBefore(s.tenantId, artTodayStr(), tx, { limit: 10 }),
    )
    expect(unpaid.bookings.map((b) => b.id)).not.toContain(id)

    const detail = await withTenantContext(s.tenantId, (tx) =>
      getBookingCharges(s.tenantId, id, tx),
    )
    expect(detail.writtenOff).toBe(60_00)
  })

  it('un perdido con $0 cobrado aparece en sumBookingChargesByBooking (grilla)', async () => {
    const s = await setup()
    const id = await seedBooking(s)
    await writeOffBookingAction({ bookingId: id, expectedPendingCents: PRICE })

    const map = await withTenantContext(s.tenantId, (tx) =>
      sumBookingChargesByBooking(s.tenantId, [id], tx),
    )
    expect(map.get(id)).toMatchObject({ total: 0, writtenOff: PRICE })
  })

  it('deshacer devuelve el saldo', async () => {
    const s = await setup()
    const id = await seedBooking(s)
    await writeOffBookingAction({ bookingId: id, expectedPendingCents: PRICE })
    expect(await undoWriteOffAction({ bookingId: id })).toEqual({ success: true })

    expect(await writeOffRows(id)).toEqual([])
    const debts = await withTenantContext(s.tenantId, (tx) => getDebts(s.tenantId, tx))
    expect(debts.find((d) => d.id === id)?.pending).toBe(PRICE)
  })

  it('getWrittenOffForDay y getWrittenOffForMonth cuentan lo perdido (solo completed)', async () => {
    const s = await setup()
    const a = await seedBooking(s)
    const b = await seedBooking(s)
    await writeOffBookingAction({ bookingId: a, expectedPendingCents: PRICE })
    await writeOffBookingAction({ bookingId: b, expectedPendingCents: PRICE })

    const today = artTodayStr()
    const day = await withTenantContext(s.tenantId, (tx) =>
      getWrittenOffForDay(s.tenantId, today, 0, tx),
    )
    expect(day).toEqual({ totalCents: 2 * PRICE, count: 2 })

    const month = await getWrittenOffForMonth(s.tenantId, today.slice(0, 7), 0)
    expect(month).toEqual({ totalCents: 2 * PRICE, count: 2 })
  })
})

describe('Dar por perdido — la acción', () => {
  it('idempotente: repetir con el mismo monto da éxito sin duplicar', async () => {
    const s = await setup()
    const id = await seedBooking(s)
    await writeOffBookingAction({ bookingId: id, expectedPendingCents: PRICE })
    const again = await writeOffBookingAction({ bookingId: id, expectedPendingCents: PRICE })
    expect(again).toEqual({ success: true, amount: PRICE })
    expect(await writeOffRows(id)).toHaveLength(1)
  })

  it('un expectedPendingCents distinto rechaza y no escribe nada', async () => {
    const s = await setup()
    const id = await seedBooking(s)
    await seedCharge(s.tenantId, s.staffId, id, 30_00)
    const res = await writeOffBookingAction({ bookingId: id, expectedPendingCents: PRICE })
    expect(res).toEqual({
      success: false,
      error: 'El saldo cambió, revisá antes de darlo por perdido.',
    })
    expect(await writeOffRows(id)).toEqual([])
  })

  it('un turno confirmed ya terminado se completa en la misma tx; si el monto no coincide, rollback', async () => {
    const s = await setup()
    const id = await seedBooking(s, { status: 'confirmed' })

    const mal = await writeOffBookingAction({ bookingId: id, expectedPendingCents: PRICE - 1 })
    expect(mal.success).toBe(false)
    const [still] = await getSql()<
      { status: string }[]
    >`SELECT status FROM bookings WHERE id = ${id}`
    expect(still!.status).toBe('confirmed')

    const ok = await writeOffBookingAction({ bookingId: id, expectedPendingCents: PRICE })
    expect(ok).toEqual({ success: true, amount: PRICE })
    const [done] = await getSql()<
      { status: string }[]
    >`SELECT status FROM bookings WHERE id = ${id}`
    expect(done!.status).toBe('completed')
  })

  it('cobrar un turno perdido rechaza con el mensaje nuevo (las dos acciones de cobro)', async () => {
    const s = await setup()
    const id = await seedBooking(s)
    await writeOffBookingAction({ bookingId: id, expectedPendingCents: PRICE })

    const viaDebt = await chargeDebtAction({
      bookingId: id,
      charges: [{ amount: 10_00, method: 'cash' }],
    })
    expect(viaDebt).toEqual({ success: false, error: 'Este turno está dado por perdido.' })

    const viaAdd = await addBookingChargeAction({
      bookingId: id,
      charges: [{ amount: 10_00, method: 'cash' }],
    })
    expect(viaAdd).toMatchObject({ success: false, error: 'Este turno está dado por perdido.' })
  })

  it('markNoShow (completed → no_show dentro de las 24 h) borra el perdido y deja audit', async () => {
    const s = await setup()
    const id = await seedBooking(s)
    await writeOffBookingAction({ bookingId: id, expectedPendingCents: PRICE })

    await withTenantContext(s.tenantId, (tx) => markNoShow(id, s.staffId, tx))

    expect(await writeOffRows(id)).toEqual([])
    const audits = await getSql()<{ action: string }[]>`
      SELECT action FROM audit_logs WHERE resource_id = ${id} ORDER BY created_at
    `
    expect(audits.map((a) => a.action)).toEqual([
      'booking.written_off',
      'booking.write_off_cleared_by_no_show',
    ])
  })
})
