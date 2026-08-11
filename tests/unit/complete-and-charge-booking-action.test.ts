import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

// TOCTOU (Hallazgo C, mismo patrón que addBookingChargeAction —
// tests/unit/booking-charge-action.test.ts): la validación de
// completeAndChargeBookingAction también tiene que leer los charges DESPUÉS
// de lockear la fila del booking. completeBooking() ya deja la fila lockeada
// vía su propio UPDATE (WHERE status='confirmed'), pero el FOR UPDATE
// explícito documenta esa dependencia y blinda el código si eso cambiara.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/staff/guards', () => ({
  requireOperatorStaff: vi.fn(),
  requireAdminStaffAction: vi.fn(),
}))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn(), getDb: vi.fn() }))
vi.mock('@/modules/cashflow/cashflow.service', () => ({ createCashFlow: vi.fn() }))
vi.mock('@/modules/bookings/booking.service', () => ({
  createManualBooking: vi.fn(),
  completeBooking: vi.fn(),
  getAvailableSlots: vi.fn(),
}))
vi.mock('@/modules/bookings/booking.concurrency', () => ({
  transitionFromPendingPayment: vi.fn(),
}))
vi.mock('@/modules/bookings/booking.cancellation', () => ({
  cancelByAdmin: vi.fn(),
  handleNoShow: vi.fn(),
}))
vi.mock('@/modules/payments/mp-oauth', () => ({ resolveTenantGateway: vi.fn() }))

import { completeAndChargeBookingAction } from '@/app/(admin)/reservas/actions'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { completeBooking } from '@/modules/bookings/booking.service'

const BOOKING_ID = '11111111-1111-4111-8111-111111111111'

type FakeBookingRow = {
  id: string
  priceSnapshot: number
  depositAmount: number
  depositStatus: string
  notesInternal: string | null
}

function fakeBooking(overrides: Partial<FakeBookingRow> = {}): FakeBookingRow {
  return {
    id: BOOKING_ID,
    priceSnapshot: 100_00,
    depositAmount: 0,
    depositStatus: 'not_required',
    notesInternal: null,
    ...overrides,
  }
}

/**
 * withTenantContext mockeado: corre el callback con un tx cuyo execute()
 * devuelve, EN ORDEN, cada array de `responses` (una entrada por cada
 * `tx.execute(...)` dentro de la tx — completeBooking() está mockeado
 * aparte y NO dispara tx.execute acá).
 */
function mockTx(responses: unknown[][]) {
  const execute = vi.fn()
  for (const r of responses) execute.mockResolvedValueOnce(r)
  const tx = { execute }
  vi.mocked(withTenantContext).mockImplementation((async (
    _id: string,
    cb: (t: never) => Promise<unknown>,
  ) => cb(tx as never)) as never)
  return tx
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireOperatorStaff).mockResolvedValue({
    ok: true,
    user: { staffUserId: 'staff-1' },
    tenant: { id: 'tenant-1' },
  } as never)
  vi.mocked(adminRateLimited).mockResolvedValue(null as never)
})

describe('completeAndChargeBookingAction', () => {
  it('rechaza un cobro total que supera el saldo pendiente', async () => {
    vi.mocked(completeBooking).mockResolvedValue(fakeBooking({ priceSnapshot: 100_00 }) as never)
    mockTx([
      [], // FOR UPDATE lock del booking (Hallazgo C)
      [], // getBookingCharges: sin cobros previos
    ])

    const res = await completeAndChargeBookingAction({
      bookingId: BOOKING_ID,
      charges: [{ amount: 570_00, method: 'cash' }],
    })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toMatch(/supera lo pendiente/i)
    }
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })

  it('completa y cobra dentro del saldo pendiente', async () => {
    vi.mocked(completeBooking).mockResolvedValue(fakeBooking({ priceSnapshot: 100_00 }) as never)
    mockTx([
      [], // FOR UPDATE lock del booking (Hallazgo C)
      [], // getBookingCharges: sin cobros previos
    ])
    vi.mocked(createCashFlow).mockResolvedValue({ id: 'cf-1' } as never)

    const res = await completeAndChargeBookingAction({
      bookingId: BOOKING_ID,
      charges: [{ amount: 100_00, method: 'cash' }],
    })

    expect(res.success).toBe(true)
    expect(vi.mocked(createCashFlow)).toHaveBeenCalledWith(
      'tenant-1',
      'staff-1',
      expect.objectContaining({
        type: 'income',
        category: 'booking',
        amount: 100_00,
        method: 'cash',
        bookingId: BOOKING_ID,
      }),
      expect.anything(),
    )
  })

  // Hallazgo C (TOCTOU): la validación del monto tiene que leer los charges
  // DESPUÉS del FOR UPDATE explícito — mismo patrón que addBookingChargeAction
  // y chargeDebtAction.
  it('toma el FOR UPDATE del booking antes de leer los charges', async () => {
    const dialect = new PgDialect()
    vi.mocked(completeBooking).mockResolvedValue(fakeBooking({ priceSnapshot: 100_00 }) as never)
    const tx = mockTx([
      [], // FOR UPDATE lock del booking
      [], // getBookingCharges: sin cobros previos
    ])
    vi.mocked(createCashFlow).mockResolvedValue({ id: 'cf-locked' } as never)

    const res = await completeAndChargeBookingAction({
      bookingId: BOOKING_ID,
      charges: [{ amount: 50_00, method: 'cash' }],
    })

    expect(res.success).toBe(true)
    const queries = vi.mocked(tx.execute).mock.calls.map(([q]) => dialect.sqlToQuery(q as SQL))
    const lockIdx = queries.findIndex((q) => q.sql.includes('FOR UPDATE'))
    const chargesIdx = queries.findIndex(
      (q) => /FROM cash_flows/i.test(q.sql) && /booking_id/i.test(q.sql),
    )
    expect(lockIdx).toBeGreaterThanOrEqual(0)
    expect(chargesIdx).toBeGreaterThan(lockIdx)
  })

  it('no toma el lock ni valida charges cuando charges está vacío (solo nota de deuda)', async () => {
    vi.mocked(completeBooking).mockResolvedValue(fakeBooking({ priceSnapshot: 100_00 }) as never)
    const tx = mockTx([]) // sin tx.execute alguno dentro de la tx

    const res = await completeAndChargeBookingAction({
      bookingId: BOOKING_ID,
      charges: [],
    })

    expect(res.success).toBe(true)
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
    expect(vi.mocked(tx.execute)).not.toHaveBeenCalled()
  })
})
