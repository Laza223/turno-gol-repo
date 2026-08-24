import { beforeEach, describe, expect, it, vi } from 'vitest'

// Este worker fue, hasta el 2026-08-24, dos pases: reintentar contra la API de
// MercadoPago cada devolución `pending` de más de una hora, y recordarle al
// complejo a los 7 días lo que seguía debiendo. El primer pase se eliminó junto
// con el reembolso automático (PR #203) porque MercadoPago no concede el
// permiso de reembolso a ninguna de las aplicaciones probadas: cada reintento
// era un 403 garantizado. Queda el recordatorio, que aplica a CUALQUIER medio.
//
// Lo que se prueba acá es eso y, sobre todo, lo que ya NO tiene que pasar: que
// no se resuelva ningún gateway ni se llame a MercadoPago.

vi.mock('@/shared/db/client', () => ({
  getWorkerSql: vi.fn(),
  withTenantContext: vi.fn(),
}))
vi.mock('@/modules/payments/mp-oauth', () => ({
  resolveTenantGateway: vi.fn(),
}))
vi.mock('@/modules/payments/payment.service', () => ({
  formatArs: (cents: number) => (cents / 100).toFixed(2),
}))
vi.mock('@/modules/notifications/notification.service', () => ({
  enqueueTenantOwnerNotification: vi.fn(),
  dispatchEmail: vi.fn(),
}))
vi.mock('@/shared/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { getWorkerSql, withTenantContext } from '@/shared/db/client'
import { resolveTenantGateway } from '@/modules/payments/mp-oauth'
import {
  enqueueTenantOwnerNotification,
  dispatchEmail,
} from '@/modules/notifications/notification.service'
import { remindPendingRefunds } from '@/shared/jobs/workers/retry-refunds.worker'

const mockGetWorkerSql = getWorkerSql as ReturnType<typeof vi.fn>
const mockWithTenantContext = withTenantContext as ReturnType<typeof vi.fn>
const mockResolveGateway = resolveTenantGateway as ReturnType<typeof vi.fn>
const mockEnqueueOwner = enqueueTenantOwnerNotification as ReturnType<typeof vi.fn>
const mockDispatchEmail = dispatchEmail as ReturnType<typeof vi.fn>

/**
 * Una sola query por corrida contra el pool de servicio. Que sea UNA es parte
 * de lo que se prueba: la segunda era la del reintento contra MercadoPago.
 */
function mockSqlRows(staleRows: unknown[]) {
  const sqlStub = vi.fn().mockResolvedValue(staleRows)
  mockGetWorkerSql.mockReturnValue(sqlStub as unknown as ReturnType<typeof getWorkerSql>)
  return sqlStub
}

function mockTenantTx() {
  mockWithTenantContext.mockImplementation((async (
    _id: string,
    cb: (t: unknown) => Promise<unknown>,
  ) => cb({ execute: vi.fn().mockResolvedValue([]) })) as never)
}

function filaVieja(overrides: Record<string, unknown> = {}) {
  return {
    refundPaymentId: 'refund-viejo',
    tenantId: 'tenant-1',
    bookingId: 'booking-1',
    refundAmount: 500000,
    daysPending: 9,
    playerName: 'Tomás García',
    courtName: 'Cancha 5',
    date: '2026-08-14',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockTenantTx()
})

describe('remindPendingRefunds', () => {
  it('encola el recordatorio con los días que lleva pendiendo', async () => {
    mockSqlRows([filaVieja()])
    mockEnqueueOwner.mockResolvedValue(['notif-1'])

    const result = await remindPendingRefunds()

    expect(result.reminded).toBe(1)
    expect(mockEnqueueOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        templateName: 'admin_refund_pending_reminder',
        triggerEvent: 'payment.refund.still_pending',
        content: expect.objectContaining({
          refundPaymentId: 'refund-viejo',
          daysPending: 9,
          playerName: 'Tomás García',
          date: '14/08/2026',
        }),
      }),
      expect.anything(),
    )
    expect(mockDispatchEmail).toHaveBeenCalledWith('notif-1')
  })

  it('sin devoluciones viejas no molesta a nadie', async () => {
    mockSqlRows([])
    const result = await remindPendingRefunds()
    expect(result.reminded).toBe(0)
    expect(mockEnqueueOwner).not.toHaveBeenCalled()
  })

  // Una devolución de seña cobrada en efectivo no tiene ningún camino
  // automático que la resuelva: si el recordatorio la filtrara por medio de
  // pago, esas quedarían sin ninguna alerta, que es exactamente el agujero que
  // este pase vino a tapar.
  it('recuerda también las que nunca pasaron por MercadoPago', async () => {
    mockSqlRows([filaVieja({ refundPaymentId: 'refund-efectivo', playerName: null })])
    mockEnqueueOwner.mockResolvedValue(['notif-2'])

    const result = await remindPendingRefunds()

    expect(result.reminded).toBe(1)
    expect(mockEnqueueOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.not.objectContaining({ playerName: expect.anything() }),
      }),
      expect.anything(),
    )
  })

  // El corazón de la limpieza: el worker ya no habla con MercadoPago. Si algún
  // día alguien reintroduce un reintento automático, este test se cae — y tiene
  // que caerse, porque el permiso sigue sin existir y volvería el 403 por hora.
  it('no resuelve ningún gateway de MercadoPago', async () => {
    const sqlStub = mockSqlRows([filaVieja()])
    mockEnqueueOwner.mockResolvedValue(['notif-3'])

    await remindPendingRefunds()

    expect(mockResolveGateway).not.toHaveBeenCalled()
    // Una sola query: la del recordatorio.
    expect(sqlStub).toHaveBeenCalledTimes(1)
  })
})
