import { Payment, PaymentRefund, PreApproval, Preference } from 'mercadopago'
import { mpClient } from '@/lib/mercadopago'
import { MpGatewayError } from './payment.errors'
import { withTokenRefresh } from './mp-token-refresh'
import { centsToPesos, pesosToCents } from './money'
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

const ALLOWED_STATUSES: ReadonlyArray<MpPaymentStatus> = [
  'pending',
  'in_process',
  'approved',
  'rejected',
  'refunded',
  'cancelled',
]

function mapStatus(raw: string | undefined): MpPaymentStatus {
  if (raw && (ALLOWED_STATUSES as ReadonlyArray<string>).includes(raw)) {
    return raw as MpPaymentStatus
  }
  return 'pending'
}

const MP_ID_RE = /^\d{1,32}$/

/**
 * MP payment_type_id values that settle as `in_process` for 24-48h instead of
 * instantly (Rapipago/PagoFácil vouchers, ATM cash network, CBU transfer).
 * Excluded from booking-deposit preferences so v1 only accepts instant
 * payments (cards, account_money) — see createPreference below.
 */
const DEPOSIT_EXCLUDED_PAYMENT_TYPES = [
  { id: 'ticket' },
  { id: 'atm' },
  { id: 'bank_transfer' },
]

/**
 * Explicit per-call timeout for getPaymentStatus (deposit-confirmation polling).
 * The SDK client already defaults to 8s, but pinning it on the call keeps the
 * bound from silently changing if the client default is ever edited — a slow MP
 * must never stall the conversion path (doc5 NFR: p95 < 500ms).
 */
export const MP_GET_TIMEOUT_MS = 8000

export class MercadoPagoGateway implements PaymentGateway {
  private config: ReturnType<typeof mpClient>
  private readonly onUnauthorized?: () => Promise<string>

  /**
   * @param encryptedAccessToken tenant's encrypted MP access token.
   * @param options.onUnauthorized optional refresh hook (Hallazgo 4). Returns a
   *   fresh **encrypted** access token; invoked once on a 401, then the failing
   *   request is retried. Omit it for callers without a refresh path (e.g. the
   *   SaaS master account in `billing.gateway`).
   */
  constructor(
    encryptedAccessToken: string,
    options?: { onUnauthorized?: () => Promise<string> },
  ) {
    this.config = mpClient(encryptedAccessToken)
    this.onUnauthorized = options?.onUnauthorized
  }

  /**
   * Run an SDK call; on a 401 refresh the access token, rebuild the client and
   * retry once. The op re-reads `this.config` each invocation, so the retry
   * uses the refreshed credentials. No hook → plain pass-through.
   */
  private async withRefresh<T>(op: () => Promise<T>): Promise<T> {
    if (!this.onUnauthorized) return op()
    const refresh = this.onUnauthorized
    return withTokenRefresh(op, async () => {
      this.config = mpClient(await refresh())
    })
  }

  async createPreference(input: CreatePreferenceInput): Promise<PreferenceResult> {
    try {
      const res = await this.withRefresh(() =>
        new Preference(this.config).create({
        body: {
          items: [
            {
              id: input.bookingId,
              title: input.description,
              unit_price: centsToPesos(input.amount),
              quantity: 1,
              currency_id: 'ARS',
            },
          ],
          back_urls: {
            success: input.successUrl,
            failure: input.failureUrl,
            pending: input.pendingUrl,
          },
          auto_return: 'approved',
          external_reference: input.bookingId,
          notification_url: input.notificationUrl,
          expires: true,
          expiration_date_to: input.expiresAt.toISOString(),
          // Fable 5 P0: a booking deposit only has a 6min hold — deferred
          // methods (ticket=Rapipago/PagoFácil, atm, bank_transfer=CBU) settle
          // in 24-48h and land as `in_process`, long after the hold already
          // freed the slot. Excluding them here (not "managing a 48h window")
          // makes in_process rare instead of routine for this flow.
          payment_methods: {
            excluded_payment_types: DEPOSIT_EXCLUDED_PAYMENT_TYPES,
          },
        },
        }),
      )

      if (!res.id || !res.init_point) {
        throw new MpGatewayError('MP returned an empty preference')
      }

      return {
        preferenceId: res.id,
        initPoint: res.init_point,
        sandboxInitPoint: res.sandbox_init_point ?? res.init_point,
      }
    } catch (err) {
      if (err instanceof MpGatewayError) throw err
      throw new MpGatewayError(
        `Failed to create MP preference for booking ${input.bookingId}`,
        err,
      )
    }
  }

  async getPaymentStatus(mpPaymentId: string): Promise<GatewayPaymentInfo> {
    if (!MP_ID_RE.test(mpPaymentId)) {
      throw new MpGatewayError(`invalid mpPaymentId: ${mpPaymentId}`)
    }
    try {
      const res = await this.withRefresh(() =>
        new Payment(this.config).get({
          id: mpPaymentId,
          requestOptions: { timeout: MP_GET_TIMEOUT_MS },
        }),
      )
      return {
        mpPaymentId: String(res.id ?? mpPaymentId),
        status: mapStatus(res.status),
        amount: pesosToCents(res.transaction_amount),
        externalReference: res.external_reference ?? '',
        paymentMethodId: res.payment_method_id ?? 'unknown',
      }
    } catch (err) {
      throw new MpGatewayError(
        `Failed to fetch MP payment ${mpPaymentId}`,
        err,
      )
    }
  }

