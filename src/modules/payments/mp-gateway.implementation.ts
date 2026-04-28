import { Payment, PaymentRefund, Preference } from 'mercadopago'
import { mpClient } from '@/lib/mercadopago'
import { MpGatewayError } from './payment.errors'
import type { PaymentGateway } from './mp-gateway'
import type {
  CreatePreferenceInput,
  GatewayPaymentInfo,
  MpPaymentStatus,
  PreferenceResult,
  RefundResult,
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
}
