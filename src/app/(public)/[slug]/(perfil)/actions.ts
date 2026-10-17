'use server'

import { headers } from 'next/headers'
import { getPublicTenant } from '@/modules/tenants/public.service'
import { isPublicPortalOpen } from '@/modules/tenants/tenant.lifecycle'
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
    if (!tenant || !isPublicPortalOpen(tenant.status, tenant.canceledPeriodEnd)) return

    track.funnel('profile.viewed', { tenantId: tenant.id, withDate: withDate === true })
  } catch {
    // Silenciosa a propósito: una medición caída no puede afectar a quien quiere reservar.
  }
}
