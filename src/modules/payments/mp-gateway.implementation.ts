import { Payment, PreApproval, Preference } from 'mercadopago'
import { mpClient, mpClientFromPlaintext } from '@/lib/mercadopago'
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
  type GatewaySubscriptionState,
  type MpPaymentStatus,
  type PreapprovalResult,
  type PreferenceResult,
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

/**
 * MP manda las fechas en ISO-8601 con offset (`2026-08-20T10:49:04.486-04:00`).
 *
 * Un valor ausente o no parseable devuelve `null`, nunca un Invalid Date: un
 * Invalid Date se propagaría silencioso hasta un `current_period_end` corrupto
 * en la DB, y recién se notaría cuando a un complejo le venza la suscripción en
 * una fecha imposible.
 */
function parseMpDate(v: unknown): Date | null {
  if (typeof v !== 'string' || v === '') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function normalizeUrl(url: string): string
function normalizeUrl(url: string | undefined): string | undefined {
  if (!url) return url
  return url.replace(/:\/\/localhost\b/i, '://127.0.0.1')
}

const MP_ID_RE = /^\d{1,32}$/

/**
 * MP payment_type_id values that settle as `in_process` for 24-48h instead of
 * instantly (Rapipago/PagoFácil vouchers, ATM cash network, CBU transfer).
 * Excluded from booking-deposit preferences so v1 only accepts instant
 * payments (cards, account_money) — see createPreference below.
 */
const DEPOSIT_EXCLUDED_PAYMENT_TYPES = [{ id: 'ticket' }, { id: 'atm' }, { id: 'bank_transfer' }]

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
   * @param accessToken tenant's encrypted MP access token (default), o el token
   *   en claro si `options.plaintextToken` es true (ENS-22: el master del SaaS
   *   viene del env sin cifrar; mandarlo a decrypt rompía todo billing).
   * @param options.onUnauthorized optional refresh hook (Hallazgo 4). Returns a
   *   fresh **encrypted** access token; invoked once on a 401, then the failing
   *   request is retried. Omit it for callers without a refresh path (e.g. the
   *   SaaS master account in `billing.gateway`).
   */
  constructor(
    accessToken: string,
    options?: { onUnauthorized?: () => Promise<string>; plaintextToken?: boolean },
  ) {
    this.config = options?.plaintextToken
      ? mpClientFromPlaintext(accessToken)
      : mpClient(accessToken)
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
              success: normalizeUrl(input.successUrl),
              failure: normalizeUrl(input.failureUrl),
              pending: normalizeUrl(input.pendingUrl),
            },
            auto_return: 'approved',
            external_reference: input.bookingId,
            notification_url: normalizeUrl(input.notificationUrl),
            expires: true,
            expiration_date_to: input.expiresAt.toISOString(),
            // Fable 5 P0: a booking deposit only has a 6min hold — deferred
            // methods (ticket=Rapipago/PagoFácil, atm, bank_transfer=CBU) settle
            // in 24-48h and land as `in_process`, long after the hold already
            // freed the slot. Excluding them here (not "managing a 48h window")
            // makes in_process rare instead of routine for this flow.
            payment_methods: {
              excluded_payment_types: DEPOSIT_EXCLUDED_PAYMENT_TYPES,
              // Seña en UNA cuota (decisión del dueño, 2026-08-18). Sin este
              // tope MP ofrece el máximo de cuotas disponibles, y MercadoPago
              // le libera la plata al complejo **al ritmo de las cuotas**: una
              // seña de un turno que se juega el jueves terminaba cobrándose
              // mes a mes durante un año. El costo financiero de las cuotas
              // tampoco tiene sentido sobre el 30% de una cancha.
              installments: 1,
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
      throw new MpGatewayError(`Failed to create MP preference for booking ${input.bookingId}`, err)
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
        // Fix 2b (billing R2 🔴): para un cobro recurrente de suscripción
        // (`subscription_authorized_payment`), MP liga el pago a su
        // preapproval de origen en `point_of_interaction.transaction_data
        // .subscription_id` — VERIFICADO contra un pago real de sandbox
        // (operación 167921223525 del ensayo: trae subscription_id
        // `e00ea2c8…`, el mismo preapproval que canceló K5; `linked_to` NO
        // aparece en el payload real). El tipo `TransactionData` del SDK no
        // declara el campo (SDK incompleto vs payload real), de ahí el cast
        // estructural estrecho. Ausente (`undefined`) en pagos de
        // booking-deposit normales — dunning.service.ts distingue
        // "undefined = no lo sé" de "null/otro id = confirmé que no matchea".
        preapprovalId: (
          res.point_of_interaction?.transaction_data as { subscription_id?: string } | undefined
        )?.subscription_id,
      }
    } catch (err) {
      throw new MpGatewayError(`Failed to fetch MP payment ${mpPaymentId}`, err)
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
        date_created?: string
        point_of_interaction?: { transaction_data?: { subscription_id?: unknown } }
      }>
      return results.map((r) => {
        // `subscription_id` es el MISMO camino que ya usa `getPaymentStatus`
        // (verificado contra un cobro real). Acá se propaga para que
        // `reconcile-subscriptions.worker.ts` pueda distinguir cuál de los
        // pagos del complejo pertenece al preapproval vigente. Si MP no lo
        // manda en los resultados de búsqueda queda `undefined`, y el worker
        // degrada solo (sigue con su guard de marca de agua) en vez de
        // adivinar.
        const suscripcion = r.point_of_interaction?.transaction_data?.subscription_id
        return {
          mpPaymentId: String(r.id ?? ''),
          status: mapStatus(r.status),
          amount: pesosToCents(r.transaction_amount),
          externalReference: r.external_reference ?? externalReference,
          paymentMethodId: r.payment_method_id ?? 'unknown',
          ...(typeof suscripcion === 'string' && suscripcion !== ''
            ? { preapprovalId: suscripcion }
            : {}),
          ...(typeof r.date_created === 'string' && r.date_created !== ''
            ? { dateCreated: r.date_created }
            : {}),
        }
      })
    } catch (err) {
      throw new MpGatewayError(`Failed to search MP payments for ref ${externalReference}`, err)
    }
  }

  // ─── SaaS recurring billing (P18) ────────────────────────────────────────

  async createPreapproval(input: CreatePreapprovalInput): Promise<PreapprovalResult> {
    const preapproval = new PreApproval(this.config)
    try {
      const res = await preapproval.create({
        body: {
          payer_email: input.payerEmail,
          back_url: normalizeUrl(input.returnUrl),
          reason: input.reason,
          external_reference: input.tenantId,
          status: 'pending',
          auto_recurring: {
            frequency: 1,
            frequency_type: input.frequency === 'annual' ? 'years' : 'months',
            transaction_amount: centsToPesos(input.amount),
            currency_id: 'ARS',
          },
          // `notification_url` NO está declarado en `PreApprovalRequest` del SDK
          // (sí en `PreferenceRequest`), pero la API REST de preapproval lo
          // acepta y el SDK reenvía el body tal cual — mismo hueco de tipos que
          // `point_of_interaction.transaction_data`. Va con spread + cast para
          // no ensuciar la firma entera con un `as`.
          //
          // Sin esto MP no notifica NINGÚN cobro recurrente del SaaS: el dueño
          // paga, `subscription_authorized_payment` nunca llega, y la
          // suscripción se queda en `trialing` (o entra a dunning y bloquea a
          // un complejo que ya pagó). El webhook global del panel de MP no
          // sirve como reemplazo: `api/webhooks/mercadopago/route.ts:22`
          // devuelve 400 si falta el `?tenant=` que sólo esta URL lleva.
          ...({ notification_url: normalizeUrl(input.notificationUrl) } as {
            notification_url: string
          }),
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
      throw new MpGatewayError(`Failed to create MP preapproval for tenant ${input.tenantId}`, err)
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
      throw new MpGatewayError(`Failed to cancel MP preapproval ${preapprovalId}`, err)
    }
  }

  /**
   * GET contra la API de MP por REST, no por el SDK.
   *
   * `PreApproval.get()` existe, pero para los authorized_payments el SDK no
   * expone nada y quedaría media integración por SDK y media por fetch. Una
   * sola forma es más fácil de seguir.
   *
   * El token sale del config del SDK y no de un campo propio: guardarlo dos
   * veces daría dos fuentes de verdad, y `withRefresh` reconstruye `config`
   * al refrescar — un campo aparte quedaría con el token viejo.
   *
   * `null` = 404, o sea MP no reconoce el id. No es un fallo nuestro y
   * reintentar no lo va a cambiar, así que se distingue de un error real
   * (5xx, red), que sí sube como excepción para que el job reintente.
   */
  private async mpGet(path: string): Promise<Record<string, unknown> | null> {
    const res = await fetch(`https://api.mercadopago.com${path}`, {
      headers: { Authorization: `Bearer ${this.config.accessToken}` },
    })
    if (res.status === 404) return null
    if (!res.ok) {
      throw new MpGatewayError(`MP ${path} respondió ${res.status}`)
    }
    return (await res.json()) as Record<string, unknown>
  }

  async resolveSubscriptionTenant(
    eventType: 'subscription_preapproval' | 'subscription_authorized_payment' | 'payment',
    dataId: string,
  ): Promise<string | null> {
    try {
      let preapprovalId = dataId

      if (eventType === 'payment') {
        // El cobro de una suscripción llega como `payment` común por el canal
        // global del panel. Se resuelve SÓLO si el pago está ligado a un
        // preapproval (`transaction_data.subscription_id`): una venta suelta de
        // la cuenta master —un QR, un Point— no es de ningún complejo, y una
        // seña vive en la cuenta del complejo, así que acá da 404. En los dos
        // casos `null`, que el caller ignora con 200.
        const pago = await this.mpGet(`/v1/payments/${encodeURIComponent(dataId)}`)
        if (!pago) return null
        const poi = pago.point_of_interaction as
          { transaction_data?: { subscription_id?: unknown } } | undefined
        const suscripcion = poi?.transaction_data?.subscription_id
        if (typeof suscripcion !== 'string' || suscripcion === '') return null
        preapprovalId = suscripcion
      }

      if (eventType === 'subscription_authorized_payment') {
        // El `data.id` es el cobro mensual, no el preapproval: hay que saltar
        // al padre para llegar al external_reference.
        const cobro = await this.mpGet(`/authorized_payments/${encodeURIComponent(dataId)}`)
        if (!cobro) return null
        const padre = cobro.preapproval_id
        if (typeof padre !== 'string' || padre === '') return null
        preapprovalId = padre
      }

      const preapproval = await this.mpGet(`/preapproval/${encodeURIComponent(preapprovalId)}`)
      if (!preapproval) return null

      const ref = preapproval.external_reference
      return typeof ref === 'string' && ref !== '' ? ref : null
    } catch (err) {
      if (err instanceof MpGatewayError) throw err
      throw new MpGatewayError(`Failed to resolve tenant for ${eventType} ${dataId}`, err)
    }
  }

  async getSubscriptionChargeInfo(authorizedPaymentId: string): Promise<GatewayPaymentInfo> {
    // Un cobro de suscripción NO vive en `/v1/payments`. El `data.id` del
    // evento es la FACTURA del mes (`authorized_payment`), y el pago real es
    // otro número, adentro. Verificado contra producción el 2026-08-20 con el
    // cobro real de $100:
    //
    //   GET /v1/payments/7031112147          → 404
    //   GET /authorized_payments/7031112147  → 200, payment.id = 173841538187
    //
    // Con `getPaymentStatus` este camino tiraba 404 en cada intento y el job
    // moría con el cobro ya hecho: el complejo pagaba y la suscripción se
    // quedaba en `trialing` igual.
    const cobro = await this.mpGet(
      `/authorized_payments/${encodeURIComponent(authorizedPaymentId)}`,
    )
    if (!cobro) {
      throw new MpGatewayError(`MP no reconoce el cobro de suscripción ${authorizedPaymentId}`)
    }

    const pago = cobro.payment as { id?: number | string; status?: string } | undefined

    return {
      // El id del PAGO, no el de la factura: es el que `onPaymentApproved`
      // guarda y con el que después se puede rastrear la plata en MP.
      mpPaymentId: pago?.id === undefined ? '' : String(pago.id),
      // El estado lo manda el pago de adentro. El de la factura
      // (`scheduled`/`processed`/`recycling`) describe el ciclo de cobro, no
      // el resultado; sin pago todavía no hay resultado que aplicar, y
      // `pending` es justamente el no-op del handler.
      status: pago?.status === undefined ? 'pending' : mapStatus(pago.status),
      amount: pesosToCents(
        typeof cobro.transaction_amount === 'number' ? cobro.transaction_amount : 0,
      ),
      externalReference:
        typeof cobro.external_reference === 'string' ? cobro.external_reference : '',
      paymentMethodId:
        typeof cobro.payment_method_id === 'string' ? cobro.payment_method_id : 'unknown',
      // Directo del padre, sin tener que deducirlo de
      // `point_of_interaction.transaction_data.subscription_id` como en un
      // pago suelto. `onPaymentApproved` lo usa para verificar que el cobro
      // es del preapproval VIGENTE antes de activar nada.
      preapprovalId: typeof cobro.preapproval_id === 'string' ? cobro.preapproval_id : null,
    }
  }

  async getSubscriptionState(preapprovalId: string): Promise<GatewaySubscriptionState | null> {
    try {
      const raw = await this.mpGet(`/preapproval/${encodeURIComponent(preapprovalId)}`)
      if (!raw) return null

      // `summarized` viene AUSENTE ENTERO cuando el preapproval nunca cobró
      // —no llega como `{charged_quantity: 0}`—. Medido contra la cuenta viva
      // el 2026-08-20 sobre 3 preapprovals reales sin cobros. Si esto se leyera
      // mal, un complejo en prueba se activaría solo sin haber pagado nada.
      const sum = (raw.summarized ?? {}) as Record<string, unknown>
      const conocidos: readonly string[] = ['pending', 'authorized', 'paused', 'cancelled']

      return {
        preapprovalId,
        status: conocidos.includes(String(raw.status))
          ? (raw.status as GatewaySubscriptionState['status'])
          : 'unknown',
        externalReference:
          typeof raw.external_reference === 'string' && raw.external_reference !== ''
            ? raw.external_reference
            : null,
        nextPaymentDate: parseMpDate(raw.next_payment_date),
        chargedQuantity: typeof sum.charged_quantity === 'number' ? sum.charged_quantity : 0,
        lastChargedDate: parseMpDate(sum.last_charged_date),
        lastChargedAmountCents:
          typeof sum.last_charged_amount === 'number'
            ? pesosToCents(sum.last_charged_amount)
            : null,
      }
    } catch (err) {
      if (err instanceof MpGatewayError) throw err
      throw new MpGatewayError(`Failed to fetch MP preapproval state ${preapprovalId}`, err)
    }
  }

  async updatePreapprovalAmount(preapprovalId: string, amount: number): Promise<void> {
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
      throw new MpGatewayError(`Failed to update MP preapproval amount ${preapprovalId}`, err)
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
            success: normalizeUrl(input.returnUrl),
            failure: normalizeUrl(input.returnUrl),
            pending: normalizeUrl(input.returnUrl),
          },
          auto_return: 'approved',
          external_reference: externalRef,
          notification_url: normalizeUrl(input.notificationUrl),
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
