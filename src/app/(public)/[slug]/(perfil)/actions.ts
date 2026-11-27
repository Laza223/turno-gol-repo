'use server'

import { headers } from 'next/headers'
import { getPublicTenant } from '@/modules/tenants/public.service'
import { isExpiredStatus, isPublicProfileVisible } from '@/modules/tenants/tenant.lifecycle'
import { track } from '@/shared/observability'
import { enforce, parseClientIp } from '@/shared/rate-limit'
import { slug as slugSchema } from '@/shared/validation/primitives'

/**
 * Paso `profile.viewed` del embudo público: alguien vio las horas de la ficha del complejo.
 *
 * Sale de una Server Action y no del render porque la ficha es ISR (`revalidate = 300`): emitirlo
 * desde la page contaría regeneraciones de cache, no visitas (ver la nota de `portal.viewed` en
 * `breadcrumbs.ts`). El cliente la llama una vez por pestaña, después de la primera carga de
 * horas; `withDate` dice si la URL traía un día elegido.
 *
 * Es medición, no negocio: nunca rompe la página ni devuelve un error que mostrar. Un slug
 * inválido, un complejo que no existe o no está abierto al público, el límite de la IP o una
 * falla de la lectura terminan igual: sin evento y sin ruido.
 */
export async function trackProfileViewedAction(slug: string, withDate: boolean): Promise<void> {
  try {
    const parsed = slugSchema.safeParse(slug)
    if (!parsed.success) return

    // Antes de tocar la base: quien llame la action en bucle no paga una lectura por cada vuelta.
    const limit = await enforce('profileViewed', parseClientIp(await headers()))
    if (!limit.ok) return

    const tenant = await getPublicTenant(parsed.data)
    if (!tenant || !isPublicProfileVisible(tenant.status, tenant.canceledPeriodEnd)) return

    track.funnel('profile.viewed', { tenantId: tenant.id, withDate: withDate === true })
  } catch {
    // Silenciosa a propósito: una medición caída no puede afectar a quien quiere reservar.
  }
}

/**
 * Clic de contacto (WhatsApp o teléfono) en la ficha de un complejo en `trial_expired`
 * (docs/decisions/2026-11-27-prueba-30-dias-y-precios.md §4.6). Va a `analytics_events` y
 * soporte lo mira en la ficha del complejo para recuperarlo. Sin PII: solo el complejo y el canal.
 *
 * Mismo molde que `trackProfileViewedAction`: es medición, así que nunca tira ni devuelve error.
 * Solo emite si el complejo está hoy en `trial_expired` (o su alias `free`): el clic en la ficha
 * de un complejo que paga no es una señal de recuperación y no se guarda.
 */
export async function trackExpiredContactAction(slug: string, channel: string): Promise<void> {
  try {
    const parsed = slugSchema.safeParse(slug)
    if (!parsed.success) return
    if (channel !== 'whatsapp' && channel !== 'phone') return

    const limit = await enforce('expiredContactClick', parseClientIp(await headers()))
    if (!limit.ok) return

    const tenant = await getPublicTenant(parsed.data)
    if (!tenant || !isExpiredStatus(tenant.status)) return

    track.funnel('expired.contact_clicked', { tenantId: tenant.id, channel })
  } catch {
    // Silenciosa a propósito: una medición caída no puede afectar a quien quiere contactar.
  }
}
