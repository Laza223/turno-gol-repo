import { beforeEach, describe, expect, it, vi } from 'vitest'

// Hallazgo recon (D4) 🔴: un refund hecho directo desde el dashboard de MP
// (fuera de prepareRefund/settleRefund) llega como webhook status='refunded'.
// dispatchPaymentInfo ya pisaba la fila `payments` vía upsertPaymentRow (sin
// tocar acá) sin dejar rastro de que fue EXTERNO ni avisar a nadie. Este test
// cubre SOLO la visibilidad agregada (audit log + Sentry) — no cambia el
// upsert existente ni ninguna transición de estado.

vi.mock('@/modules/bookings/booking.concurrency', () => ({
  transitionFromPendingPayment: vi.fn(),
}))
vi.mock('@/shared/db/audit', () => ({
  insertSystemAuditLog: vi.fn(),
}))
vi.mock('@/modules/notifications/notification.service', () => ({
  enqueueNotification: vi.fn(),
  enqueueTenantOwnerNotification: vi.fn(),
}))
vi.mock('@/modules/cashflow/cashflow.service', () => ({
  createCashFlow: vi.fn(),
}))
vi.mock('@/modules/staff/staff.service', () => ({
  getFirstActiveAdminStaffUserId: vi.fn(),
}))
vi.mock('@/lib/sentry', () => ({
  captureMessage: vi.fn(),
}))
vi.mock('@/shared/observability', () => ({
  track: { booking: vi.fn(), payment: vi.fn(), webhook: vi.fn() },
}))

import { dispatchPaymentInfo } from '@/modules/payments/payment.service'
import { insertSystemAuditLog } from '@/shared/db/audit'
import { captureMessage } from '@/lib/sentry'
import type { GatewayPaymentInfo } from '@/modules/payments/payment.types'

const TENANT_ID = 'tenant-1'
const BOOKING_ID = '11111111-1111-4111-8111-111111111111'
const PAYMENT_ID = 'pay-1'

const info: GatewayPaymentInfo = {
  mpPaymentId: 'mp-refund-1',
  status: 'refunded',
  amount: 30_000_00,
  externalReference: BOOKING_ID,
  paymentMethodId: 'visa',
}

/**
 * tx fake: 3 llamadas a tx.execute — la del upsert (relink OK, corta antes
 * del branch de INSERT), la del lookup de paymentId que agrega el hallazgo, y
 * (fix H1) la del lookup de refund local vinculado (`type='refund'` +
 * `description = 'Refund of ' + paymentId`, mismo vínculo que prepareRefund).
 */
function mockTx(options?: { hasLocalRefund?: boolean }) {
  const execute = vi.fn()
  execute.mockResolvedValueOnce([{ id: PAYMENT_ID }]) // upsertPaymentRow: relink OK
  execute.mockResolvedValueOnce([{ id: PAYMENT_ID }]) // lookup del paymentId para el audit
  execute.mockResolvedValueOnce(
    options?.hasLocalRefund ? [{ id: 'refund-pay-1' }] : [],
  ) // lookup de refund local conocido (fix H1)
  return { execute } as never
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('dispatchPaymentInfo — refund externo (fuera de prepareRefund/settleRefund)', () => {
  it('un webhook status=refunded sobre un pago approved inserta audit log + alerta Sentry', async () => {
    const tx = mockTx()
    const outcome = await dispatchPaymentInfo(info, TENANT_ID, tx)

    expect(outcome.alreadyProcessed).toBe(false)
    if (!outcome.alreadyProcessed) expect(outcome.result).toBe('refunded')

    expect(vi.mocked(insertSystemAuditLog)).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        tenantId: TENANT_ID,
        action: 'payment.external_refund_detected',
        resourceType: 'booking',
        resourceId: BOOKING_ID,
        metadata: expect.objectContaining({
          paymentId: PAYMENT_ID,
          mpPaymentId: info.mpPaymentId,
          bookingId: BOOKING_ID,
          amount: info.amount,
        }),
      }),
    )

    expect(vi.mocked(captureMessage)).toHaveBeenCalledWith(
      expect.stringContaining('external refund'),
      expect.objectContaining({
        level: 'warning',
        extra: expect.objectContaining({
          paymentId: PAYMENT_ID,
          mpPaymentId: info.mpPaymentId,
          bookingId: BOOKING_ID,
          tenantId: TENANT_ID,
        }),
      }),
    )
  })

  it('un webhook status=refunded con un refund LOCAL conocido (prepareRefund/settleRefund) no alerta', async () => {
    const tx = mockTx({ hasLocalRefund: true })
    const outcome = await dispatchPaymentInfo(info, TENANT_ID, tx)

    expect(outcome.alreadyProcessed).toBe(false)
    if (!outcome.alreadyProcessed) expect(outcome.result).toBe('refunded')

    // El upsert de la fila payments corre igual en ambos casos (no es lo que
    // se está testeando acá, pero confirma que el fix no lo tocó): lo prueba
    // implícitamente el hecho de que dispatchPaymentInfo no explota — el
    // upsert usa el mismo mock de execute que el caso externo.
    expect(vi.mocked(insertSystemAuditLog)).not.toHaveBeenCalled()
    expect(vi.mocked(captureMessage)).not.toHaveBeenCalled()
  })
})