  async createRefund(mpPaymentId: string, amount?: number): Promise<RefundResult> {
    if (!MP_ID_RE.test(mpPaymentId)) {
      throw new MpGatewayError(`invalid mpPaymentId: ${mpPaymentId}`)
    }
    try {
      const body = amount !== undefined ? { amount: centsToPesos(amount) } : undefined
      const res = await this.withRefresh(() =>
        new PaymentRefund(this.config).create({ payment_id: mpPaymentId, body }),
      )
      const status = (res.status ?? 'pending') as RefundResult['status']
      return {
        mpRefundId: String(res.id ?? ''),
        status,
      }
    } catch (err) {
      throw new MpGatewayError(
        `Failed to refund MP payment ${mpPaymentId}`,
        err,
      )
    }
  }

  async searchPaymentsByReference(externalReference: string): Promise<GatewayPaymentInfo[]> {
    try {
      const res = await this.withRefresh(() =>
        new Payment(this.config).search({
          options: {
            criteria: 'desc',
            sort: 'date_created',
            external_reference: externalReference,
          },
        }),
      )
      const results = (res.results ?? []) as Array<{
        id?: number
        status?: string
        transaction_amount?: number
        external_reference?: string
        payment_method_id?: string
      }>
      return results.map((r) => ({
        mpPaymentId: String(r.id ?? ''),
        status: mapStatus(r.status),
        amount: pesosToCents(r.transaction_amount),
        externalReference: r.external_reference ?? externalReference,
        paymentMethodId: r.payment_method_id ?? 'unknown',
      }))
    } catch (err) {
      throw new MpGatewayError(
        `Failed to search MP payments for ref ${externalReference}`,
        err,
      )
    }
  }

  // ─── SaaS recurring billing (P18) ────────────────────────────────────────

  async createPreapproval(input: CreatePreapprovalInput): Promise<PreapprovalResult> {
    const preapproval = new PreApproval(this.config)
    try {
      const res = await preapproval.create({
        body: {
          payer_email: input.payerEmail,
          back_url: input.returnUrl,
          reason: input.reason,
          external_reference: input.tenantId,
          status: 'pending',
          auto_recurring: {
            frequency: 1,
            frequency_type: input.frequency === 'annual' ? 'years' : 'months',
            transaction_amount: centsToPesos(input.amount),
            currency_id: 'ARS',
          },
        },
      })
      if (!res.id || !res.init_point) {
        throw new MpGatewayError('MP returned an empty preapproval')
      }
      return {
        preapprovalId: String(res.id),
        initPoint: res.init_point,
      }
    } catch (err) {
      if (err instanceof MpGatewayError) throw err
      throw new MpGatewayError(
        `Failed to create MP preapproval for tenant ${input.tenantId}`,
        err,
      )
    }
  }

  async cancelPreapproval(preapprovalId: string): Promise<void> {
    const preapproval = new PreApproval(this.config)
    try {
      await preapproval.update({
        id: preapprovalId,
        body: { status: 'cancelled' },
      })
    } catch (err) {
      throw new MpGatewayError(
        `Failed to cancel MP preapproval ${preapprovalId}`,
        err,
      )
    }
  }

  async updatePreapprovalAmount(
    preapprovalId: string,
    amount: number,
  ): Promise<void> {
    const preapproval = new PreApproval(this.config)
    try {
      await preapproval.update({
        id: preapprovalId,
        body: {
          auto_recurring: {
            transaction_amount: centsToPesos(amount),
            currency_id: 'ARS',
          },
        },
      })
    } catch (err) {
      throw new MpGatewayError(
        `Failed to update MP preapproval amount ${preapprovalId}`,
        err,
      )
    }
  }

  async createSaasUpgradePreference(
    input: CreateSaasUpgradePreferenceInput,
  ): Promise<PreferenceResult> {
    const preference = new Preference(this.config)
    const externalRef = buildSaasUpgradeRef(input.tenantId, input.targetPlanId)
    try {
      const res = await preference.create({
        body: {
          items: [
            {
              id: externalRef,
              title: input.description,
              unit_price: centsToPesos(input.amount),
              quantity: 1,
              currency_id: 'ARS',
            },
          ],
          back_urls: {
            success: input.returnUrl,
            failure: input.returnUrl,
            pending: input.returnUrl,
          },
          auto_return: 'approved',
          external_reference: externalRef,
          notification_url: input.notificationUrl,
          expires: true,
          expiration_date_to: input.expiresAt.toISOString(),
        },
      })
      if (!res.id || !res.init_point) {
        throw new MpGatewayError('MP returned an empty saas-upgrade preference')
      }
      return {
        preferenceId: res.id,
        initPoint: res.init_point,
        sandboxInitPoint: res.sandbox_init_point ?? res.init_point,
      }
    } catch (err) {
      if (err instanceof MpGatewayError) throw err
      throw new MpGatewayError(
        `Failed to create MP saas-upgrade preference for tenant ${input.tenantId}`,
        err,
      )
    }
  }
}
