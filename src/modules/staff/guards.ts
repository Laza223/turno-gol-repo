import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import type { StaffUser } from '@/modules/auth/types'
import type { TenantRow } from '@/modules/tenants/tenant.types'
import { getStaffRole } from './staff.service'
import type { StaffRole } from './roles'

type AdminStaff = {
  user: StaffUser & { staffUserId: string }
  tenant: TenantRow
}

/**
 * Resultado de los guards para Server Actions: el rechazo por rol NO
 * redirige — la action devuelve `{ success: false, error }` y la UI muestra
 * el mensaje. Solo la falta de sesión staff redirige a /login.
 */
export type StaffActionAuth =
  | {
      ok: true
      user: StaffUser & { staffUserId: string }
      tenant: TenantRow
      role: StaffRole
    }
  | { ok: false; error: string }

async function requireStaffWithRole(
  allowed: readonly StaffRole[],
  error: string,
): Promise<StaffActionAuth> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return { ok: false, error: 'Tenant no encontrado' }

  // Rol SIEMPRE leído de la DB: extractAuthUser hardcodea role 'admin' en el
  // JWT, así que user.role nunca es protección (mismo criterio que
  // requireAdminStaff). null = membresía inactiva o inexistente.
  const role = await getStaffRole(tenant.id, user.staffUserId)
  if (!role || !allowed.includes(role)) return { ok: false, error }

  return { ok: true, user: { ...user, staffUserId: user.staffUserId }, tenant, role }
}

/**
 * Guard para Server Actions operativas (reservas, caja): admin y manager
 * (Encargado) pasan. Rebota con error si no hay membresía activa.
 */
export async function requireOperatorStaff(): Promise<StaffActionAuth> {
  return requireStaffWithRole(
    ['admin', 'manager'],
    'Tu rol no permite realizar esta acción.',
  )
}

/**
 * Guard para Server Actions de configuración (p. ej. productos de cantina):
 * solo admin. A diferencia de requireAdminStaff, no redirige al rechazar.
 */
export async function requireAdminStaffAction(): Promise<StaffActionAuth> {
  return requireStaffWithRole(
    ['admin'],
    'Solo el administrador puede modificar la configuración.',
  )
}

/**
 * Guard server-side para zonas solo-admin (Configuración, Vista Equipo).
 * El Encargado (manager) rebota a /dashboard. El rol se lee de la DB en
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
