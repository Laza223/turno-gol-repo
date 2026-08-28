import { type NextRequest, NextResponse } from 'next/server'
import { getBoss } from '@/shared/jobs/boss'
import { MP_WEBHOOK_SEND_OPTIONS, QUEUE_PROCESS_MP_WEBHOOK } from '@/shared/jobs/queue-names'
import { webhookPayloadSchema, webhookResponseSchema } from '@/modules/payments/payment.schema'
import { handleMpWebhookJob, type MpWebhookJob } from '@/modules/payments/mp-webhook.handler'
import { verifyWebhookSignature, webhookSecretsStatus } from '@/modules/payments/webhook-auth'
import { MP_MOCK_ENABLED } from '@/modules/payments/mock-mp'
import { getBillingGateway } from '@/modules/billing/billing.gateway'
import { track, withSpan } from '@/shared/observability'
import { logger } from '@/shared/lib/logger'
import { validatedJson } from '@/shared/api-output'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Forma del `data.id` sin exponer el id en sí.
 *
 * Los ids de MP no son secretos, pero tampoco hacen falta para diagnosticar:
 * lo que importa es si el formato era el que el schema espera. Esto es lo que
 * distingue "MP mandó algo raro" de "nuestra validación está de más".
 */
function formaDelId(valor: unknown): string {
  if (typeof valor === 'number') return `numerico(${String(valor).length})`
  if (typeof valor !== 'string') return `${typeof valor}`
  if (valor === '') return 'vacio'
  if (/^\d+$/.test(valor)) return `numerico(${valor.length})`
  if (/^[0-9a-f]+$/i.test(valor)) return `hex(${valor.length})`
  return `otro(${valor.length})`
}

/** Lee un campo de nivel superior del body crudo sin confiar en su tipo. */
function campoCrudo(body: unknown, campo: string): unknown {
  if (typeof body !== 'object' || body === null) return undefined
  return (body as Record<string, unknown>)[campo]
}

/**
 * Rechaza el webhook DEJANDO RASTRO de por qué.
 *
 * Sin esto, los rechazos eran indistinguibles en los logs de Vercel: sólo se
 * veía `POST /api/webhooks/mercadopago 400`, y averiguar la causa costaba
 * reproducir el payload a mano contra producción. Pasó dos veces seguidas con
 * el cobro de suscripciones (#176 y #177), así que el rechazo mudo es en sí
 * mismo el bug a corregir.
 *
 * Lo que se loguea es forma, no contenido: el tipo de evento y el formato del
 * id, nunca el payload entero ni nada que identifique a una persona.
 */
