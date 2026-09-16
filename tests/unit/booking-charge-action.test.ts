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
//
// D3 (2026-09-15): la acción pasó de {amount, method} a {charges: [...]}
// (1..5 líneas, mismo patrón que completeAndChargeBookingAction) para que el
// adelanto también admita pago dividido. La idempotencia es POR LÍNEA
// (`${key}-${i}`) — el dedupe de reintento chequea CADA línea por su propia
// key sufijada (no solo la 0): lo ya commiteado no se re-valida, pero una
// línea NUEVA agregada a un reintento con la MISMA key siempre se valida
// contra el pendiente recalculado (revisión roja, sobrecobro).

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
    const res = await addBookingChargeAction({
      bookingId: BOOKING_ID,
      charges: [{ amount: 0, method: 'cash' }],
    })
    expect(res.success).toBe(false)
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })

  it('rechaza 0 líneas', async () => {
    const res = await addBookingChargeAction({ bookingId: BOOKING_ID, charges: [] })
    expect(res.success).toBe(false)
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })

  it('rechaza más de 5 líneas', async () => {
    const res = await addBookingChargeAction({
      bookingId: BOOKING_ID,
      charges: Array.from({ length: 6 }, () => ({ amount: 1_00, method: 'cash' as const })),
    })
    expect(res.success).toBe(false)
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })

  it('rechaza una reserva en estado no cobrable (cancelada)', async () => {
    mockTx([[{ status: 'canceled_no_refund' }]])
    const res = await addBookingChargeAction({
      bookingId: BOOKING_ID,
      charges: [{ amount: 20_000_00, method: 'cash' }],
    })
    expect(res.success).toBe(false)
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })

  it('rechaza una reserva inexistente', async () => {
    mockTx([[]])
    const res = await addBookingChargeAction({
      bookingId: BOOKING_ID,
      charges: [{ amount: 20_000_00, method: 'cash' }],
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
      charges: [{ amount: 38_500_00, method: 'transfer' }],
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
      charges: [{ amount: 570_00, method: 'cash' }], // $570 > $100 pendiente — el caso real del ensayo
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
      charges: [{ amount: 100_00, method: 'cash' }],
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
      charges: [{ amount: 1_00, method: 'cash' }],
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
      charges: [{ amount: 30_00, method: 'cash' }], // pendiente real = 100-80 = 20, 30 > 20
    })

    expect(res.success).toBe(false)
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })

  // D3: adelanto dividido en varios métodos — la SUMA de las líneas se valida
  // contra el pendiente, no cada línea por separado.
  it('acepta varias líneas y suma su total contra el pendiente', async () => {
    mockTx([
      [bookingRow({ priceSnapshot: 100_00 })],
      [], // FOR UPDATE lock del booking (Hallazgo C)
      [], // sin cobros previos
    ])
    vi.mocked(createCashFlow).mockResolvedValue({ id: 'cf-line' } as never)

    const res = await addBookingChargeAction({
      bookingId: BOOKING_ID,
      charges: [
        { amount: 60_00, method: 'cash' },
        { amount: 40_00, method: 'transfer' },
      ],
    })

    expect(res.success).toBe(true)
    expect(vi.mocked(createCashFlow)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(createCashFlow)).toHaveBeenNthCalledWith(
      1,
      'tenant-1',
      'staff-1',
      expect.objectContaining({ amount: 60_00, method: 'cash' }),
      expect.anything(),
    )
    expect(vi.mocked(createCashFlow)).toHaveBeenNthCalledWith(
      2,
      'tenant-1',
      'staff-1',
      expect.objectContaining({ amount: 40_00, method: 'transfer' }),
      expect.anything(),
    )
  })

  it('rechaza si la SUMA de las líneas supera el pendiente, aunque cada una quepa individualmente', async () => {
    mockTx([
      [bookingRow({ priceSnapshot: 100_00 })],
      [], // FOR UPDATE lock del booking (Hallazgo C)
      [],
    ])

    const res = await addBookingChargeAction({
      bookingId: BOOKING_ID,
      charges: [
        { amount: 60_00, method: 'cash' },
        { amount: 60_00, method: 'transfer' }, // 60+60 = 120 > 100 pendiente
      ],
    })

    expect(res.success).toBe(false)
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })

  // Idempotencia POR LÍNEA: cada cash_flow se inserta con `${key}-${i}`, y el
  // dedupe de reintento chequea la existencia de CADA key sufijada.
  it('inserta cada línea con su propia clientIdempotencyKey (`${key}-${i}`)', async () => {
    const KEY = '66666666-6666-4666-8666-666666666666'
    mockTx([
      [bookingRow({ priceSnapshot: 100_00 })],
      [], // idempotency key: no existe todavía
      [], // FOR UPDATE lock del booking (Hallazgo C)
      [], // getBookingCharges: sin cobros previos
    ])
    vi.mocked(createCashFlow).mockResolvedValue({ id: 'cf-multi' } as never)

    const res = await addBookingChargeAction({
      bookingId: BOOKING_ID,
      charges: [
        { amount: 60_00, method: 'cash' },
        { amount: 40_00, method: 'transfer' },
      ],
      clientIdempotencyKey: KEY,
    })

    expect(res.success).toBe(true)
    expect(vi.mocked(createCashFlow)).toHaveBeenNthCalledWith(
      1,
      'tenant-1',
      'staff-1',
      expect.objectContaining({ clientIdempotencyKey: `${KEY}-0` }),
      expect.anything(),
    )
    expect(vi.mocked(createCashFlow)).toHaveBeenNthCalledWith(
      2,
      'tenant-1',
      'staff-1',
      expect.objectContaining({ clientIdempotencyKey: `${KEY}-1` }),
      expect.anything(),
    )
  })

  // Idempotencia: un reintento con la MISMA clientIdempotencyKey (ya insertada
  // como línea 0) no debe re-validar contra el pendiente ya reducido por ese
  // mismo cobro — eso rechazaría por error un reintento legítimo (Fix #55 no
  // debe romperse).
  it('un reintento con clientIdempotencyKey ya registrada (línea 0) no re-valida el pendiente', async () => {
    const KEY = '22222222-2222-4222-8222-222222222222'
    mockTx([
      [bookingRow({ priceSnapshot: 100_00 })], // SELECT booking
      [{ key: `${KEY}-0` }], // SELECT por idempotency key: `${KEY}-0` ya existe
    ])
    vi.mocked(createCashFlow).mockResolvedValue({ id: 'cf-existing' } as never)

    const res = await addBookingChargeAction({
      bookingId: BOOKING_ID,
      charges: [{ amount: 100_00, method: 'cash' }],
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
      charges: [{ amount: 570_00, method: 'cash' }],
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

  // Mismo patrón de fuga que el hallazgo #8 de la campaña de mutación
  // (cashflow.service.ts / canteen-tab.service.ts / canteen-sale.service.ts):
  // el índice único de client_idempotency_key en cash_flows es GLOBAL (migr.
  // 023), sin tenant_id. El SELECT de dedupe acá debe filtrar por tenant_id
  // explícitamente además de RLS (CLAUDE.md) o un complejo B puede leer un
  // reintento idempotente insertado por el complejo A y tratarlo como propio.
  it('el SELECT de dedupe por clientIdempotencyKey (línea 0) filtra por tenant_id', async () => {
    const dialect = new PgDialect()
    const KEY = '55555555-5555-4555-8555-555555555555'
    const tx = mockTx([
      [bookingRow({ priceSnapshot: 100_00 })], // SELECT booking
      [{ key: `${KEY}-0` }], // SELECT por idempotency key: ya existe
    ])
    vi.mocked(createCashFlow).mockResolvedValue({ id: 'cf-tenant-scoped' } as never)

    const res = await addBookingChargeAction({
      bookingId: BOOKING_ID,
      charges: [{ amount: 100_00, method: 'cash' }],
      clientIdempotencyKey: KEY,
    })

    expect(res.success).toBe(true)
    const queries = vi.mocked(tx.execute).mock.calls.map(([q]) => dialect.sqlToQuery(q as SQL))
    const dedupeQuery = queries.find((q) => q.sql.includes('client_idempotency_key'))
    expect(dedupeQuery).toBeDefined()
    expect(dedupeQuery!.sql).toMatch(/tenant_id/)
    expect(dedupeQuery!.params).toContain(`${KEY}-0`)
    expect(dedupeQuery!.params).toContain('tenant-1')
  })

  // Revisión roja: un reintento que reusa la MISMA key pero AGREGA una línea
  // nueva no debe saltear la validación de esa línea nueva solo porque la
  // línea 0 ya esté commiteada. Turno pagado por completo con la línea 0
  // ($100) + retry mutado que agrega una línea 1 ($40) tiene que rechazarse:
  // la línea nueva SÍ se valida contra el pendiente recalculado (que ya
  // descuenta lo que la línea 0 cobró), en vez de saltear todo el lote.
  it('un reintento con la MISMA key pero una línea NUEVA valida esa línea contra el pendiente real', async () => {
    const KEY = '77777777-7777-4777-8777-777777777777'
    mockTx([
      [bookingRow({ priceSnapshot: 100_00 })], // SELECT booking: pendiente total $100
      [{ key: `${KEY}-0` }], // dedupe: solo la línea 0 ya existe, la 1 es nueva
      [], // FOR UPDATE lock del booking (hay línea nueva que valida)
      [
        {
          id: 'cf-line0',
          amount: 100_00,
          method: 'cash',
          description: 'Cobro de turno',
          occurredAt: '2026-01-01',
        },
      ], // getBookingCharges: la línea 0 ya cobró el pendiente entero
    ])

    const res = await addBookingChargeAction({
      bookingId: BOOKING_ID,
      charges: [
        { amount: 100_00, method: 'cash' }, // línea 0: ya commiteada, no se re-valida
        { amount: 40_00, method: 'transfer' }, // línea 1: nueva, sobrecobro
      ],
      clientIdempotencyKey: KEY,
    })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toMatch(/ya está pagado por completo/i)
    }
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })

  // El reintento idempotente NO toma el lock: alreadyRegistered=true corta
  // antes de la validación de pendiente (ver test de arriba), así que el
  // lock — que solo protege ese camino de validar+insertar — no aparece.
  it('el reintento idempotente (alreadyRegistered) no toma el FOR UPDATE', async () => {
    const dialect = new PgDialect()
    const KEY = '44444444-4444-4444-8444-444444444444'
    const tx = mockTx([
      [bookingRow({ priceSnapshot: 100_00 })], // SELECT booking
      [{ key: `${KEY}-0` }], // idempotency key: ya existe
    ])
    vi.mocked(createCashFlow).mockResolvedValue({ id: 'cf-retry' } as never)

    const res = await addBookingChargeAction({
      bookingId: BOOKING_ID,
      charges: [{ amount: 100_00, method: 'cash' }],
      clientIdempotencyKey: KEY,
    })

    expect(res.success).toBe(true)
    const queries = vi.mocked(tx.execute).mock.calls.map(([q]) => dialect.sqlToQuery(q as SQL))
    expect(queries.some((q) => q.sql.includes('FOR UPDATE'))).toBe(false)
  })
})
