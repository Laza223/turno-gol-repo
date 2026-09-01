import { z } from 'zod'
import { computeMpMockEnabled } from './mock-mp'

const MP_ID_RE = /^\d{1,32}$/
/**
 * Los ids de SUSCRIPCIÓN de MercadoPago no son numéricos: un preapproval se
 * identifica con un hash de 32 hex (`5c6294a93fe04f309344f654479e633b`).
 *
 * Verificado en producción el 2026-08-20 contra el endpoint real: un
 * `subscription_preapproval` con su id de verdad moría acá con
 * `400 invalid payload`, ANTES de la firma y de resolver el complejo. El cobro
 * recurrente del SaaS no podía llegar nunca, y el síntoma que veía el dueño era
 * "Sin plan elegido" después de pagar.
 */
const MP_SUBSCRIPTION_ID_RE = /^[0-9a-f]{32}$/
// Mock payment ids (only accepted when MP_MOCK_MODE=1): MOCK-(APPROVED|REJECTED)-<uuid>
const MOCK_MP_ID_RE = /^MOCK-(APPROVED|REJECTED)-[0-9a-fA-F-]{36}$/

/** Los dos tipos de evento cuyo `data.id` puede ser un hash de suscripción. */
const SUBSCRIPTION_EVENT_TYPES = new Set([
  'subscription_preapproval',
  'subscription_authorized_payment',
])

/**
 * El complejo revocó, DESDE EL PANEL DE MERCADOPAGO, el permiso que le había
 * dado a TurnoGol para cobrar en su nombre.
 *
 * El string es evidencia observada, no inventado: aparece así en el historial
 * de webhooks de la aplicación de Suscripciones
 * (`400 - Fallida · application.deauthorized · 381048203 · 22/08 13:44 UTC`,
 * leído del panel el 2026-08-28).
 *
 * `data.id` NO necesita una excepción en el `superRefine` de abajo: lo que trae
 * es el id de usuario de MercadoPago, numérico, que `MP_ID_RE` ya acepta. Por
 * eso el evento del 22/8 murió en "missing tenant" y no en "invalid payload".
 */
export const MP_DEAUTHORIZED_EVENT = 'application.deauthorized'

/**
 * `true` si el aviso es una desvinculación.
 *
 * Mira `type` **y** `action` porque MercadoPago no usa un solo criterio para
 * nombrar sus eventos: en unos el nombre fino va en `action` (`payment.created`
 * sobre `type: 'payment'`) y en otros el `type` ya es el nombre completo. El
 * panel muestra una sola columna y no distingue cuál de los dos campos lo
 * traía, y la documentación de MercadoPago no es alcanzable desde el entorno
 * donde se escribió esto. Aceptar cualquiera de los dos cubre las dos
 * codificaciones sin adivinar ninguna: el string exacto es el mismo en ambas.
 */
export function isMpDeauthorizationEvent(payload: {
  type: string
  action?: string | undefined
}): boolean {
  return payload.type === MP_DEAUTHORIZED_EVENT || payload.action === MP_DEAUTHORIZED_EVENT
}

/**
 * MP IPN/webhook v2 payload. The top-level `id` is the **event id** (idempotency
 * key); `data.id` is the MP payment id (used to fetch payment details).
 *
 * El formato válido de `data.id` DEPENDE DEL `type`, así que se valida a nivel
 * del objeto y no del campo: un `payment` sigue siendo estrictamente numérico
 * —su id se interpola en la URL de la API de pagos— y sólo los eventos de
 * suscripción admiten además el hash de 32 hex.
 */
export const webhookPayloadSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform((v) => String(v)),
    type: z.string(),
    action: z.string().optional(),
    data: z.object({
      id: z.union([z.string(), z.number()]).transform((v) => String(v)),
    }),
    date_created: z.string().optional(),
    user_id: z.union([z.string(), z.number()]).optional(),
    api_version: z.string().optional(),
    live_mode: z.boolean().optional(),
  })
  .superRefine((payload, ctx) => {
    const id = payload.data.id
    const valido =
      MP_ID_RE.test(id) ||
      (SUBSCRIPTION_EVENT_TYPES.has(payload.type) && MP_SUBSCRIPTION_ID_RE.test(id)) ||
      // Mock ids are accepted only when the env-mock gateway is active.
      // Use the same hard gate as the rest of the system
      // (`MP_MOCK_MODE=1` AND `NODE_ENV !== 'production'`) so a leaked
      // `MP_MOCK_MODE=1` in prod can't make the schema accept MOCK-* ids.
      (computeMpMockEnabled() && MOCK_MP_ID_RE.test(id))
    if (!valido) {
      ctx.addIssue({ code: 'custom', message: 'invalid mpPaymentId', path: ['data', 'id'] })
    }
  })

// ── Output (response) contracts — doc15 §2 ────────────────────────────────────
// The MP webhook ACKs with a tiny body: `{ ok: true }`, plus `ignored` for
// event types we deliberately skip. Error paths keep their compact machine-facing
// shape and are not validated here.
export const webhookResponseSchema = z.strictObject({
  ok: z.literal(true),
  ignored: z.string().optional(),
})

// Deposit/payment status as polled by the player on the pending-payment screen
// (GET /api/player/bookings/:id/status → `{ data: { status, depositStatus, expiresAt } }`).
export const paymentStatusResponseSchema = z.strictObject({
  data: z.strictObject({
    status: z.enum([
      'pending_payment',
      'confirmed',
      'expired',
      'canceled_refunded',
      'canceled_no_refund',
      'completed',
      'no_show',
    ]),
    depositStatus: z.enum(['not_required', 'pending', 'paid', 'refunded', 'captured']),
    expiresAt: z.string(),
  }),
})
