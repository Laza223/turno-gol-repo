import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getImpersonationSession } from '@/modules/auth/impersonation.server'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import {
  BLOCKED_TENANT_STATUSES,
  READ_ONLY_TENANT_STATUSES,
} from '@/modules/tenants/tenant.lifecycle'
import type { StaffUser } from '@/modules/auth/types'
import type { TenantRow } from '@/modules/tenants/tenant.types'
import { getStaffRole } from './staff.service'
import type { StaffRole } from './roles'

type AdminStaff = {
  user: StaffUser & { staffUserId: string }
  tenant: TenantRow
}

/**
 * Estados de tenant que bloquean el panel admin: unión de BLOCKED_TENANT_STATUSES
 * (blocked/churned/deleted) + READ_ONLY_TENANT_STATUSES (suspended) de
 * tenant.lifecycle.ts, la misma fuente que usa `withTenant` para los route
 * handlers — mismo conjunto que el hard-lock de
 * (admin)/layout.tsx (ENS-20/ENS-26). Ahí `suspended` es solo-lectura para GET;
 * acá todo lo que pasa por este guard es una mutación (Server Action) o una
 * page/action de configuración, así que se trata como bloqueo total.
 *
 * Hallazgo R2 (ensayo general): los Server Actions no pasan por
 * (admin)/layout.tsx, así que su hard-lock nunca corría para ellos — un tenant
 * `blocked` por falta de pago podía seguir creando reservas o moviendo caja
 * invocando la action por POST directo. Este check es el único punto por el
 * que pasan requireOperatorStaff / requireAdminStaffAction / requireAdminStaff.
 */
const BLOCKED_STAFF_TENANT_STATUSES: ReadonlySet<string> = new Set([
  ...BLOCKED_TENANT_STATUSES,
  ...READ_ONLY_TENANT_STATUSES,
])

/**
 * true si el tenant está en un estado bloqueante Y la sesión NO es una
 * impersonación de SuperAdmin. La impersonación bypassea el lock a propósito
 * ((admin)/layout.tsx:17-20, spec §6): necesita poder entrar a un tenant
 * bloqueado para dar soporte (revisar/corregir datos antes de que el dueño
 * reactive el pago).
 */
async function isBlockedForStaff(tenant: TenantRow): Promise<boolean> {
  if (!BLOCKED_STAFF_TENANT_STATUSES.has(tenant.status)) return false
  const impersonating = await getImpersonationSession()
  return impersonating === null
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

  if (await isBlockedForStaff(tenant)) {
    return { ok: false, error: 'El complejo está bloqueado por falta de pago.' }
  }

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

  // Mismo bloqueo de tenant lifecycle que requireStaffWithRole (hallazgo R2):
  // requireAdminStaff también se usa como guard de Server Actions fuera de
  // (admin)/* (p. ej. finishOnboardingAction en src/app/onboarding/actions.ts),
  // rutas que no pasan por el hard-lock de (admin)/layout.tsx. Mismo destino
  // que el layout: /suspended.
  if (await isBlockedForStaff(tenant)) redirect('/suspended')

  return { user: { ...user, staffUserId: user.staffUserId }, tenant }
}
