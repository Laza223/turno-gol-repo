import { Payment, PaymentRefund, PreApproval, Preference } from 'mercadopago'
import { mpClient } from '@/lib/mercadopago'
import { MpGatewayError } from './payment.errors'
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

function pesosToCents(amount: number | undefined | null): number {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return 0
  return Math.round(amount * 100)
}

function centsToPesos(cents: number): number {
  return Math.round(cents) / 100
}

export class MercadoPagoGateway implements PaymentGateway {
  private readonly config: ReturnType<typeof mpClient>

  constructor(encryptedAccessToken: string) {
    this.config = mpClient(encryptedAccessToken)
  }

  async createPreference(input: CreatePreferenceInput): Promise<PreferenceResult> {
    const preference = new Preference(this.config)
    try {
      const res = await preference.create({
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
        },
      })

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
    const payment = new Payment(this.config)
    try {
      const res = await payment.get({ id: mpPaymentId })
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
    const refund = new PaymentRefund(this.config)
    try {
      const body = amount !== undefined ? { amount: centsToPesos(amount) } : undefined
      const res = await refund.create({ payment_id: mpPaymentId, body })
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
