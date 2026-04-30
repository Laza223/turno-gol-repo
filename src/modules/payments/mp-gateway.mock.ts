import type { PaymentGateway } from './mp-gateway'
import {
  buildSaasUpgradeRef,
  type CreatePreapprovalInput,
  type CreatePreferenceInput,
  type CreateSaasUpgradePreferenceInput,
  type GatewayPaymentInfo,
  type MpPaymentStatus,
  type PreapprovalResult,
  type PreferenceResult,
  type RefundResult,
} from './payment.types'

type StatusOverride = (mpPaymentId: string) => GatewayPaymentInfo | undefined

/**
 * Test double for `PaymentGateway`. Records calls; returns deterministic shapes.
 *
 * Configure status responses by setting `gateway.statusByPaymentId[id] = info`
 * or by passing `statusOverride` to the constructor for dynamic logic.
 */
export class MockGateway implements PaymentGateway {
  preferenceCalls: CreatePreferenceInput[] = []
  refundCalls: Array<{ mpPaymentId: string; amount?: number }> = []
  statusCalls: string[] = []

  statusByPaymentId: Record<string, GatewayPaymentInfo> = {}
  preferenceCounter = 0
  refundCounter = 0

  private readonly statusOverride?: StatusOverride

  constructor(opts?: { statusOverride?: StatusOverride }) {
    if (opts?.statusOverride) this.statusOverride = opts.statusOverride
  }

  async createPreference(input: CreatePreferenceInput): Promise<PreferenceResult> {
    this.preferenceCalls.push(input)
    this.preferenceCounter += 1
    const id = `mp-pref-${this.preferenceCounter}-${input.bookingId}`
    return {
      preferenceId: id,
      initPoint: `https://mp.test/checkout/${id}`,
      sandboxInitPoint: `https://mp.test/sandbox/checkout/${id}`,
    }
  }

  async getPaymentStatus(mpPaymentId: string): Promise<GatewayPaymentInfo> {
    this.statusCalls.push(mpPaymentId)
    if (this.statusOverride) {
      const v = this.statusOverride(mpPaymentId)
      if (v) return v
    }
    const stored = this.statusByPaymentId[mpPaymentId]
    if (stored) return stored
    return {
      mpPaymentId,
      status: 'pending' as MpPaymentStatus,
      amount: 0,
      externalReference: '',
      paymentMethodId: 'account_money',
    }
  }

  async createRefund(mpPaymentId: string, amount?: number): Promise<RefundResult> {
    this.refundCalls.push({ mpPaymentId, ...(amount !== undefined ? { amount } : {}) })
    this.refundCounter += 1
    return {
      mpRefundId: `mp-refund-${this.refundCounter}-${mpPaymentId}`,
      status: 'approved',
    }
  }

  // ─── SaaS recurring billing (P18) ────────────────────────────────────────

  preapprovalCalls: CreatePreapprovalInput[] = []
  cancelPreapprovalCalls: string[] = []
  updatePreapprovalCalls: Array<{ preapprovalId: string; amount: number }> = []
  preapprovalCounter = 0

  async createPreapproval(input: CreatePreapprovalInput): Promise<PreapprovalResult> {
    this.preapprovalCalls.push(input)
    this.preapprovalCounter += 1
    const id = `mp-preapp-${this.preapprovalCounter}-${input.tenantId}`
    return {
      preapprovalId: id,
      initPoint: `https://mp.test/preapproval/${id}`,
    }
  }

  async cancelPreapproval(preapprovalId: string): Promise<void> {
    this.cancelPreapprovalCalls.push(preapprovalId)
  }

  async updatePreapprovalAmount(
    preapprovalId: string,
    amount: number,
  ): Promise<void> {
    this.updatePreapprovalCalls.push({ preapprovalId, amount })
  }

  saasUpgradePreferenceCalls: CreateSaasUpgradePreferenceInput[] = []
  saasUpgradeCounter = 0

  async createSaasUpgradePreference(
    input: CreateSaasUpgradePreferenceInput,
  ): Promise<PreferenceResult> {
    this.saasUpgradePreferenceCalls.push(input)
    this.saasUpgradeCounter += 1
    const externalRef = buildSaasUpgradeRef(input.tenantId, input.targetPlanId)
    const id = `mp-upgrade-pref-${this.saasUpgradeCounter}-${input.tenantId}`
    return {
      preferenceId: id,
      initPoint: `https://mp.test/checkout/upgrade/${id}?ref=${encodeURIComponent(externalRef)}`,
      sandboxInitPoint: `https://mp.test/sandbox/upgrade/${id}`,
    }
  }
}
