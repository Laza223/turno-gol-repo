import { beforeEach, describe, expect, it, vi } from 'vitest'

// ENS-16: reconcileApprovedPaymentForBooking es el motor compartido entre el
// precheck de expiry y el rescate post-terminal del worker de reconcile —
// vive en su propio módulo (no en payment.service.ts, donde están
// lockMpEvent/dispatchPaymentInfo) para poder mockear esos dos en frontera de
// módulo real (ESM no permite interceptar llamadas internas dentro del mismo
// archivo).

vi.mock('@/shared/db/client', () => ({
  withTenantContext: vi.fn(),
}))
vi.mock('@/modules/payments/payment.service', () => ({
  lockMpEvent: vi.fn(),
  dispatchPaymentInfo: vi.fn(),
  settleLatePaymentRefund: vi.fn(),
}))

import { withTenantContext } from '@/shared/db/client'
import {
  dispatchPaymentInfo,
  lockMpEvent,
  settleLatePaymentRefund,
} from '@/modules/payments/payment.service'
import {
  reconcileApprovedPaymentForBooking,
  ReconcileProcessingError,
} from '@/modules/payments/mp-reconcile.service'

const mockWithTenantContext = withTenantContext as ReturnType<typeof vi.fn>
const mockLockMpEvent = lockMpEvent as ReturnType<typeof vi.fn>
const mockDispatchPaymentInfo = dispatchPaymentInfo as ReturnType<typeof vi.fn>
const mockSettleLatePaymentRefund = settleLatePaymentRefund as ReturnType<typeof vi.fn>

const BOOKING_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = 'tenant-1'

