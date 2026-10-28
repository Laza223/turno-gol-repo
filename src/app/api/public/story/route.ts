import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { dateStr, hhmm, slug } from '@/shared/validation/primitives'
import { getPublicAvailability, getPublicTenant } from '@/modules/tenants/public.service'
import { isPublicPortalOpen } from '@/modules/tenants/tenant.lifecycle'
import { buildStoryModel, STORY_FAILURE_MESSAGES } from '@/modules/tenants/story-summary'
import { MAX_HOURS } from '@/lib/story-image/model'
import { renderStoryPng } from '@/lib/story-image/render'
import { buildPublicLinkUrl } from '@/lib/utils'
import { addDays, artNowParts } from '@/shared/dates/art'
import { captureException } from '@/lib/sentry'
import { badRequest, conflict, internal, notFound } from '@/shared/api-error'

// Node y no edge: lee las fuentes con `fs` y el servicio de disponibilidad usa el
// driver de Postgres.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const querySchema = z.object({
  slug,
  date: dateStr,
  // Las horas que el dueño eligió ('20:00,21:00'). Sin el parámetro, las primeras libres.
  hours: z
    .string()
    .transform((value) => value.split(','))
    .pipe(z.array(hhmm).min(1).max(MAX_HOURS))
    .refine((list) => new Set(list).size === list.length)
    .optional(),
})

/**
 * Placa 9:16 (1080×1920) con los turnos libres de un día, para subir a una
 * historia de Instagram o a un estado de WhatsApp.
 *
 * Es pública por el mismo motivo que `/api/public/availability`: todo lo que
 * dibuja ya lo muestra el portal del complejo, y así se puede pedir con un
 * simple GET y cachear en el CDN. El tope de renders por IP vive en el
 * middleware (política `publicStory`).
 *
 * Los errores usan el envelope estándar: el diálogo del panel muestra el
 * `message` tal cual ("No quedan turnos libres ese día…").
 */
export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse({
    slug: req.nextUrl.searchParams.get('slug'),
    date: req.nextUrl.searchParams.get('date'),
    hours: req.nextUrl.searchParams.get('hours') ?? undefined,
  })
  if (!parsed.success) {
    return badRequest('Faltan el complejo o el día, o los horarios no son válidos.', {
      code: 'INVALID_PARAMS',
    })
  }
  const { slug: tenantSlug, date, hours } = parsed.data

  const now = artNowParts()

  try {
    const tenant = await getPublicTenant(tenantSlug)
    // Mismo gate que el portal: un complejo suspendido, bloqueado o dado de baja
    // no muestra turnos ni por acá.
    if (!tenant || !isPublicPortalOpen(tenant.status, tenant.canceledPeriodEnd)) {
      return notFound('No encontramos ese complejo.')
    }

    if (date < now.date || date > addDays(now.date, tenant.bookingAdvanceDays)) {
      return badRequest('Elegí un día entre hoy y los próximos días de reserva.', {
        code: 'DATE_OUT_OF_RANGE',
      })
    }

    // El origin cubre el caso de que NEXT_PUBLIC_APP_URL falte: sin base
    // absoluta la placa mostraría un link inservible.
    const portalUrl = buildPublicLinkUrl(
      process.env.NEXT_PUBLIC_APP_URL,
      req.nextUrl.origin,
      tenant.slug,
    )
    if (!portalUrl) throw new Error('No se pudo resolver la URL pública del complejo')

    const availability = await getPublicAvailability(tenant, date)
    const result = buildStoryModel({
      tenant,
      availability,
      todayStr: now.date,
      portalUrl,
      only: hours,
    })
    if (!result.ok) {
      return conflict(STORY_FAILURE_MESSAGES[result.reason], {
        code: `STORY_${result.reason.toUpperCase()}`,
      })
    }

    const png = await renderStoryPng(result.model)
    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        // Sin stale-while-revalidate a propósito: la placa muestra qué horarios
        // están libres AHORA, y servirla vencida es ofrecer turnos ya tomados.
        'Cache-Control': 'public, s-maxage=30',
      },
    })
  } catch (err) {
    captureException(err)
    return internal('No se pudo generar la imagen.')
  }
}
