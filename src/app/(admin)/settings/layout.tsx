import type { ReactNode } from 'react'
import { requireAdminStaff } from '@/modules/staff/guards'
import { SETTINGS_ADMIN_ONLY_NOTICE } from '@/modules/staff/roles'

/**
 * Toda la sección /settings es solo-admin (roles 029, modelo de 2 roles),
 * las 6 pestañas por igual (H161 plegó Avisos dentro de Perfil, eran 7) —
 * incluida Canchas, que adentro usa requireOperatorStaff() pero nunca llega a
 * correr: este guard corta antes de que la page se renderice. Sin PIN — el
 * sistema de PIN se eliminó del producto en esa misma migración;
 * requireAdminStaff() es el único gate.
 *
 * H163: manager rebota directo a /grilla con `?notice=` (antes: a /dashboard
 * en silencio, que a su vez lo mandaba a /grilla sin avisar nada — parecía
 * un bug). grilla/page.tsx traduce el código a un toast.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requireAdminStaff({ onRoleRejected: `/grilla?notice=${SETTINGS_ADMIN_ONLY_NOTICE}` })
  return <>{children}</>
}
