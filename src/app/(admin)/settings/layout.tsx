import type { ReactNode } from 'react'
import { requireAdminStaff } from '@/modules/staff/guards'

/**
 * Toda la sección /settings es solo-admin (roles 029, modelo de 2 roles):
 * manager rebota a /dashboard. Sin PIN — el sistema de PIN se eliminó del
 * producto en esa misma migración; requireAdminStaff() es el único gate.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requireAdminStaff()
  return <>{children}</>
}
