import type { Metadata } from 'next'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { resolveStaffTenants } from '@/modules/auth/auth.service'
import { SuspendedView } from './SuspendedView'

// Resolver la sesión para decidir si ofrecer el cambio de complejo saca a esta
// página del prerender. Explícito para que no dependa de la inferencia.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  // Sin el sufijo "— TurnoGol": el layout raíz aplica el template `%s · TurnoGol`,
  // así que el título terminaba duplicado ("Cuenta suspendida — TurnoGol · TurnoGol")
  // en la pestaña y en og:title (🟡 QA 2026-08-14).
  title: 'Cuenta suspendida',
  robots: { index: false, follow: false },
}

export default async function SuspendedPage() {
  // Con un solo complejo el link sobra: /select-tenant sería una lista de un
  // elemento. Sin sesión de staff tampoco corresponde.
  const user = await extractAuthUser()
  const variosComplejos =
    user?.type === 'staff' && user.staffUserId
      ? (await resolveStaffTenants(user.staffUserId)).length > 1
      : false

  return <SuspendedView mostrarCambioDeComplejo={variosComplejos} />
}
