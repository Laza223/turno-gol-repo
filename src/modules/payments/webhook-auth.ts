import { createHmac, timingSafeEqual } from 'node:crypto'
import { logger } from '@/shared/lib/logger'
import { MP_MOCK_ENABLED } from '@/modules/payments/mock-mp'
import { isNonProductionRuntime } from '@/shared/runtime-env'

/**
 * Validates Mercado Pago webhook signatures via HMAC SHA-256.
 * Manifest format: `id:{data.id};request-id:{x-request-id};ts:{ts};`
 *
 * `data.id` is lowercased per MP spec: MP returns alphanumeric IDs in
 * uppercase (e.g. subscription/preapproval `ORD01...`) but the manifest
 * must use them lowercase or the HMAC won't match.
 *
 * **Dos claves, una por aplicación de MercadoPago.** TurnoGol tiene DOS
 * aplicaciones de MP —una de Suscripciones para el cobro del plan SaaS con el
 * token master, otra de Checkout Pro para el OAuth con el que cada complejo
 * cobra sus señas— y MercadoPago **genera una clave secreta de webhook por
 * aplicación** (panel: Webhooks → Configurar notificaciones). Los avisos de las
 * dos entran por el MISMO buzón, así que validar contra una sola clave
 * rechazaría con 401 todo lo que firme la otra: el pago hecho en MP y la
 * reserva colgada, en silencio salvo por el log de `rechazar()`.
 *
 * Con una sola clave configurada el comportamiento es idéntico al que había
 * antes de que existiera la segunda, así que el orden de deploy es libre: el
 * código puede ir a producción antes que la variable.
 *
 * Behavior:
 *   - MP_MOCK_ENABLED → bypass validation (E2E/Local dev without ngrok).
 *   - missing headers/env → fail closed (unless not production and no secret).
 *   - valid HMAC against MP_WEBHOOK_SECRET (app de Suscripciones) or
 *     MP_WEBHOOK_SECRET_CHECKOUT (app de Checkout Pro) → return true si además
 *     el `ts` del manifiesto entra en la ventana de antigüedad (`notTooOld`,
 *     abajo). El compare es timing-safe. Se prueba primero la de Suscripciones
 *     sólo por costo: es la histórica y hoy firma la mayoría del tráfico.
 *   - invalid against BOTH, but isNonProductionRuntime() AND
 *     MP_WEBHOOK_TEST_BYPASS_SECRET is set → retry the SAME HMAC check against
 *     that secret (MP-WEBHOOK-001: lets scripts/replay-mp-webhook.ts sign
 *     fixtures without ever needing the real MP_WEBHOOK_SECRET). Still a real
 *     signature check, not a skip — and hard-gated so a leaked value can never
 *     validate anything in production, same pattern as MP_MOCK_ENABLED above.
 */
export function verifyWebhookSignature(
  xSignature: string | null,
  xRequestId: string | null,
  dataId: string | null,
): boolean {
  if (MP_MOCK_ENABLED) return true

  const secrets = [process.env.MP_WEBHOOK_SECRET, process.env.MP_WEBHOOK_SECRET_CHECKOUT].filter(
    (value): value is string => Boolean(value),
  )
  // Sin NINGUNA clave configurada: mismo fail-open acotado de siempre (dev/test
  // sin secrets), fail-closed en producción.
  if (secrets.length === 0) return process.env.NODE_ENV !== 'production'

  if (!xSignature || !xRequestId || !dataId) return false

  // Parse `ts` and `v1` from x-signature (e.g. "ts=123,v1=abc")
  let ts = ''
  let v1 = ''
  for (const part of xSignature.split(',')) {
    const [key, val] = part.split('=')
    if (key === 'ts') ts = val?.trim()
    else if (key === 'v1') v1 = val?.trim()
  }

  if (!ts || !v1) return false

  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`

  if (secrets.some((secret) => matchesHmac(secret, manifest, v1))) return notTooOld(ts)

  const testSecret = process.env.MP_WEBHOOK_TEST_BYPASS_SECRET
  if (testSecret && isNonProductionRuntime()) {
    return matchesHmac(testSecret, manifest, v1) && notTooOld(ts)
  }

  return false
}

/**
 * Ventana de antigüedad del `ts` del manifiesto.
 *
 * Seis horas es enorme para lo que mide: MercadoPago reintenta cada 15 minutos
 * y después espacia, así que ni una cadena larga de reintentos llega acá. El
 * margen es deliberado — este chequeo puede RECHAZAR un aviso de un pago ya
 * cobrado, y ese error cuesta plata; el que evita (repetir un aviso firmado
 * cuyas ramas ya son idempotentes por `processed_webhooks`) no cuesta nada.
 * Lo que cierra es el replay INDEFINIDO, que era el hallazgo.
 */
const WEBHOOK_TS_TOLERANCE_MS = 6 * 60 * 60 * 1000

/**
 * `false` sólo cuando hay certeza de que el aviso es viejo. Cualquier duda
 * —`ts` ilegible, fechado en el futuro por desfasaje de reloj— acepta: la firma
 * ya dio bien y antes de este chequeo no había ninguna ventana, así que
 * fallar abierto acá nunca es peor que el comportamiento anterior.
 *
 * MercadoPago documenta el `ts` en milisegundos, pero la normalización existe
 * igual: si algún día llegara en segundos, restarlo crudo daría una antigüedad
 * de décadas y rechazaría TODOS los avisos de producción a la vez.
 */
function notTooOld(ts: string): boolean {
  const raw = Number(ts)
  if (!Number.isFinite(raw) || raw <= 0) return true
  // Menos de 1e12 no puede ser un instante en milisegundos posterior a 2001.
  const emitidoMs = raw < 1e12 ? raw * 1000 : raw
  const edadMs = Date.now() - emitidoMs
  if (edadMs <= WEBHOOK_TS_TOLERANCE_MS) return true

  // `error` y no `warn`: si esto aparece, un aviso con firma VÁLIDA se está
  // tirando por antigüedad, y eso puede ser un pago cobrado que no se registró.
  // Es la señal de que la ventana quedó corta. Sin id ni firma en el log.
  logger.error('mp-webhook: firma válida pero el aviso es demasiado viejo', {
    module: 'mp-webhook',
    edadHoras: Math.round(edadMs / 3_600_000),
    toleranciaHoras: WEBHOOK_TS_TOLERANCE_MS / 3_600_000,
  })
  return false
}

/**
 * Qué claves de webhook están configuradas, sin exponer ningún valor.
 *
 * Existe para que una firma rechazada se pueda diagnosticar: con las dos claves
 * puestas, un 401 puede ser tráfico hostil; con una faltando, es un error de
 * configuración y significa que los avisos de esa aplicación se están tirando a
 * la basura con el pago ya hecho del otro lado. Caso real: el 2026-08-28 la
 * sonda de firma de Checkout Pro dio 401 en producción y el único rastro era un
 * `logger.warn` que no distinguía entre las dos causas.
 */
export function webhookSecretsStatus(): { suscripciones: boolean; checkout: boolean } {
  return {
    suscripciones: Boolean(process.env.MP_WEBHOOK_SECRET),
    checkout: Boolean(process.env.MP_WEBHOOK_SECRET_CHECKOUT),
  }
}

function matchesHmac(secret: string, manifest: string, v1: string): boolean {
  const expectedSignature = createHmac('sha256', secret).update(manifest).digest('hex')

  const a = Buffer.from(v1)
  const b = Buffer.from(expectedSignature)

  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