function mockTx() {
  mockWithTenantContext.mockImplementation((async (
    _id: string,
    cb: (t: never) => Promise<unknown>,
  ) => cb({} as never)) as never)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('reconcileApprovedPaymentForBooking', () => {
  it('sin pago approved en MP → confirmed:false, ni siquiera abre tx', async () => {
    const gateway = {
      searchPaymentsByReference: vi.fn().mockResolvedValue([
        {
          mpPaymentId: 'p1',
          status: 'pending',
          amount: 100,
          externalReference: BOOKING_ID,
          paymentMethodId: 'x',
        },
      ]),
    }

    const result = await reconcileApprovedPaymentForBooking(
      BOOKING_ID,
      TENANT_ID,
      gateway as never,
      'test-source',
    )

    expect(result).toEqual({ confirmed: false, notificationIds: [] })
    expect(mockWithTenantContext).not.toHaveBeenCalled()
  })

  it('(d) pago approved en MP + won:true → llama dispatchPaymentInfo y devuelve confirmed:true', async () => {
    const approvedPayment = {
      mpPaymentId: 'mp-pay-1',
      status: 'approved',
      amount: 240000,
      externalReference: BOOKING_ID,
      paymentMethodId: 'account_money',
    }
    const gateway = {
      searchPaymentsByReference: vi.fn().mockResolvedValue([approvedPayment]),
    }
    mockTx()
    mockLockMpEvent.mockResolvedValue(true)
    mockDispatchPaymentInfo.mockResolvedValue({
      alreadyProcessed: false,
      result: 'confirmed',
      notificationIds: ['notif-1'],
      won: true,
    })

    const result = await reconcileApprovedPaymentForBooking(
      BOOKING_ID,
      TENANT_ID,
      gateway as never,
      'test-source',
    )

    expect(result).toEqual({ confirmed: true, notificationIds: ['notif-1'], refunded: false })
    expect(mockLockMpEvent).toHaveBeenCalledWith(
      expect.objectContaining({ mpEventId: 'reconcile-mp-pay-1' }),
      expect.anything(),
    )
    expect(mockDispatchPaymentInfo).toHaveBeenCalledWith(
      approvedPayment,
      TENANT_ID,
      expect.anything(),
    )
  })

  it('(e) lockMpEvent devuelve false → no reprocesa (dispatchPaymentInfo NO se llama)', async () => {
    const approvedPayment = {
      mpPaymentId: 'mp-pay-2',
      status: 'approved',
      amount: 240000,
      externalReference: BOOKING_ID,
      paymentMethodId: 'account_money',
    }
    const gateway = {
      searchPaymentsByReference: vi.fn().mockResolvedValue([approvedPayment]),
    }
    mockTx()
    mockLockMpEvent.mockResolvedValue(false)

    const result = await reconcileApprovedPaymentForBooking(
      BOOKING_ID,
      TENANT_ID,
      gateway as never,
      'test-source',
    )

    expect(result).toEqual({ confirmed: false, notificationIds: [] })
    expect(mockDispatchPaymentInfo).not.toHaveBeenCalled()
  })

  // R1-B (rechazo review): el lock fresco (o dispatchPaymentInfo sin tirar)
  // NO significa que ESTA corrida haya ganado la transición. Sobre un booking
  // ya post-terminal, transitionFromPendingPayment's guard hace won:false pero
  // el evento sintético `reconcile-<mpPaymentId>` puede ser la primera vez que
  // se ve → lock fresco. confirmed debe salir exclusivamente de won.
  it('(f) R1-B: lock fresco + dispatchPaymentInfo OK pero won:false (booking ya post-terminal) → confirmed:false', async () => {
    const approvedPayment = {
      mpPaymentId: 'mp-pay-3',
      status: 'approved',
      amount: 240000,
      externalReference: BOOKING_ID,
      paymentMethodId: 'account_money',
    }
    const gateway = {
      searchPaymentsByReference: vi.fn().mockResolvedValue([approvedPayment]),
    }
    mockTx()
    mockLockMpEvent.mockResolvedValue(true)
    mockDispatchPaymentInfo.mockResolvedValue({
      alreadyProcessed: false,
      result: 'confirmed',
      notificationIds: ['notif-late-payment'],
      won: false,
    })

    const result = await reconcileApprovedPaymentForBooking(
      BOOKING_ID,
      TENANT_ID,
      gateway as never,
      'test-source',
    )

    // `refunded:false` explícito: MP aprobó y el booking ya estaba terminal,
    // pero este caso NO preparó reembolso (lo hace `handleApproved`, mockeado
    // acá). Distinguirlo de `refunded:true` es todo el punto del campo.
    expect(result).toEqual({
      confirmed: false,
      notificationIds: ['notif-late-payment'],
      refunded: false,
    })
  })
})

// R1-A (rechazo review): separar fase SEARCH (consulta a MP) de fase PROCESS
// (tx local). Un error en SEARCH es "no sabemos si pagó" — el caller decide
// conservador. Un error en PROCESS ocurre CON el pago ya confirmado por MP —
// nunca puede confundirse con "no hay pago".
describe('reconcileApprovedPaymentForBooking — fases search vs process (R1-A)', () => {
  it('SEARCH falla (gateway.searchPaymentsByReference tira) → el error se propaga tal cual, sin abrir tx', async () => {
    const searchError = new Error('MP unreachable')
    const gateway = {
      searchPaymentsByReference: vi.fn().mockRejectedValue(searchError),
    }

    await expect(
      reconcileApprovedPaymentForBooking(BOOKING_ID, TENANT_ID, gateway as never, 'test-source'),
    ).rejects.toBe(searchError)
    expect(mockWithTenantContext).not.toHaveBeenCalled()
  })

  it('PROCESS falla (dispatchPaymentInfo tira DENTRO de la tx, con MP ya approved) → envuelve en ReconcileProcessingError, nunca confirmed:false silencioso', async () => {
    const approvedPayment = {
      mpPaymentId: 'mp-pay-4',
      status: 'approved',
      amount: 240000,
      externalReference: BOOKING_ID,
      paymentMethodId: 'account_money',
    }
    const gateway = {
      searchPaymentsByReference: vi.fn().mockResolvedValue([approvedPayment]),
    }
    mockTx()
    mockLockMpEvent.mockResolvedValue(true)
    const localError = new Error('recordDepositCashFlow: db down')
    mockDispatchPaymentInfo.mockRejectedValue(localError)

    const promise = reconcileApprovedPaymentForBooking(
      BOOKING_ID,
      TENANT_ID,
      gateway as never,
      'test-source',
    )

    await expect(promise).rejects.toBeInstanceOf(ReconcileProcessingError)
    await expect(promise).rejects.toMatchObject({ bookingId: BOOKING_ID, cause: localError })
  })
})

/**
 * Pago tardío (decisión del dueño 2026-08-19): MP aprobó cuando la reserva ya
 * estaba `expired`, así que `won` es false —y va a seguir siéndolo, `expired`
 * es terminal en las tres capas— pero SÍ pasó algo con la plata. Antes ese
 * caso era indistinguible de "MP no tenía nada": los dos devolvían
 * `confirmed:false` y el caller no tenía con qué contarlo ni loguearlo.
 */
describe('reconcileApprovedPaymentForBooking — pago tardío', () => {
  const APPROVED = {
    mpPaymentId: 'mp-late-1',
    status: 'approved',
    amount: 5000,
    externalReference: BOOKING_ID,
    paymentMethodId: 'account_money',
  }
  const PREPARED = { refundPaymentId: 'refund-row-1', mpPaymentId: 'mp-late-1', refundAmount: 5000 }

  function gatewayWithApproved() {
    return { searchPaymentsByReference: vi.fn().mockResolvedValue([APPROVED]) }
  }

  it('won:false + preparedRefund → liquida contra MP y devuelve refunded:true', async () => {
    mockTx()
    mockLockMpEvent.mockResolvedValue(true)
    mockDispatchPaymentInfo.mockResolvedValue({
      alreadyProcessed: false,
      result: 'confirmed',
      notificationIds: ['n1', 'n2'],
      won: false,
      preparedRefund: PREPARED,
    })

    const gateway = gatewayWithApproved()
    const result = await reconcileApprovedPaymentForBooking(
      BOOKING_ID,
      TENANT_ID,
      gateway as never,
      'reconcile-post-terminal',
    )

    expect(result).toEqual({ confirmed: false, notificationIds: ['n1', 'n2'], refunded: true })
    expect(mockSettleLatePaymentRefund).toHaveBeenCalledWith(PREPARED, TENANT_ID, gateway)
  })

  it('sin preparedRefund no llama a MP por un reembolso que nadie pidió', async () => {
    mockTx()
    mockLockMpEvent.mockResolvedValue(true)
    mockDispatchPaymentInfo.mockResolvedValue({
      alreadyProcessed: false,
      result: 'confirmed',
      notificationIds: [],
      won: true,
    })

    const result = await reconcileApprovedPaymentForBooking(
      BOOKING_ID,
      TENANT_ID,
      gatewayWithApproved() as never,
      'expiry-precheck',
    )

    expect(result).toEqual({ confirmed: true, notificationIds: [], refunded: false })
    expect(mockSettleLatePaymentRefund).not.toHaveBeenCalled()
  })

  it('evento ya procesado (lock no fresco) → no liquida nada', async () => {
    mockTx()
    mockLockMpEvent.mockResolvedValue(false)

    const result = await reconcileApprovedPaymentForBooking(
      BOOKING_ID,
      TENANT_ID,
      gatewayWithApproved() as never,
      'reconcile-post-terminal',
    )

    expect(result).toEqual({ confirmed: false, notificationIds: [] })
    expect(mockSettleLatePaymentRefund).not.toHaveBeenCalled()
  })
})
