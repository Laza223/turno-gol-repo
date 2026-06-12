import type { ReactNode } from 'react'
import { requireAdminStaff } from '@/modules/staff/guards'

/**
 * Toda la sección /settings es solo-admin (roles 026): Encargado y Solo
 * lectura rebotan a /dashboard. El PIN sigue protegiendo sub-zonas sensibles
 * (facturación, pin) por encima de este guard.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requireAdminStaff()
  return <>{children}</>
}