function rechazar(motivo: string, status: number, body: unknown): NextResponse {
  const tipo = campoCrudo(body, 'type')
  logger.warn('mp-webhook: evento rechazado', {
    module: 'mp-webhook',
    motivo,
    status,
    eventType: typeof tipo === 'string' ? tipo.slice(0, 64) : `${typeof tipo}`,
    formaDataId: formaDelId(campoCrudo(campoCrudo(body, 'data'), 'id')),
  })
  return NextResponse.json({ error: motivo }, { status })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return rechazar('invalid json', 400, null)
  }

  const parsed = webhookPayloadSchema.safeParse(body)
  if (!parsed.success) {
    return rechazar('invalid payload', 400, body)
  }
  const payload = parsed.data

  const xSignature = req.headers.get('x-signature')
  const xRequestId = req.headers.get('x-request-id')
  const dataId = url.searchParams.get('data.id') ?? payload.data.id

  // La firma se valida ANTES de resolver el complejo: resolverlo cuesta una
  // llamada a MercadoPago, y ese trabajo no se le regala a quien no probó
  // todavía que el evento es de MP.
  if (!verifyWebhookSignature(xSignature, xRequestId, dataId)) {
    // Una firma rechazada con alguna clave SIN configurar no es tráfico hostil:
    // es un aviso legítimo de MercadoPago que se está tirando a la basura con el
    // pago ya hecho del otro lado y la reserva colgada. `rechazar` loguea `warn`,
    // que no llega a Sentry — por eso esto va aparte y como `error`.
    //
    // La clave de Checkout Pro es `.optional()` en `env.ts` a propósito (exigirla
    // apagaría toda la app si un deploy le gana a la carga de la variable), así
    // que el arranque nunca va a avisar de su ausencia: este es el único lugar
    // donde se puede notar. Caso real: 2026-08-28, la sonda de firma de Checkout
    // Pro dio 401 en producción y el 401 era mudo.
    const secretos = webhookSecretsStatus()
    if (!secretos.suscripciones || !secretos.checkout) {
      logger.error('mp-webhook: firma rechazada con una clave de webhook sin configurar', {
        module: 'mp-webhook',
        suscripcionesConfigurada: secretos.suscripciones,
        checkoutConfigurada: secretos.checkout,
      })
    }
    return rechazar('invalid signature', 401, body)
  }

  // De qué complejo es este evento.
  //
  // En las señas viene en la URL: TurnoGol arma una `notification_url` por
  // operación con `?tenant=`. En las SUSCRIPCIONES no puede — MP **no guarda**
  // `notification_url` en un preapproval (verificado en producción el
  // 2026-08-20: el PUT devuelve 200 y el campo sigue vacío), así que notifica
  // por el canal global del panel, que es una URL fija sin query.
  //
  // Hasta hoy eso era un 400 y el cobro recurrente del SaaS no llegaba nunca:
  // el complejo pagaba, MP le cobraba todos los meses y la suscripción se
  // quedaba en `trialing`. Ahora se le pregunta a MP de quién es, vía el
  // `external_reference` que `createPreapproval` ya guarda.
  //
  // Y el cobro llega como `payment`, no como evento de suscripción: en el
  // historial de notificaciones de producción del 2026-08-20 las dos únicas
  // entregas del día fueron `payment.created` con el id del pago, con "Planes y
  // suscripciones" tildado en el panel igual. Por eso `payment` sin `?tenant=`
  // ya no es un 400 automático: se le pregunta a MP, y sólo resuelve si el pago
  // está ligado a un preapproval.
  //
  // Es MÁS estricto que confiar en el query, no menos: el complejo lo dice
  // MercadoPago, no quien manda el request. El cross-check de
  // `mp-webhook.handler` contra `external_reference` sigue en pie para el
  // camino con `?tenant=`.
  let tenantId = url.searchParams.get('tenant')
  /**
   * El complejo lo dijo MercadoPago y no la URL. Vale como `source=saas`: si MP
   * reconoce el pago con el token MASTER, la plata está en la cuenta de
   * TurnoGol y no en la del complejo.
   */
  let resueltoPorMp = false
  if (!tenantId) {
    if (
      payload.type !== 'subscription_preapproval' &&
      payload.type !== 'subscription_authorized_payment' &&
      payload.type !== 'payment'
    ) {
      return rechazar('missing tenant', 400, body)
    }
    try {
      tenantId = await getBillingGateway().resolveSubscriptionTenant(payload.type, payload.data.id)
      resueltoPorMp = tenantId !== null
    } catch (err) {
      // Error real contra MP (5xx, red, timeout): 500 para que MP reintente.
      logger.error('mp-webhook: no se pudo resolver el complejo del evento', {
        module: 'mp-webhook',
        eventType: payload.type,
        mpEventId: payload.id,
        error: err instanceof Error ? err.message : String(err),
      })
      return NextResponse.json({ error: 'tenant lookup failed' }, { status: 500 })
    }
    if (!tenantId) {
      // MP no reconoce el id, o el preapproval no tiene `external_reference`
      // (los creados fuera de TurnoGol, p. ej. a mano en el panel). 200 a
      // propósito: reintentarlo no lo va a resolver nunca.
      return validatedJson(
        webhookResponseSchema,
        { ok: true, ignored: payload.type },
        'POST /api/webhooks/mercadopago',
      )
    }
  }

  track.webhook('mp.webhook.received', {
    mpEventId: payload.id,
    tenantId,
    eventType: payload.type,
    mpPaymentId: payload.data.id,
  })

  // Handled types:
  //   - `payment`                          → booking deposit OR SaaS upgrade proration
  //   - `subscription_authorized_payment`  → SaaS recurring charge (preapproval child)
  //   - `subscription_preapproval`         → preapproval lifecycle change (cancel / hold)
  const HANDLED_TYPES = new Set([
    'payment',
    'subscription_authorized_payment',
    'subscription_preapproval',
  ])
  if (!HANDLED_TYPES.has(payload.type)) {
    return validatedJson(
      webhookResponseSchema,
      { ok: true, ignored: payload.type },
      'POST /api/webhooks/mercadopago',
    )
  }

  // `source=saas` lo pone TurnoGol al crear el preapproval / la preferencia de
  // proraeo (billing.service.computeNotificationUrl): marca que el pago vive en
  // la cuenta MASTER y no en el MP del complejo. Se normaliza a un literal para
  // no propagar texto arbitrario de la query al job.
  const source =
    url.searchParams.get('source') === 'saas' || resueltoPorMp ? ('saas' as const) : undefined

  const job: MpWebhookJob = {
    tenantId,
    mpEventId: payload.id,
    eventType: payload.type,
    mpPaymentId: payload.data.id,
    rawPayload: payload,
    ...(source ? { source } : {}),
  }

  try {
    await withSpan('mp.webhook.process', 'webhook.mp', async () => {
      if (MP_MOCK_ENABLED) {
        await handleMpWebhookJob(job) // process inline → deterministic for E2E
      } else {
        const boss = await getBoss()
        await boss.send(QUEUE_PROCESS_MP_WEBHOOK, job, MP_WEBHOOK_SEND_OPTIONS)
      }
    })
  } catch (err) {
    // Enqueue/processing failure → MP will retry. Return 5xx so MP doesn't mark delivered.
    logger.error('webhook processing failed', {
      module: 'mp-webhook',
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'enqueue failed' }, { status: 500 })
  }

  return validatedJson(webhookResponseSchema, { ok: true }, 'POST /api/webhooks/mercadopago')
}
