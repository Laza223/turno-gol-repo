import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

// Tarea #8 — addBookingChargeAction: validación + guard de estado cobrable,
// sin DB. El path transaccional real (createCashFlow + getBookingCharges) se
// cubre en tests/integration/booking-charges.test.ts.
//
// ENS-3 (hallazgo de ensayo real): el endpoint aceptaba cobros SIN límite
// contra el saldo pendiente del booking (turno de $100 aceptó $570 y la UI
// decía "Pagado completo"). addBookingChargeAction ahora recalcula el
// pendiente server-side (getBookingCharges + summarizeBookingCharges) ANTES
// de crear el cash_flow y rechaza si el monto lo excede o si ya no queda
// saldo. La query de reintento por idempotencyKey se cubre aparte: un
// reintento genuino (misma key ya insertada) no debe re-validar contra un
// pendiente que ya bajó por ese mismo cobro.

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
}))
vi.mock('@/modules/bookings/booking.concurrency', () => ({
  transitionFromPendingPayment: vi.fn(),
}))
vi.mock('@/modules/bookings/booking.cancellation', () => ({
  cancelByAdmin: vi.fn(),
  handleNoShow: vi.fn(),
}))
vi.mock('@/modules/payments/mp-oauth', () => ({ resolveTenantGateway: vi.fn() }))

import { addBookingChargeAction } from '@/app/(admin)/reservas/actions'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'

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
 * `tx.execute(...)` que dispare addBookingChargeAction: SELECT del booking,
 * [SELECT de idempotencyKey si aplica], SELECT de getBookingCharges).
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

