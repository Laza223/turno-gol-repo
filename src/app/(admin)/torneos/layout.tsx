import type { ReactNode } from 'react'
import { notFound, redirect } from 'next/navigation'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { isFeatureEnabled } from '@/shared/feature-flags'
import { TOURNAMENTS_FLAG } from '@/modules/tournaments/tournament.flags'

/**
 * F-009 (QA prod 2026-08-17): mismo patrón que (public)/[slug]/layout.tsx —
 * `torneos/loading.tsx` mete un `<Suspense>` alrededor de `page.tsx`, Next
 * arranca a stremear la respuesta con el 200 ya emitido, y para cuando
 * `page.tsx` llama `notFound()` (flag `tournaments` apagado) el status ya no
 * se puede cambiar. El layout renderiza FUERA de ese boundary: acá el
 * `notFound()` llega a tiempo.
 *
 * Duplica el guard que `page.tsx` (y `nuevo/`, `[id]/`) ya hacen — mismo
 * patrón defense-in-depth que ya usan esas dos rutas ("esconder el ítem del
 * menú no alcanza, alguien puede entrar por URL"). `requireOperatorStaff` NO
 * está `cache()`-wrapped (a diferencia de `extractAuthUser`), así que esto
 * SÍ repite `getStaffTenant`/`getStaffRole` — costo aceptado: es la única
 * forma de mover el chequeo antes del Suspense, y `/torneos` no es un hot
 * path.
 */
export default async function TorneosLayout({ children }: { children: ReactNode }) {
  const auth = await requireOperatorStaff()
  if (!auth.ok) redirect('/login')
  if (!(await isFeatureEnabled(TOURNAMENTS_FLAG, auth.tenant.id))) notFound()
  return children
}
