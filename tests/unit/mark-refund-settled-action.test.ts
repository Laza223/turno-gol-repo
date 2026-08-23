import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/staff/guards', () => ({ requireOperatorStaff: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/shared/db/client', () => ({
  withTenantContext: vi.fn(async (_id: string, cb: (tx: unknown) => unknown) => cb({})),
}))
vi.mock('@/modules/payments/refund.service', () => ({ markRefundSettled: vi.fn() }))
vi.mock('@/modules/cashflow/cashflow.service', () => ({ createCashFlow: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ captureMessage: vi.fn() }))

import { markRefundSettledAction } from '@/app/(admin)/caja/devoluciones/actions'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { markRefundSettled } from '@/modules/payments/refund.service'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { DayAlreadyClosedError } from '@/modules/cashflow/cashflow.errors'

const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const STAFF_ID = '00000000-0000-4000-8000-0000000000aa'
const REFUND_ID = '11111111-1111-4111-8111-111111111111'
const BOOKING_ID = '22222222-2222-4222-8222-222222222222'

const SETTLED = { refundPaymentId: REFUND_ID, bookingId: BOOKING_ID, amountCents: 500000 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireOperatorStaff).mockResolvedValue({
    ok: true,
    user: { staffUserId: STAFF_ID },
    tenant: { id: TENANT_ID },
  } as never)
  vi.mocked(adminRateLimited).mockResolvedValue(null as never)
  vi.mocked(markRefundSettled).mockResolvedValue(SETTLED)
})

describe('markRefundSettledAction — el movimiento de caja', () => {
  /**
   * La seña en efectivo entró a la caja como ingreso. Devolverla sin registrar
   * el egreso deja el efectivo esperado del cierre inflado, y el arqueo del día
   * da corto sin que nadie sepa por qué.
   */
  it('efectivo y transferencia generan el egreso', async () => {
    for (const method of ['cash', 'transfer'] as const) {
      vi.clearAllMocks()
      vi.mocked(requireOperatorStaff).mockResolvedValue({
        ok: true,
        user: { staffUserId: STAFF_ID },
        tenant: { id: TENANT_ID },
      } as never)
      vi.mocked(adminRateLimited).mockResolvedValue(null as never)
      vi.mocked(markRefundSettled).mockResolvedValue(SETTLED)

      const result = await markRefundSettledAction(REFUND_ID, method)

      expect(result).toEqual({ success: true })
      expect(vi.mocked(createCashFlow)).toHaveBeenCalledWith(
        TENANT_ID,
        STAFF_ID,
        expect.objectContaining({
          type: 'expense',
          method,
          amount: 500000,
          bookingId: BOOKING_ID,
        }),
        expect.anything(),
      )
    }
  })

  /** Una devolución por MercadoPago no saca plata del cajón. */
  it('MercadoPago no toca la caja', async () => {
    await markRefundSettledAction(REFUND_ID, 'mercadopago')
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })
})

describe('markRefundSettledAction — carreras y errores', () => {
  /**
   * Dos personas del staff tildan la misma devolución. La segunda encuentra la
   * fila ya en 'approved' y no escribe nada: un solo audit log, un solo
   * movimiento de caja.
   */
  it('si ya estaba saldada no duplica el movimiento de caja', async () => {
    vi.mocked(markRefundSettled).mockResolvedValue(undefined)

    const result = await markRefundSettledAction(REFUND_ID, 'cash')

    expect(result).toEqual({ success: true, alreadySettled: true })
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })

  /**
   * La plata ya se devolvió en la vida real. Perder ese registro porque la caja
   * de ese día está cerrada sería el peor de los dos males: se marca igual y se
   * avisa que el egreso quedó sin anotar.
   */
  it('con la caja cerrada registra la devolución igual, sin el egreso', async () => {
    vi.mocked(createCashFlow).mockRejectedValueOnce(new DayAlreadyClosedError('2026-08-20'))

    const result = await markRefundSettledAction(REFUND_ID, 'cash')

    expect(result).toMatchObject({ success: true, cashFlowSkipped: true })
    // Se reintenta el marcado fuera de la transacción que abortó.
    expect(vi.mocked(markRefundSettled)).toHaveBeenCalledTimes(2)
  })

  it('rechaza un id que no es UUID sin tocar la base', async () => {
    const result = await markRefundSettledAction('no-es-uuid', 'cash')
    expect(result).toEqual({ success: false, error: 'Datos inválidos.' })
    expect(vi.mocked(markRefundSettled)).not.toHaveBeenCalled()
  })

  it('rechaza un método que no existe', async () => {
    const result = await markRefundSettledAction(REFUND_ID, 'bitcoin')
    expect(result).toEqual({ success: false, error: 'Datos inválidos.' })
    expect(vi.mocked(markRefundSettled)).not.toHaveBeenCalled()
  })

  it('sin permisos no escribe nada', async () => {
    vi.mocked(requireOperatorStaff).mockResolvedValue({ ok: false, error: 'Sin permisos' } as never)
    const result = await markRefundSettledAction(REFUND_ID, 'cash')
    expect(result).toEqual({ success: false, error: 'Sin permisos' })
    expect(vi.mocked(markRefundSettled)).not.toHaveBeenCalled()
  })
})
