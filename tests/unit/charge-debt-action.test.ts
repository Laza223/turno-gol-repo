import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

// TOCTOU (Hallazgo C, mismo patrón que addBookingChargeAction —
// tests/unit/booking-charge-action.test.ts): chargeDebtAction leía el mismo
// `pending` sin lock y dos cobros concurrentes del mismo booking podían
// pasar ambos la validación (turno de $10.000 aceptaba 2×$8.000). El fix
// lockea la fila del booking (FOR UPDATE) ANTES de leer los charges.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/staff/guards', () => ({
  requireOperatorStaff: vi.fn(),
}))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn() }))
vi.mock('@/modules/cashflow/cashflow.service', () => ({ chargeSplitPayment: vi.fn() }))
vi.mock('@/modules/bans/ban.service', () => ({
  banPlayerManually: vi.fn(),
  resolveManualBanUntil: vi.fn(),
}))

import { chargeDebtAction } from '@/app/(admin)/caja/deudas/actions'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { chargeSplitPayment } from '@/modules/cashflow/cashflow.service'

const BOOKING_ID = '11111111-1111-4111-8111-111111111111'

type BookingRow = {
  status: string
  priceSnapshot: number
  depositAmount: number
  depositStatus: string
}

/**
 * withTenantContext mockeado: corre el callback con un tx cuyo execute()
 * devuelve, EN ORDEN, cada array de `responses` (una entrada por cada
 * `tx.execute(...)` que dispare chargeDebtAction: SELECT del booking, FOR
 * UPDATE del lock, SELECT de getBookingCharges).
 */
function mockTx(responses: unknown[][]) {
  const execute = vi.fn()
  for (const r of responses) execute.mockResolvedValueOnce(r)
  const tx = { execute }
  vi.mocked(withTenantContext).mockImplementation(
    (async (_id: string, cb: (t: never) => Promise<unknown>) => cb(tx as never)) as never,
  )
  return tx
}

function bookingRow(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    status: 'completed',
    priceSnapshot: 100_00,
    depositAmount: 0,
    depositStatus: 'not_required',
    ...overrides,
  }
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

describe('chargeDebtAction', () => {
  it('rechaza una reserva que no está en estado completed', async () => {
    mockTx([[bookingRow({ status: 'confirmed' })]])
    const res = await chargeDebtAction({
      bookingId: BOOKING_ID,
      charges: [{ amount: 20_000_00, method: 'cash' }],
    })
    expect(res.success).toBe(false)
    expect(vi.mocked(chargeSplitPayment)).not.toHaveBeenCalled()
  })

  it('rechaza una reserva inexistente', async () => {
    mockTx([[]])
    const res = await chargeDebtAction({
      bookingId: BOOKING_ID,
      charges: [{ amount: 20_000_00, method: 'cash' }],
    })
    expect(res.success).toBe(false)
    expect(vi.mocked(chargeSplitPayment)).not.toHaveBeenCalled()
  })

  it('rechaza un cobro total que supera el saldo pendiente', async () => {
    mockTx([
      [bookingRow({ priceSnapshot: 100_00 })], // SELECT booking
      [], // FOR UPDATE lock del booking (Hallazgo C)
      [], // getBookingCharges: sin cobros previos
    ])
    const res = await chargeDebtAction({
      bookingId: BOOKING_ID,
      charges: [{ amount: 570_00, method: 'cash' }],
    })
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toMatch(/supera lo pendiente/i)
    }
    expect(vi.mocked(chargeSplitPayment)).not.toHaveBeenCalled()
  })

  it('acepta y registra un cobro dentro del saldo pendiente', async () => {
    mockTx([
      [bookingRow({ priceSnapshot: 100_00 })],
      [],
      [],
    ])
    vi.mocked(chargeSplitPayment).mockResolvedValue([{ id: 'cf-1' }] as never)

    const res = await chargeDebtAction({
      bookingId: BOOKING_ID,
      charges: [{ amount: 100_00, method: 'cash' }],
    })

    expect(res.success).toBe(true)
    expect(vi.mocked(chargeSplitPayment)).toHaveBeenCalledWith(
      'tenant-1',
      'staff-1',
      [{ amount: 100_00, method: 'cash' }],
      expect.any(Function),
      undefined,
      expect.anything(),
    )
    const build = vi.mocked(chargeSplitPayment).mock.calls[0]![3]
    expect(build({ amount: 100_00, method: 'cash' }, 0)).toEqual(
      expect.objectContaining({
        type: 'income',
        category: 'booking',
        bookingId: BOOKING_ID,
      }),
    )
  })

  // Hallazgo C (TOCTOU): la validación del monto tiene que leer los charges
  // DESPUÉS de haber tomado el lock de la fila — si no, dos cobros
  // concurrentes leen el mismo pendiente y ambos pasan.
  it('toma el FOR UPDATE del booking antes de leer los charges', async () => {
    const dialect = new PgDialect()
    const tx = mockTx([
      [bookingRow({ priceSnapshot: 100_00 })], // SELECT booking
      [], // FOR UPDATE lock del booking
      [], // getBookingCharges: sin cobros previos
    ])
    vi.mocked(chargeSplitPayment).mockResolvedValue([{ id: 'cf-locked' }] as never)

    const res = await chargeDebtAction({
      bookingId: BOOKING_ID,
      charges: [{ amount: 50_00, method: 'cash' }],
    })

    expect(res.success).toBe(true)
    const queries = vi
      .mocked(tx.execute)
      .mock.calls.map(([q]) => dialect.sqlToQuery(q as SQL))
    const lockIdx = queries.findIndex((q) => q.sql.includes('FOR UPDATE'))
    const chargesIdx = queries.findIndex(
      (q) => /FROM cash_flows/i.test(q.sql) && /booking_id/i.test(q.sql),
    )
    expect(lockIdx).toBeGreaterThanOrEqual(0)
    expect(chargesIdx).toBeGreaterThan(lockIdx)
  })
})
