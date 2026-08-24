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
import {
  enqueueNotification,
  enqueueTenantOwnerNotification,
} from '@/modules/notifications/notification.service'
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
 * tx fake. Llamadas a tx.execute, en orden.
 *
 * Sin refund local conocido (refund EXTERNO):
 *   1. upsertPaymentRow (relink OK, corta antes del branch de INSERT)
 *   2. lookup del paymentId para el audit
 *   3. (fix H1) lookup de refund local vinculado (`type='refund'` +
 *      `description = 'Refund of ' + paymentId`, mismo vínculo que prepareRefund)
 *   4. UPDATE de reconciliación (decisión 2026-08-05) — devuelve la fila si
 *      matcheó, vacío si el booking estaba en un estado que no admite el cambio
 *   5. SOLO si 4 devolvió vacío: SELECT del status para el mail
 *   6. INSERT de la fila de refund `approved` — el registro de que la plata
 *      volvió, que es lo único escribible cuando el turno ya es terminal
 *
 * Con refund local conocido:
 *   4. UPDATE que salda la fila local pendiente (pending → approved)
 */
function mockTx(options?: {
  hasLocalRefund?: boolean
  settledLocalRefund?: boolean
  reconciled?: boolean
  bookingStatus?: string
}) {
  const reconciled = options?.reconciled ?? true
  const execute = vi.fn()
  execute.mockResolvedValueOnce([{ id: PAYMENT_ID }]) // upsertPaymentRow: relink OK
  execute.mockResolvedValueOnce([{ id: PAYMENT_ID }]) // lookup del paymentId para el audit
  execute.mockResolvedValueOnce(options?.hasLocalRefund ? [{ id: 'refund-pay-1' }] : []) // lookup de refund local conocido (fix H1)
  if (options?.hasLocalRefund) {
    // UPDATE que salda la devolución local pendiente.
    execute.mockResolvedValueOnce(options.settledLocalRefund ? [{ id: 'refund-pay-1' }] : [])
  } else {
    execute.mockResolvedValueOnce(reconciled ? [{ id: BOOKING_ID }] : []) // UPDATE de reconciliación
    if (!reconciled) {
      execute.mockResolvedValueOnce([{ status: options?.bookingStatus ?? 'no_show' }])
    }
    execute.mockResolvedValueOnce([]) // INSERT del registro de la devolución
  }
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
    // No se alerta como refund externo. El audit log que SI sale es otro
    // (`payment.refund_settled_by_mp`, ver el describe de mas abajo).
    expect(vi.mocked(insertSystemAuditLog)).not.toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'payment.external_refund_detected' }),
    )
    expect(vi.mocked(captureMessage)).not.toHaveBeenCalled()
  })
})

