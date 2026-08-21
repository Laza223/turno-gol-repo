/**
 * Gating de lifecycle de tenant por doc4 §2 (P18) — fuente única de verdad.
 *
 * - BLOCKED   → 403 siempre (ni admin ni jugador entran).
 * - READ_ONLY → 403 en métodos que escriben; el admin conserva lectura y el
 *               jugador sigue viendo sus reservas.
 * - canceled  → acceso completo hasta `current_period_end` (el sweep lo pasa a
 *               `blocked` en ese momento).
 * - active / trialing / past_due → acceso completo.
 *
 * Vive acá y no en el middleware que las estrenó (`@/server/middleware/with-tenant`)
 * porque son estados de `tenants.status`, o sea dominio: las consumen tanto el
 * wrapper de route handler como `@/modules/staff/guards.ts` (Server Actions y
 * pages). Con las constantes del lado del middleware, `guards.ts` terminaba
 * importando `@/server` desde `@/modules` — la dirección al revés (B6).
 */
import { artDateOf, todayART } from '@/shared/time/art-date'

/** Estados en los que el complejo no tiene acceso a nada. */
export const BLOCKED_TENANT_STATUSES = new Set(['blocked', 'churned', 'deleted'])

/** Estados en los que el complejo puede leer pero no escribir. */
export const READ_ONLY_TENANT_STATUSES = new Set(['suspended'])

// ─── Superficie pública (portal del jugador) ────────────────────────────────

/**
 * Estados en los que el portal público del complejo no se muestra (perfil,
 * disponibilidad, checkout, torneos).
 *
 * `canceled` NO está acá: doc4 §2 le promete al jugador "Completo hasta fin
 * período", igual que al admin. Hasta 2026-08-20 estos cinco estados vivían
 * copiados como un `Set` literal en cada página de `(public)/[slug]/*` y sí
 * incluían `canceled`, así que la baja voluntaria apagaba la reserva online
 * —lo que el complejo compró— en el mismo instante en que se daba de baja,
 * con el período ya cobrado por delante. El corte real lo hace el sweep
 * `canceled → blocked` (`dunning-retry.worker.ts`) cuando vence el período.
 *
 * `suspended` sí queda afuera: es mora, no baja, y el jugador conserva sus
 * reservas existentes por otras vías (doc4 §2 nota).
 */
export const PUBLIC_UNAVAILABLE_TENANT_STATUSES: ReadonlySet<string> = new Set([
  'suspended',
  'blocked',
  'churned',
  'deleted',
])

/**
 * ¿El portal público del complejo está abierto?
 *
 * `canceledPeriodEnd` es `tenant_subscriptions.current_period_end` y SOLO se
 * mira cuando el estado es `canceled` (en cualquier otro estado el dato no
 * cambia la respuesta, y por eso los callers no pagan la query para leerlo).
 * `null` con estado `canceled` = cerrado: sin período pago comprobable no se
 * abre nada.
 */
export function isPublicPortalOpen(
  status: string,
  canceledPeriodEnd: Date | null,
  now: Date = new Date(),
): boolean {
  if (PUBLIC_UNAVAILABLE_TENANT_STATUSES.has(status)) return false
  if (status !== 'canceled') return true
  return canceledPeriodEnd !== null && canceledPeriodEnd.getTime() > now.getTime()
}

/**
 * Anticipación de reserva efectiva del portal público: la configurada por el
 * complejo (`settings.booking_advance_days`), recortada para que un complejo
 * `canceled` no pueda vender turnos POSTERIORES al período que ya pagó.
 *
 * Sin el recorte, con la anticipación default de 6 días el último día del
 * período se podía reservar hasta 6 días DESPUÉS del corte: turnos que el
 * complejo ya no puede ver ni gestionar (queda `blocked`) y con la seña
 * cobrada en su MercadoPago. Decisión del dueño, 2026-08-20.
 *
 * Granularidad de día a propósito: `bookings.date` es un día operativo y toda
 * la ventana de anticipación del sistema se compara como string 'YYYY-MM-DD',
 * así que el último día reservable es el día ART de `current_period_end`.
 * Devuelve 0 (solo hoy) antes que un negativo — un período ya vencido cierra
 * el portal entero por `isPublicPortalOpen`, no por esta función.
 */
export function publicBookingAdvanceDays(
  configuredDays: number,
  status: string,
  canceledPeriodEnd: Date | null,
  todayStr: string = todayART(),
): number {
  if (status !== 'canceled' || canceledPeriodEnd === null) return configuredDays
  const lastBookableDate = artDateOf(canceledPeriodEnd)
  const remaining = Math.floor(
    (Date.parse(`${lastBookableDate}T00:00:00Z`) - Date.parse(`${todayStr}T00:00:00Z`)) /
      86_400_000,
  )
  return Math.max(0, Math.min(configuredDays, remaining))
}

/**
 * ¿La página pública del complejo se ofrece a los buscadores?
 *
 * Deliberadamente MÁS estricta que `isPublicPortalOpen`: un complejo
 * `canceled` se sirve normal —pagó el período— pero no se indexa. El índice de
 * un buscador sobrevive semanas o meses a la baja, así que indexarlo mandaría
 * gente a una página que para entonces está muerta. Mismo criterio por el que
 * el sitemap se queda en `VISIBLE_TENANT_STATUSES` (search.service.ts).
 */
export function isPublicPortalIndexable(status: string): boolean {
  return !PUBLIC_UNAVAILABLE_TENANT_STATUSES.has(status) && status !== 'canceled'
}
