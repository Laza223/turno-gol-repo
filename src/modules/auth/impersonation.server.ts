import { cookies } from 'next/headers'
import {
  IMPERSONATION_COOKIE_NAME,
  verifyImpersonationCookie,
  type ImpersonationPayload,
} from '@/shared/security/impersonation-cookie'
import type { AuthUser, StaffUser } from '@/modules/auth/types'
import type { TenantRow } from '@/modules/tenants/tenant.types'
import { getTenantById } from '@/modules/tenants/tenant.service'
import { getFirstActiveAdminStaffUserId } from '@/modules/staff/staff.service'

/**
 * Piezas de impersonación que dependen del request (next/headers + DB).
 * Separadas del módulo crypto puro (`@/shared/security/impersonation-cookie`)
 * para que workers, audit
 * y tests importen la firma/verificación sin arrastrar next/headers.
 *
 * IMPORTANTE — sin ciclo: este módulo NO importa estáticamente auth.middleware
 * (que sí importa de acá `resolveImpersonatedStaffContextFor`). Las funciones
 * "no-arg" que necesitan la identidad real hacen un import dinámico de
 * extractRealAuthUser; el grafo estático queda en una sola dirección.
 */

export type ImpersonationSession = {
  systemAdminId: string
  tenantId: string
}

/**
 * Contexto staff sintético de una sesión impersonada. `user` es lo que ven los
 * guards del admin (rol efectivo 'admin'); `proxyStaffUserId` es el admin real
 * del tenant cuyo id se inyecta en los FKs a staff_users.id.
 */
export type ImpersonatedStaffContext = {
  systemAdminId: string
  tenant: TenantRow
  proxyStaffUserId: string
  user: StaffUser & { staffUserId: string }
}

/** El tenant impersonado no tiene admin activo para delegar los FKs (spec §6). */
export class NoActiveAdminToProxyError extends Error {
  constructor(public readonly tenantId: string) {
    super('Tenant has no active admins to proxy')
    this.name = 'NoActiveAdminToProxyError'
  }
}

/**
 * Lee y verifica la cookie de impersonación del request. Solo integridad +
 * expiración; no chequea la sesión auth. null si no hay o es inválida.
 */
export async function readImpersonationCookie(): Promise<ImpersonationPayload | null> {
  const raw = (await cookies()).get(IMPERSONATION_COOKIE_NAME)?.value
  if (!raw) return null
  return verifyImpersonationCookie(raw)
}

/**
 * Sesión de impersonación dada la identidad REAL: requiere cookie válida y que
 * el usuario sea el mismo system_admin que la emitió. No toca la DB.
 */
export async function getImpersonationSessionFor(
  realUser: AuthUser | null,
): Promise<ImpersonationSession | null> {
  if (!realUser || realUser.type !== 'system_admin') return null
  const payload = await readImpersonationCookie()
  if (!payload) return null
  if (payload.systemAdminId !== realUser.systemAdminId) return null

  // F11: re-verify the DB row + allowlist on every read, not only the
  // signed cookie's integrity/expiry and the JWT claim — otherwise revoking
  // a system admin (status inactive, or dropped from SYSTEM_ADMIN_EMAILS)
  // leaves an already-issued impersonation session live for up to the
  // remaining cookie TTL (up to 1h), contradicting "the DB revokes
  // immediately". Dynamic import: same reason extractRealAuthUser() below
  // is dynamic — avoids a static cycle with auth.middleware.ts, which
  // imports this module.
  const { isSystemAdminActiveAndAllowlisted } = await import('@/modules/auth/system-admin.guards')
  if (!(await isSystemAdminActiveAndAllowlisted(payload.systemAdminId))) return null

  return { systemAdminId: payload.systemAdminId, tenantId: payload.tenantId }
}

/**
 * Resolución completa del contexto staff impersonado dada la identidad REAL.
 * Devuelve null si no hay impersonación válida (no system_admin / sin cookie /
 * cookie de otro admin / tenant inexistente → cae al flujo normal). Lanza
 * NoActiveAdminToProxyError si impersona un tenant sin admin activo.
 */
export async function resolveImpersonatedStaffContextFor(
  realUser: AuthUser | null,
): Promise<ImpersonatedStaffContext | null> {
  const session = await getImpersonationSessionFor(realUser)
  if (!session || !realUser || realUser.type !== 'system_admin') return null

  const tenant = await getTenantById(session.tenantId)
  if (!tenant) return null // tenant borrado: que el flujo normal lo rechace

  const proxyStaffUserId = await getFirstActiveAdminStaffUserId(tenant.id)
  if (!proxyStaffUserId) throw new NoActiveAdminToProxyError(tenant.id)

  const user: StaffUser & { staffUserId: string } = {
    type: 'staff',
    // id/email reales del system admin: la verdad de quién actúa. El header del
    // admin muestra este email → recordatorio extra de que estás impersonando.
    id: realUser.id,
    email: realUser.email,
    staffUserId: proxyStaffUserId,
    tenantId: tenant.id,
    role: 'admin',
  }

  return { systemAdminId: session.systemAdminId, tenant, proxyStaffUserId, user }
}

// ─── Variantes "no-arg" (resuelven la identidad real por su cuenta) ──────────

async function extractRealAuthUser(): Promise<AuthUser | null> {
  // Import dinámico para no crear un ciclo estático con auth.middleware.
  const mod = await import('@/modules/auth/auth.middleware')
  return mod.extractRealAuthUser()
}

/** Sesión de impersonación de la request actual (resuelve la identidad real). */
export async function getImpersonationSession(): Promise<ImpersonationSession | null> {
  return getImpersonationSessionFor(await extractRealAuthUser())
}

/**
 * Contexto staff impersonado de la request actual. Lo usa el layout del admin.
 * (No se cachea con React.cache acá: extractAuthUser ya está cacheado por
 * request y es el camino caliente; este no-arg lo llama solo el layout.)
 */
export async function resolveImpersonatedStaffContext(): Promise<ImpersonatedStaffContext | null> {
  return resolveImpersonatedStaffContextFor(await extractRealAuthUser())
}
