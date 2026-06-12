import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import type { StaffUser } from '@/modules/auth/types'
import type { TenantRow } from '@/modules/tenants/tenant.types'
import { getStaffRole } from './staff.service'

type AdminStaff = {
  user: StaffUser & { staffUserId: string }
  tenant: TenantRow
}

/**
 * Guard server-side para zonas solo-admin (Configuración, Vista Equipo).
 * Encargado y Solo lectura rebotan a /dashboard. El rol se lee de la DB en
 * cada request — un cambio de rol aplica de inmediato, sin esperar a que el
 * JWT se refresque.
 */
export async function requireAdminStaff(): Promise<AdminStaff> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const role = await getStaffRole(tenant.id, user.staffUserId)
  if (role !== 'admin') redirect('/dashboard')

  return { user: { ...user, staffUserId: user.staffUserId }, tenant }
}
