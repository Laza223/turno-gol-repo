/**
 * Gating de lifecycle de tenant por doc4 §2 (P18) — fuente única de verdad.
 *
 * - BLOCKED   → 403 siempre (ni admin ni jugador entran).
 * - READ_ONLY → 403 en métodos que escriben; el admin conserva lectura y el
 *               jugador sigue viendo sus reservas.
 * - canceled  → acceso completo hasta `current_period_end` (el sweep lo pasa a
 *               `trial_expired` en ese momento).
 * - trial_expired → el complejo que no paga (prueba vencida, mora terminada o baja al
 *               final del período): ficha pública visible sin reserva online y
 *               panel en solo lectura, salvo operar las reservas ya existentes
 *               (opt-in `allowExpired` en `staff/guards.ts`). Ver
 *               docs/decisions/2026-11-27-prueba-30-dias-y-precios.md.
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

/**
 * ¿El complejo está en `trial_expired` (no paga)? Es LA pregunta que hacen los
 * guards, las pantallas y las superficies públicas.
 *
 * `free` es el plan gratis que se termina (docs/decisions/2026-11-27-prueba-30-dias-y-precios.md):
 * mientras las filas viejas no se migren (PR posterior) se trata EXACTAMENTE
 * igual que `trial_expired`. Ningún código nuevo escribe `free`; el alias se
 * borra en el PR que migra las filas.
 */
export function isExpiredStatus(status: string): boolean {
  return status === 'trial_expired' || status === 'free'
}

/**
 * ¿La reserva online del portal está abierta según el setting del dueño y el
 * estado? Un complejo vencido nunca toma reservas online. Las superficies
 * públicas (ficha, `/explorar`, imagen de horarios) pasan solas al estado "sin
 * reserva online" con WhatsApp/Llamar.
 *
 * La autoridad es `assertOnlineBookingStatusOpen` en el alta online: esto es el
 * cache para no listar un CTA que el alta va a rechazar.
 */
export function effectiveAllowOnlineBooking(tenant: {
  status: string
  allowOnlineBookingSetting: boolean
}): boolean {
  return tenant.allowOnlineBookingSetting && !isExpiredStatus(tenant.status)
}

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
 *
 * NO se exporta (a diferencia de sus dos hermanas de arriba, que sí las lee
 * `guards.ts`): la pregunta pública se contesta con `isPublicProfileVisible`, que
 * además necesita el período pago. Exportar el `Set` pelado invita justo al
 * `Set.has(status)` suelto que este cambio vino a borrar — y `knip` lo marca
 * como export muerto, que es cómo se descubrió.
 */
const PUBLIC_UNAVAILABLE_TENANT_STATUSES: ReadonlySet<string> = new Set([
  'suspended',
  'blocked',
  'churned',
  'deleted',
])

/**
 * ¿La ficha pública del complejo se muestra? (perfil, contacto, fotos). Un
 * complejo `trial_expired` SÍ se muestra, pero sin horarios ni reserva: eso lo
 * responde `canTakeOnlineBookings`.
 *
 * `canceledPeriodEnd` es `tenant_subscriptions.current_period_end` y SOLO se
 * mira cuando el estado es `canceled` (en cualquier otro estado el dato no
 * cambia la respuesta, y por eso los callers no pagan la query para leerlo).
 * `null` con estado `canceled` = cerrado: sin período pago comprobable no se
 * abre nada.
 */
export function isPublicProfileVisible(
  status: string,
  canceledPeriodEnd: Date | null,
  now: Date = new Date(),
): boolean {
  if (PUBLIC_UNAVAILABLE_TENANT_STATUSES.has(status)) return false
  if (status !== 'canceled') return true
  return canceledPeriodEnd !== null && canceledPeriodEnd.getTime() > now.getTime()
}

/**
 * ¿El portal público toma reservas online? Todo lo que muestra horarios o
 * permite reservar (disponibilidad, checkout, torneos, bot de WhatsApp) tiene
 * que preguntar esto y no `isPublicProfileVisible`: la ficha de un complejo
 * vencido se ve, pero sin horarios.
 */
export function canTakeOnlineBookings(
  status: string,
  canceledPeriodEnd: Date | null,
  now: Date = new Date(),
): boolean {
  return !isExpiredStatus(status) && isPublicProfileVisible(status, canceledPeriodEnd, now)
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
 * el portal entero por `isPublicProfileVisible`, no por esta función.
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
 * Deliberadamente MÁS estricta que `isPublicProfileVisible` en `canceled`: un complejo
 * `canceled` se sirve normal —pagó el período— pero no se indexa. El índice de
 * un buscador sobrevive semanas o meses a la baja, así que indexarlo mandaría
 * gente a una página que para entonces está muerta. Mismo criterio por el que
 * el sitemap se queda en `VISIBLE_TENANT_STATUSES` (search.service.ts).
 */
export function isPublicPortalIndexable(status: string): boolean {
  return !PUBLIC_UNAVAILABLE_TENANT_STATUSES.has(status) && status !== 'canceled'
}