// Decisión del dueño (2026-08-05): además de la visibilidad, se reconcilia
// `bookings.deposit_status` y se avisa SOLO al admin. Al jugador NO.
describe('dispatchPaymentInfo — reconciliación del refund externo (decisión 2026-08-05)', () => {
  it('reconcilia el booking y encola el mail solo para el rol admin', async () => {
    const tx = mockTx({ reconciled: true })
    await dispatchPaymentInfo(info, TENANT_ID, tx)

    // El 4to execute es el UPDATE: se comprueba que filtra por estado — sin ese
    // WHERE, un refund sobre un turno terminal aborta la tx entera por el
    // trigger `enforce_booking_invariants_fn` (migr. 070).
    const updateSql = JSON.stringify(
      vi.mocked(tx as unknown as { execute: ReturnType<typeof vi.fn> }).execute.mock.calls[3],
    )
    expect(updateSql).toContain('deposit_status')
    expect(updateSql).toContain('confirmed')
    expect(updateSql).toContain('pending_payment')

    expect(vi.mocked(enqueueTenantOwnerNotification)).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        templateName: 'admin_external_refund_detected',
        content: expect.objectContaining({ bookingId: BOOKING_ID, reconciled: true }),
      }),
      tx,
      { onlyRole: 'admin' },
    )

    // Al jugador no se le encola nada.
    expect(vi.mocked(enqueueNotification)).not.toHaveBeenCalled()

    expect(vi.mocked(insertSystemAuditLog)).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        metadata: expect.objectContaining({ reconciled: true, bookingStatus: null }),
      }),
    )
  })

  it('con el turno en estado terminal no reconcilia: avisa con el estado real y NO pisa la seña', async () => {
    const tx = mockTx({ reconciled: false, bookingStatus: 'no_show' })
    const outcome = await dispatchPaymentInfo(info, TENANT_ID, tx)

    expect(outcome.alreadyProcessed).toBe(false)

    expect(vi.mocked(enqueueTenantOwnerNotification)).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ reconciled: false, bookingStatus: 'no_show' }),
      }),
      tx,
      { onlyRole: 'admin' },
    )
    expect(vi.mocked(insertSystemAuditLog)).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        metadata: expect.objectContaining({ reconciled: false, bookingStatus: 'no_show' }),
      }),
    )
  })

  it('devuelve notificationIds para que el handler despache el mail DESPUÉS del commit', async () => {
    vi.mocked(enqueueTenantOwnerNotification).mockResolvedValueOnce(['notif-1'])
    const tx = mockTx({ reconciled: true })
    const outcome = await dispatchPaymentInfo(info, TENANT_ID, tx)

    expect(outcome.alreadyProcessed).toBe(false)
    if (!outcome.alreadyProcessed) expect(outcome.notificationIds).toEqual(['notif-1'])
  })

  it('un refund LOCAL conocido no reconcilia el booking ni notifica', async () => {
    const tx = mockTx({ hasLocalRefund: true })
    await dispatchPaymentInfo(info, TENANT_ID, tx)

    expect(vi.mocked(enqueueTenantOwnerNotification)).not.toHaveBeenCalled()
    // 4 execute: upsert + los dos lookups + el UPDATE que salda la fila local.
    // Nunca se intenta el UPDATE sobre `bookings`: ese camino ya lo dejo como
    // corresponde y la fila puede estar congelada por el trigger de la 070.
    expect((tx as unknown as { execute: ReturnType<typeof vi.fn> }).execute).toHaveBeenCalledTimes(
      4,
    )
    const updateSql = JSON.stringify(
      vi.mocked(tx as unknown as { execute: ReturnType<typeof vi.fn> }).execute.mock.calls[3],
    )
    expect(updateSql).not.toContain('bookings')
  })
})

/**
 * El complejo devuelve la sena desde el panel de MercadoPago, que es el camino
 * mas comun hoy porque el reembolso automatico falla siempre (403 de permisos).
 * Este webhook es el aviso de que la plata volvio: saldar la fila local aca es
 * lo que hace que nadie tenga que tildar nada a mano.
 */
describe('dispatchPaymentInfo — MercadoPago salda una devolución local pendiente', () => {
  it('marca la fila de refund como devuelta y lo asienta en audit_logs', async () => {
    const tx = mockTx({ hasLocalRefund: true, settledLocalRefund: true })
    await dispatchPaymentInfo(info, TENANT_ID, tx)

    const settleSql = JSON.stringify(
      vi.mocked(tx as unknown as { execute: ReturnType<typeof vi.fn> }).execute.mock.calls[3],
    )
    expect(settleSql).toContain('processed_at')
    // Una sola fila, la mas vieja: aprobar todas las pendientes de esa
    // description por un solo evento seria inventar plata el dia que existan
    // devoluciones parciales.
    expect(settleSql).toContain('LIMIT 1')

    expect(vi.mocked(insertSystemAuditLog)).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'payment.refund_settled_by_mp',
        resourceType: 'payment',
        resourceId: 'refund-pay-1',
      }),
    )
  })

  it('si no quedaba nada pendiente no inventa un audit log', async () => {
    const tx = mockTx({ hasLocalRefund: true, settledLocalRefund: false })
    await dispatchPaymentInfo(info, TENANT_ID, tx)

    expect(vi.mocked(insertSystemAuditLog)).not.toHaveBeenCalled()
  })
})
