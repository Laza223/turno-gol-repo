import type { PaymentGateway } from './mp-gateway'
import {
  buildSaasUpgradeRef,
  type CreatePreapprovalInput,
  type CreatePreferenceInput,
  type CreateSaasUpgradePreferenceInput,
  type GatewayPaymentInfo,
  type GatewaySubscriptionState,
  type MpPaymentStatus,
  type PreapprovalResult,
  type PreferenceResult,
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
  statusCalls: string[] = []

  statusByPaymentId: Record<string, GatewayPaymentInfo> = {}
  preferenceCounter = 0

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

  searchCalls: string[] = []
  searchResults: Record<string, GatewayPaymentInfo[]> = {}

  async searchPaymentsByReference(externalReference: string): Promise<GatewayPaymentInfo[]> {
    this.searchCalls.push(externalReference)
    return this.searchResults[externalReference] ?? []
  }

  // ─── SaaS recurring billing (P18) ────────────────────────────────────────

  preapprovalCalls: CreatePreapprovalInput[] = []
  cancelPreapprovalCalls: string[] = []
  updatePreapprovalCalls: Array<{ preapprovalId: string; amount: number }> = []
  preapprovalCounter = 0

  /**
   * R5 residual (gap del mock, Fix 1 de M7): `cancelPreapproval` nunca podía
   * fallar acá, así que ningún test de billing pasaba por el camino de error
   * sin pisar el método a mano (`gateway.cancelPreapproval = vi.fn()...`).
   * Mismo patrón que `statusOverride`: seteable por instancia, opcional.
   */
  cancelPreapprovalError?: unknown

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
    if (this.cancelPreapprovalError !== undefined) throw this.cancelPreapprovalError
  }

  resolveSubscriptionTenantCalls: Array<{ eventType: string; dataId: string }> = []
  /** Seteable por instancia para probar el camino "MP no lo reconoce" → null. */
  resolveSubscriptionTenantResult?: string | null

  /**
   * Inversa de `createPreapproval`, que arma el id como
   * `mp-preapp-<n>-<tenantId>`: el complejo sale del id, igual que en
   * producción sale del `external_reference`. Sobrescribible con
   * `resolveSubscriptionTenantResult`.
   */
  async resolveSubscriptionTenant(
    eventType: 'subscription_preapproval' | 'subscription_authorized_payment',
    dataId: string,
  ): Promise<string | null> {
    this.resolveSubscriptionTenantCalls.push({ eventType, dataId })
    if (this.resolveSubscriptionTenantResult !== undefined) {
      return this.resolveSubscriptionTenantResult
    }
    const match = /^mp-preapp-\d+-(.+)$/.exec(dataId)
    return match?.[1] ?? null
  }

  subscriptionChargeCalls: string[] = []
  /** Seteable por instancia: qué devuelve el lookup de la factura del mes. */
  subscriptionChargeInfo?: GatewayPaymentInfo

  /**
   * Espejo de `getPaymentStatus`, pero por el id de la FACTURA del mes.
   *
   * Respeta el mismo `statusByPaymentId` que `getPaymentStatus`: en producción
   * son endpoints distintos, pero para un test lo que importa es "qué contesta
   * MP sobre este id", y tener dos mapas separados obligaría a sembrar los
   * mismos datos dos veces. `subscriptionChargeInfo` pisa todo, para el test
   * que necesita una respuesta puntual.
   */
  async getSubscriptionChargeInfo(authorizedPaymentId: string): Promise<GatewayPaymentInfo> {
    this.subscriptionChargeCalls.push(authorizedPaymentId)
    if (this.subscriptionChargeInfo) return this.subscriptionChargeInfo
    const sembrado = this.statusByPaymentId[authorizedPaymentId]
    if (sembrado) return sembrado
    return {
      mpPaymentId: `mp-pay-${authorizedPaymentId}`,
      status: 'approved',
      amount: 0,
      externalReference: '',
      paymentMethodId: 'account_money',
      preapprovalId: null,
    }
  }

  getSubscriptionStateCalls: string[] = []
  /**
   * Seteable por instancia. `undefined` (default) = "MP no reconoce el
   * preapproval" → `null`, que es el camino que NO activa nada: un test que se
   * olvide de sembrar el estado no puede activar una suscripción por accidente.
   */
  subscriptionState?: GatewaySubscriptionState | null

  async getSubscriptionState(preapprovalId: string): Promise<GatewaySubscriptionState | null> {
    this.getSubscriptionStateCalls.push(preapprovalId)
    return this.subscriptionState ?? null
  }

  async updatePreapprovalAmount(preapprovalId: string, amount: number): Promise<void> {
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
