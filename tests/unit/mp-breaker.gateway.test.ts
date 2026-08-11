import { describe, it, expect, vi } from 'vitest'
import { CircuitBreaker, CircuitOpenError } from '@/modules/payments/mp-circuit-breaker'
import { withCircuitBreaker } from '@/modules/payments/mp-breaker.gateway'
import type { PaymentGateway } from '@/modules/payments/mp-gateway'
import type {
  GatewayPaymentInfo,
  PreapprovalResult,
  PreferenceResult,
  RefundResult,
} from '@/modules/payments/payment.types'

const OK_INFO: GatewayPaymentInfo = {
  mpPaymentId: '123',
  status: 'approved',
  amount: 1000,
  externalReference: 'ref',
  paymentMethodId: 'visa',
}

/** A fully-stubbed PaymentGateway whose methods succeed; override per test. */
function makeInner(overrides: Partial<PaymentGateway> = {}): PaymentGateway {
  const base: PaymentGateway = {
    createPreference: vi.fn(async (): Promise<PreferenceResult> => ({
      preferenceId: 'p',
      initPoint: 'ip',
      sandboxInitPoint: 'sip',
    })),
    getPaymentStatus: vi.fn(async (): Promise<GatewayPaymentInfo> => OK_INFO),
    createRefund: vi.fn(async (): Promise<RefundResult> => ({
      mpRefundId: 'r',
      status: 'approved',
    })),
    searchPaymentsByReference: vi.fn(async (): Promise<GatewayPaymentInfo[]> => [OK_INFO]),
    createPreapproval: vi.fn(async (): Promise<PreapprovalResult> => ({
      preapprovalId: 'pa',
      initPoint: 'ip',
    })),
    cancelPreapproval: vi.fn(async (): Promise<void> => {}),
    updatePreapprovalAmount: vi.fn(async (): Promise<void> => {}),
    createSaasUpgradePreference: vi.fn(async (): Promise<PreferenceResult> => ({
      preferenceId: 'u',
      initPoint: 'ip',
      sandboxInitPoint: 'sip',
    })),
  }
  return { ...base, ...overrides }
}

describe('withCircuitBreaker', () => {
  it('passes through the inner result while closed', async () => {
    const inner = makeInner()
    const gw = withCircuitBreaker(inner, 'k', new CircuitBreaker({ now: () => 0 }))

    await expect(gw.getPaymentStatus('123')).resolves.toEqual(OK_INFO)
    expect(inner.getPaymentStatus).toHaveBeenCalledWith('123')
  })

  it('forwards all arguments to the inner gateway', async () => {
    const inner = makeInner()
    const gw = withCircuitBreaker(inner, 'k', new CircuitBreaker({ now: () => 0 }))

    await gw.createRefund('pay-1', 500, 'idem-1')
    expect(inner.createRefund).toHaveBeenCalledWith('pay-1', 500, 'idem-1')

    await gw.updatePreapprovalAmount('pa-1', 9900)
    expect(inner.updatePreapprovalAmount).toHaveBeenCalledWith('pa-1', 9900)
  })

  it('opens after failureThreshold and fast-fails without invoking inner', async () => {
    const inner = makeInner({
      getPaymentStatus: vi.fn(async (): Promise<GatewayPaymentInfo> => {
        throw new Error('MP timeout')
      }),
    })
    const gw = withCircuitBreaker(
      inner,
      'k',
      new CircuitBreaker({ failureThreshold: 2, now: () => 0 }),
    )

    await expect(gw.getPaymentStatus('1')).rejects.toThrow('MP timeout') // fail 1
    await expect(gw.getPaymentStatus('1')).rejects.toThrow('MP timeout') // fail 2 → opens
    await expect(gw.getPaymentStatus('1')).rejects.toBeInstanceOf(CircuitOpenError) // open

    // inner was NOT called the third time — the circuit short-circuited.
    expect(inner.getPaymentStatus).toHaveBeenCalledTimes(2)
  })

  it('keeps circuits independent per key', async () => {
    const inner = makeInner({
      getPaymentStatus: vi.fn(async (): Promise<GatewayPaymentInfo> => {
        throw new Error('boom')
      }),
    })
    const breaker = new CircuitBreaker({ failureThreshold: 1, now: () => 0 })
    const gwA = withCircuitBreaker(inner, 'tenant:A', breaker)
    const gwB = withCircuitBreaker(inner, 'tenant:B', breaker)

    await expect(gwA.getPaymentStatus('1')).rejects.toThrow('boom') // opens A
    await expect(gwA.getPaymentStatus('1')).rejects.toBeInstanceOf(CircuitOpenError) // A open
    await expect(gwB.getPaymentStatus('1')).rejects.toThrow('boom') // B still reaches inner

    expect(inner.getPaymentStatus).toHaveBeenCalledTimes(2)
  })

  it('a success resets the consecutive-failure counter', async () => {
    let calls = 0
    const inner = makeInner({
      getPaymentStatus: vi.fn(async (): Promise<GatewayPaymentInfo> => {
        calls += 1
        if (calls === 2) return OK_INFO
        throw new Error(`boom-${calls}`)
      }),
    })
    const gw = withCircuitBreaker(
      inner,
      'k',
      new CircuitBreaker({ failureThreshold: 2, now: () => 0 }),
    )

    await expect(gw.getPaymentStatus('1')).rejects.toThrow('boom-1') // failures = 1
    await expect(gw.getPaymentStatus('1')).resolves.toEqual(OK_INFO) // success → reset to 0
    await expect(gw.getPaymentStatus('1')).rejects.toThrow('boom-3') // failures = 1, NOT open

    expect(inner.getPaymentStatus).toHaveBeenCalledTimes(3)
  })

  it('recovers via half_open after the cooldown: a trial success closes it', async () => {
    let clock = 0
    let calls = 0
    const inner = makeInner({
      getPaymentStatus: vi.fn(async (): Promise<GatewayPaymentInfo> => {
        calls += 1
        if (calls <= 2) throw new Error('MP down')
        return OK_INFO
      }),
    })
    const gw = withCircuitBreaker(
      inner,
      'k',
      new CircuitBreaker({ failureThreshold: 2, openMs: 1000, now: () => clock }),
    )

    await expect(gw.getPaymentStatus('1')).rejects.toThrow('MP down') // 1
    await expect(gw.getPaymentStatus('1')).rejects.toThrow('MP down') // 2 → open
    await expect(gw.getPaymentStatus('1')).rejects.toBeInstanceOf(CircuitOpenError) // open: inner not hit
    expect(calls).toBe(2)

    clock = 1000 // cooldown elapsed → half_open admits one trial
    await expect(gw.getPaymentStatus('1')).resolves.toEqual(OK_INFO) // trial succeeds → closed
    await expect(gw.getPaymentStatus('1')).resolves.toEqual(OK_INFO) // closed: passes through
    expect(calls).toBe(4)
  })
})
