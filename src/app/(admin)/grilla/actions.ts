'use server'

import { z } from 'zod'
import { getImpersonationSession } from '@/modules/auth/impersonation.server'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { track } from '@/shared/observability/breadcrumbs'
import type { ActionResult } from '@/shared/types/action-result'

const storyExportSchema = z.object({
  // `link`: compartió o copió solo el enlace, sin la imagen.
  method: z.enum(['share', 'download', 'link']),
  // Ventana de reserva: `booking_advance_days` no pasa de un mes.
  daysAhead: z.number().int().min(0).max(31),
})

/**
 * Cuenta que un complejo compartió o descargó la placa de turnos libres.
 *
 * Es la única medición del feature (el freeze pide poder medir): se lee como
 * "cuántos complejos distintos" sobre `analytics_events`. Se llama desde el
 * cliente DESPUÉS de que el share sheet resolvió o la descarga arrancó, y es
 * best-effort: si falla, el dueño ya tiene su imagen y no se entera.
 */
export async function trackStoryExportAction(input: unknown): Promise<ActionResult> {
  const parsed = storyExportSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Datos inválidos.' }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  // Un superadmin que prueba la placa impersonando a un complejo no es ese
  // complejo usándola: contarlo inflaría el único número que mide el feature.
  if (await getImpersonationSession()) return { success: true }

  track.story('story.exported', { tenantId: tenant.id, ...parsed.data })
  return { success: true }
}
