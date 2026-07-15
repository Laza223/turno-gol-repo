import { beforeEach, describe, expect, it, vi } from 'vitest'

// ENS-19: un refund contra MP que falla quedaba `payments.status='pending'`
// para siempre, sin retry ni alerta. Este worker (cron horario) reintenta
// contra MP los refunds pending >1h reusando la MISMA idempotency key que el
// intento original (settleRefund la construye determinísticamente por
// `refundPaymentId` — no se toca esa función, se reutiliza tal cual). Si
// sigue pending tras >24h, encola UNA alerta al dueño (dedupeada contra la
// tabla notifications, sin repetir en corridas sucesivas).

vi.mock('@/shared/db/client', () => ({
  getWorkerSql: vi.fn(),
  withTenantContext: vi.fn(),
}))
vi.mock('@/modules/payments/mp-oauth', () => ({
  resolveTenantGateway: vi.fn(),
}))
vi.mock('@/modules/payments/payment.service', () => ({
  settleRefund: vi.fn(),
  formatArs: (cents: number) => (cents / 100).toFixed(2),
}))
vi.mock('@/modules/notifications/notification.service', () => ({
  enqueueTenantOwnerNotification: vi.fn(),
  dispatchEmail: vi.fn(),
}))
vi.mock('@/shared/observability', () => ({
  track: { payment: vi.fn() },
}))
vi.mock('@/shared/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { getWorkerSql, withTenantContext } from '@/shared/db/client'
import { resolveTenantGateway } from '@/modules/payments/mp-oauth'
import { settleRefund } from '@/modules/payments/payment.service'
import {
  enqueueTenantOwnerNotification,
  dispatchEmail,
} from '@/modules/notifications/notification.service'
import { retryPendingRefunds } from '@/shared/jobs/workers/retry-refunds.worker'

const mockGetWorkerSql = getWorkerSql as ReturnType<typeof vi.fn>
const mockWithTenantContext = withTenantContext as ReturnType<typeof vi.fn>
const mockResolveGateway = resolveTenantGateway as ReturnType<typeof vi.fn>
const mockSettleRefund = settleRefund as ReturnType<typeof vi.fn>
const mockEnqueueOwner = enqueueTenantOwnerNotification as ReturnType<typeof vi.fn>
const mockDispatchEmail = dispatchEmail as ReturnType<typeof vi.fn>

const TENANT_ID = 'tenant-1'
const REFUND_PAYMENT_ID = 'refund-payment-1'
const BOOKING_ID = 'booking-1'
const ORIGINAL_MP_PAYMENT_ID = 'mp-original-1'

function baseRow(overrides: Partial<{
  refundPaymentId: string
  tenantId: string
  bookingId: string | null
  refundAmount: number
  createdAt: Date
  originalMpPaymentId: string | null
  mpAccessToken: string
}> = {}) {
  return {
    refundPaymentId: REFUND_PAYMENT_ID,
    tenantId: TENANT_ID,
    bookingId: BOOKING_ID,
    refundAmount: 300000,
    createdAt: new Date(Date.now() - 2 * 3_600_000), // 2h ago (>1h stale)
    originalMpPaymentId: ORIGINAL_MP_PAYMENT_ID,
    mpAccessToken: 'tok',
    ...overrides,
  }
}

function mockSqlRows(rows: unknown[]) {
  const sqlStub = vi.fn().mockResolvedValue(rows)
  mockGetWorkerSql.mockReturnValue(sqlStub as unknown as ReturnType<typeof getWorkerSql>)
}

/** withTenantContext: corre el callback con un tx cuyo execute() devuelve, en
 * orden, cada array de `responses` (idempotency check, luego booking/court). */
function mockTenantTx(responses: unknown[][]) {
  const execute = vi.fn()
  for (const r of responses) execute.mockResolvedValueOnce(r)
  mockWithTenantContext.mockImplementation(
    (async (_id: string, cb: (t: unknown) => Promise<unknown>) => cb({ execute })) as never,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockResolveGateway.mockReturnValue({ id: 'fake-gateway' })
})

describe('retryPendingRefunds — sin filas', () => {
  it('no hace nada si no hay refunds pending >1h', async () => {
    mockSqlRows([])
    const result = await retryPendingRefunds()
    expect(result).toEqual({ retried: 0, alerted: 0 })
    expect(mockResolveGateway).not.toHaveBeenCalled()
    expect(mockSettleRefund).not.toHaveBeenCalled()
  })
})

describe('retryPendingRefunds — reintento (c)', () => {
  it('reintenta con la MISMA idempotency key que el intento original (refundPaymentId de la fila)', async () => {
    mockSqlRows([baseRow()])
    mockSettleRefund.mockResolvedValue({ status: 'pending' })

    await retryPendingRefunds()

    expect(mockResolveGateway).toHaveBeenCalledWith(TENANT_ID, 'tok')
    expect(mockSettleRefund).toHaveBeenCalledTimes(1)
    const [prepared, gateway, tenantId] = mockSettleRefund.mock.calls[0]!
    // settleRefund arma la key como `refund:${prepared.refundPaymentId}` — pasar
    // el MISMO refundPaymentId de la fila original ES reusar la misma key.
    expect(prepared).toEqual({
      refundPaymentId: REFUND_PAYMENT_ID,
      mpPaymentId: ORIGINAL_MP_PAYMENT_ID,
      refundAmount: 300000,
    })
    expect(gateway).toEqual({ id: 'fake-gateway' })
    expect(tenantId).toBe(TENANT_ID)
  })

  it('salta (con log) una fila sin pago original resuelto — no llama a settleRefund', async () => {
    mockSqlRows([baseRow({ originalMpPaymentId: null })])

    const result = await retryPendingRefunds()

    expect(mockSettleRefund).not.toHaveBeenCalled()
    expect(result).toEqual({ retried: 0, alerted: 0 })
  })
})

describe('retryPendingRefunds — settle exitoso (d)', () => {
  it('un refund que pasa a approved cuenta como retried y NO dispara alerta', async () => {
    mockSqlRows([baseRow({ createdAt: new Date(Date.now() - 30 * 3_600_000) })]) // 30h, viejo
    mockSettleRefund.mockResolvedValue({ status: 'approved' })

    const result = await retryPendingRefunds()

    expect(result).toEqual({ retried: 1, alerted: 0 })
    expect(mockWithTenantContext).not.toHaveBeenCalled()
    expect(mockEnqueueOwner).not.toHaveBeenCalled()
  })
})

describe('retryPendingRefunds — sigue pending <24h', () => {
  it('reintenta pero NO alerta todavía (edad < 24h)', async () => {
    mockSqlRows([baseRow({ createdAt: new Date(Date.now() - 5 * 3_600_000) })]) // 5h
    mockSettleRefund.mockResolvedValue({ status: 'pending' })

    const result = await retryPendingRefunds()

    expect(result).toEqual({ retried: 0, alerted: 0 })
    expect(mockWithTenantContext).not.toHaveBeenCalled()
    expect(mockEnqueueOwner).not.toHaveBeenCalled()
  })
})

describe('retryPendingRefunds — alerta única tras 24h (e)', () => {
  it('primera corrida: >24h pending → encola UNA alerta al dueño', async () => {
    mockSqlRows([baseRow({ createdAt: new Date(Date.now() - 30 * 3_600_000) })])
    mockSettleRefund.mockResolvedValue({ status: 'pending' })
    mockTenantTx([[], [{ court_name: 'Cancha 5', date: '2027-06-02' }]])
    mockEnqueueOwner.mockResolvedValue(['notif-1'])

    const result = await retryPendingRefunds()

    expect(result).toEqual({ retried: 0, alerted: 1 })
    expect(mockEnqueueOwner).toHaveBeenCalledTimes(1)
    const [params] = mockEnqueueOwner.mock.calls[0]!
    expect(params).toMatchObject({
      tenantId: TENANT_ID,
      templateName: 'admin_refund_failed',
      content: expect.objectContaining({ refundPaymentId: REFUND_PAYMENT_ID }),
    })
    expect(mockDispatchEmail).toHaveBeenCalledWith('notif-1')
  })

  it('R1-E: refund huérfano (sin pago original) Y >24h de antigüedad → alerta igual (no queda invisible para siempre)', async () => {
    mockSqlRows([
      baseRow({
        originalMpPaymentId: null,
        createdAt: new Date(Date.now() - 30 * 3_600_000), // 30h, viejo
      }),
    ])
    mockTenantTx([[], [{ court_name: 'Cancha 5', date: '2027-06-02' }]])
    mockEnqueueOwner.mockResolvedValue(['notif-orphan'])

    const result = await retryPendingRefunds()

    expect(mockSettleRefund).not.toHaveBeenCalled()
    expect(result).toEqual({ retried: 0, alerted: 1 })
    expect(mockEnqueueOwner).toHaveBeenCalledTimes(1)
    const [params] = mockEnqueueOwner.mock.calls[0]!
    expect(params).toMatchObject({
      tenantId: TENANT_ID,
      templateName: 'admin_refund_failed',
      content: expect.objectContaining({ refundPaymentId: REFUND_PAYMENT_ID }),
    })
    expect(mockDispatchEmail).toHaveBeenCalledWith('notif-orphan')
  })

  it('segunda corrida (misma fila todavía pending): NO repite la alerta', async () => {
    mockSqlRows([baseRow({ createdAt: new Date(Date.now() - 48 * 3_600_000) })])
    mockSettleRefund.mockResolvedValue({ status: 'pending' })
    // La corrida anterior ya insertó una notification para este refundPaymentId.
    mockTenantTx([[{ id: 'existing-notif' }]])

    const result = await retryPendingRefunds()

    expect(result).toEqual({ retried: 0, alerted: 0 })
    expect(mockEnqueueOwner).not.toHaveBeenCalled()
    expect(mockDispatchEmail).not.toHaveBeenCalled()
  })
})

describe('retryPendingRefunds — settle lanza (MP caído)', () => {
  it('no rompe el loop; sigue pending y respeta la ventana de 24h para alertar', async () => {
    mockSqlRows([baseRow({ createdAt: new Date(Date.now() - 30 * 3_600_000) })])
    mockSettleRefund.mockRejectedValue(new Error('MP down'))
    mockTenantTx([[], [{ court_name: 'Cancha 5', date: '2027-06-02' }]])
    mockEnqueueOwner.mockResolvedValue(['notif-2'])

    const result = await retryPendingRefunds()

    expect(result).toEqual({ retried: 0, alerted: 1 })
    expect(mockDispatchEmail).toHaveBeenCalledWith('notif-2')
  })
})