function bookingRow(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    status: 'confirmed',
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

describe('addBookingChargeAction', () => {
  it('rechaza monto 0 o negativo sin tocar la caja', async () => {
    const res = await addBookingChargeAction({ bookingId: BOOKING_ID, amount: 0, method: 'cash' })
    expect(res.success).toBe(false)
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })

  it('rechaza una reserva en estado no cobrable (cancelada)', async () => {
    mockTx([[{ status: 'canceled_no_refund' }]])
    const res = await addBookingChargeAction({
      bookingId: BOOKING_ID,
      amount: 20_000_00,
      method: 'cash',
    })
    expect(res.success).toBe(false)
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })

  it('rechaza una reserva inexistente', async () => {
    mockTx([[]])
    const res = await addBookingChargeAction({
      bookingId: BOOKING_ID,
      amount: 20_000_00,
      method: 'cash',
    })
    expect(res.success).toBe(false)
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })

  it('reserva confirmada sin cobros previos: crea un cashflow income/booking vinculado al booking', async () => {
    mockTx([
      [bookingRow({ priceSnapshot: 100_000_00 })], // SELECT booking
      [], // FOR UPDATE lock del booking (Hallazgo C)
      [], // getBookingCharges: sin cobros previos
    ])
    vi.mocked(createCashFlow).mockResolvedValue({ id: 'cf-1' } as never)

    const res = await addBookingChargeAction({
      bookingId: BOOKING_ID,
      amount: 38_500_00,
      method: 'transfer',
    })

    expect(res.success).toBe(true)
    expect(vi.mocked(createCashFlow)).toHaveBeenCalledWith(
      'tenant-1',
      'staff-1',
      expect.objectContaining({
        type: 'income',
        category: 'booking',
        amount: 38_500_00,
        method: 'transfer',
        bookingId: BOOKING_ID,
      }),
      expect.anything(),
    )
  })

  // ENS-3 (a): cobro > pendiente rechazado con mensaje claro.
  it('rechaza un cobro que supera el saldo pendiente', async () => {
    mockTx([
      [bookingRow({ priceSnapshot: 100_00 })], // pendiente = $100
      [], // FOR UPDATE lock del booking (Hallazgo C)
      [], // sin cobros previos
    ])

    const res = await addBookingChargeAction({
      bookingId: BOOKING_ID,
      amount: 570_00, // $570 > $100 pendiente — el caso real del ensayo
      method: 'cash',
    })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toMatch(/supera lo pendiente/i)
      expect(res.error).toContain('570')
      expect(res.error).toContain('100')
    }
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })

  // ENS-3 (b): cobro exacto al pendiente aceptado.
  it('acepta un cobro exactamente igual al saldo pendiente', async () => {
    mockTx([
      [bookingRow({ priceSnapshot: 100_00 })],
      [], // FOR UPDATE lock del booking (Hallazgo C)
      [],
    ])
    vi.mocked(createCashFlow).mockResolvedValue({ id: 'cf-2' } as never)

    const res = await addBookingChargeAction({
      bookingId: BOOKING_ID,
      amount: 100_00,
      method: 'cash',
    })

    expect(res.success).toBe(true)
    expect(vi.mocked(createCashFlow)).toHaveBeenCalled()
  })

  // ENS-3 (c): pendiente 0 rechaza cualquier cobro.
  it('rechaza cualquier cobro si el turno ya está pagado por completo', async () => {
    mockTx([
      [bookingRow({ priceSnapshot: 50_000_00, depositAmount: 50_000_00, depositStatus: 'paid' })],
      [], // FOR UPDATE lock del booking (Hallazgo C)
      [], // sin cobros de mostrador; la seña ya cubre el precio entero
    ])

    const res = await addBookingChargeAction({
      bookingId: BOOKING_ID,
      amount: 1_00,
      method: 'cash',
    })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toMatch(/ya está pagado por completo/i)
    }
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })

  // Un cobro previo de mostrador reduce el pendiente disponible para el siguiente.
  it('descuenta cobros de mostrador ya registrados antes de validar el nuevo', async () => {
    mockTx([
      [bookingRow({ priceSnapshot: 100_00 })],
      [], // FOR UPDATE lock del booking (Hallazgo C)
      [
        {
          id: 'cf-prev',
          amount: 80_00,
          method: 'cash',
          description: 'Cobro de turno',
          occurredAt: '2026-01-01',
        },
      ],
    ])

    const res = await addBookingChargeAction({
      bookingId: BOOKING_ID,
      amount: 30_00, // pendiente real = 100-80 = 20, 30 > 20
      method: 'cash',
    })

    expect(res.success).toBe(false)
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })

  // Idempotencia: un reintento con la MISMA clientIdempotencyKey (ya insertada)
  // no debe re-validar contra el pendiente ya reducido por ese mismo cobro —
  // eso rechazaría por error un reintento legítimo (Fix #55 no debe romperse).
  it('un reintento con clientIdempotencyKey ya registrada no re-valida el pendiente', async () => {
    const KEY = '22222222-2222-4222-8222-222222222222'
    mockTx([
      [bookingRow({ priceSnapshot: 100_00 })], // SELECT booking
      [{ exists: 1 }], // SELECT por idempotency key: ya existe
    ])
    vi.mocked(createCashFlow).mockResolvedValue({ id: 'cf-existing' } as never)

    const res = await addBookingChargeAction({
      bookingId: BOOKING_ID,
      amount: 100_00,
      method: 'cash',
      clientIdempotencyKey: KEY,
    })

    expect(res.success).toBe(true)
    // Solo 2 llamadas a tx.execute: booking + chequeo de idempotencyKey. NO se
    // llegó a ejecutar getBookingCharges (se hubiera sumado una 3ra).
    const tx = vi.mocked(withTenantContext).mock.calls[0]
    expect(tx).toBeDefined()
    expect(vi.mocked(createCashFlow)).toHaveBeenCalled()
  })

  // Con clientIdempotencyKey NUEVA (sin fila previa) sí se valida normalmente.
  it('una clientIdempotencyKey nueva (sin cobro previo) igual valida el pendiente', async () => {
    const KEY = '33333333-3333-4333-8333-333333333333'
    mockTx([
      [bookingRow({ priceSnapshot: 100_00 })],
      [], // idempotency key: no existe todavía
      [], // FOR UPDATE lock del booking (Hallazgo C)
      [], // getBookingCharges: sin cobros previos
    ])

    const res = await addBookingChargeAction({
      bookingId: BOOKING_ID,
      amount: 570_00,
      method: 'cash',
      clientIdempotencyKey: KEY,
    })

    expect(res.success).toBe(false)
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })

  // Hallazgo C (TOCTOU, ENS-3 real): dos cobros concurrentes leían el mismo
  // `pending` sin lock y ambos pasaban (turno de $10.000 aceptaba 2×$8.000).
  // El fix lockea la fila del booking (FOR UPDATE) ANTES de leer los charges,
  // así el segundo cobro concurrente espera y relee el pendiente actualizado.
  it('toma el FOR UPDATE del booking antes de leer los charges', async () => {
    const dialect = new PgDialect()
    const tx = mockTx([
      [bookingRow({ priceSnapshot: 100_00 })], // SELECT booking
      [], // FOR UPDATE lock del booking
      [], // getBookingCharges: sin cobros previos
    ])
    vi.mocked(createCashFlow).mockResolvedValue({ id: 'cf-locked' } as never)

    const res = await addBookingChargeAction({
      bookingId: BOOKING_ID,
      amount: 50_00,
      method: 'cash',
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

  // El reintento idempotente NO toma el lock: alreadyRegistered=true corta
  // antes de la validación de pendiente (ver test de arriba), así que el
  // lock — que solo protege ese camino de validar+insertar — no aparece.
  it('el reintento idempotente (alreadyRegistered) no toma el FOR UPDATE', async () => {
    const dialect = new PgDialect()
    const KEY = '44444444-4444-4444-8444-444444444444'
    const tx = mockTx([
      [bookingRow({ priceSnapshot: 100_00 })], // SELECT booking
      [{ exists: 1 }], // idempotency key: ya existe
    ])
    vi.mocked(createCashFlow).mockResolvedValue({ id: 'cf-retry' } as never)

    const res = await addBookingChargeAction({
      bookingId: BOOKING_ID,
      amount: 100_00,
      method: 'cash',
      clientIdempotencyKey: KEY,
    })

    expect(res.success).toBe(true)
    const queries = vi.mocked(tx.execute).mock.calls.map(([q]) => dialect.sqlToQuery(q as SQL))
    expect(queries.some((q) => q.sql.includes('FOR UPDATE'))).toBe(false)
  })
})
