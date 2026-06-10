import type { PaymentGateway } from './mp-gateway'
import type {
  CreatePreapprovalInput,
  CreatePreferenceInput,
  CreateSaasUpgradePreferenceInput,
  GatewayPaymentInfo,
  PreapprovalResult,
  PreferenceResult,
  RefundResult,
} from './payment.types'

/**
 * Whether the env-mock MercadoPago gateway is active.
 *
 * BLOCKER fix: the mock gateway processes every webhook inline with a fake
 * gateway and no pg-boss, bypassing the real payment flow entirely. It must be
 * impossible to enable in production even if `MP_MOCK_MODE=1` leaks into a prod
 * deploy — so the flag is hard-gated behind `NODE_ENV !== 'production'`.
 */
export function computeMpMockEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MP_MOCK_MODE === '1' && env.NODE_ENV !== 'production'
}

export const MP_MOCK_ENABLED = computeMpMockEnabled()

export type MockOutcome = 'approved' | 'rejected'

// Deterministic mpPaymentId that encodes outcome + bookingId so getPaymentStatus
// can return externalReference without DB access.
export function buildMockPaymentId(outcome: MockOutcome, bookingId: string): string {
  return `MOCK-${outcome.toUpperCase()}-${bookingId}`
}

export function parseMockPaymentId(
  id: string,
): { outcome: MockOutcome; bookingId: string } | null {
  const m = /^MOCK-(APPROVED|REJECTED)-([0-9a-fA-F-]{36})$/.exec(id)
  if (!m) return null
  return { outcome: m[1]!.toLowerCase() as MockOutcome, bookingId: m[2]! }
}

export function buildMockEventId(bookingId: string, outcome: MockOutcome): string {
  return `mock-evt-${outcome}-${bookingId}`
}

export function mockCheckoutInitPoint(appUrl: string, bookingId: string, prefId: string): string {
  return `${appUrl}/mock-mp/checkout?booking=${bookingId}&pref=${encodeURIComponent(prefId)}`
}

// Env-mock gateway used ONLY when MP_MOCK_MODE=1. Returns a LOCAL checkout
// init point and decodes payment status from the mock payment id. Keeps the
// shared MockGateway (tests) untouched.
export class LocalMockGateway implements PaymentGateway {
  async createPreference(input: CreatePreferenceInput): Promise<PreferenceResult> {
    const prefId = `mock-pref-${input.bookingId}`
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const initPoint = mockCheckoutInitPoint(appUrl, input.bookingId, prefId)
    return { preferenceId: prefId, initPoint, sandboxInitPoint: initPoint }
  }

  async getPaymentStatus(mpPaymentId: string): Promise<GatewayPaymentInfo> {
    const parsed = parseMockPaymentId(mpPaymentId)
    if (!parsed) {
      // Unknown id in mock mode → treat as pending (no transition).
      return {
        mpPaymentId,
        status: 'pending',
        amount: 1,
        externalReference: '',
        paymentMethodId: 'mock',
      }
    }
    return {
      mpPaymentId,
      status: parsed.outcome === 'approved' ? 'approved' : 'rejected',
      amount: 1, // mock artifact; E2E asserts booking.status, not amount
      externalReference: parsed.bookingId,
      paymentMethodId: 'mock',
    }
  }

  async createRefund(mpPaymentId: string, _amount?: number): Promise<RefundResult> {
    return { mpRefundId: `mock-refund-${mpPaymentId}`, status: 'approved' }
  }

  async searchPaymentsByReference(_externalReference: string): Promise<GatewayPaymentInfo[]> {
    return []
  }

  // ─── SaaS recurring billing (P18) ────────────────────────────────────────

  async createPreapproval(input: CreatePreapprovalInput): Promise<PreapprovalResult> {
    const id = `mock-preapp-${input.tenantId}`
    return {
      preapprovalId: id,
      initPoint: `http://localhost:3000/mock-mp/preapproval?id=${id}`,
    }
  }

  async cancelPreapproval(_preapprovalId: string): Promise<void> {
    // no-op in mock mode
  }

  async updatePreapprovalAmount(_preapprovalId: string, _amount: number): Promise<void> {
    // no-op in mock mode
  }

  async createSaasUpgradePreference(
    input: CreateSaasUpgradePreferenceInput,
  ): Promise<PreferenceResult> {
    const prefId = `mock-upgrade-pref-${input.tenantId}-${input.targetPlanId}`
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const initPoint = `${appUrl}/mock-mp/checkout?pref=${encodeURIComponent(prefId)}`
    return { preferenceId: prefId, initPoint, sandboxInitPoint: initPoint }
  }
}
