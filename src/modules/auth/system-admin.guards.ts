import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import type { SystemAdminUser } from '@/modules/auth/types'
import { withSystemAdminContext } from '@/shared/db/client'
import { systemAdmins } from '@/shared/db/schema'
import { enforce } from '@/shared/rate-limit/apply'

/**
 * Guards del panel SuperAdmin (spec: docs/superpowers/specs/2026-06-12-super-admin-design.md §3).
 *
 * Triple chequeo, en orden:
 *   1. Claim JWT: extractAuthUser() retorna type 'system_admin'
 *      (app_metadata.is_system_admin seteado SOLO por scripts/seed-system-admin.ts).
 *   2. Fila en system_admins con status 'active', leída vía withSystemAdminContext
 *      (policy RLS self-only). La DB manda: desactivar la fila revoca el acceso de
 *      inmediato, sin esperar a que el JWT se refresque — misma lección que los
 *      roles de staff (nunca confiar solo en el JWT).
 *   3. Email de la FILA DB (no del JWT) presente en SYSTEM_ADMIN_EMAILS (env,
 *      lista separada por comas, case-insensitive). Allowlist vacía o env ausente
 *      = nadie pasa (fail-closed).
 */

export type SystemAdminRow = {
  id: string
  email: string
  firstName: string
  lastName: string
}

export type SystemAdminAuth = {
  user: SystemAdminUser
  admin: SystemAdminRow
}

/**
 * Resultado del guard para Server Actions: sin redirect — la action devuelve
 * el error genérico y la UI lo muestra (mismo patrón que StaffActionAuth).
 */
export type SystemAdminActionAuth =
  | ({ ok: true } & SystemAdminAuth)
  | { ok: false; error: string }

function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0)
}

/**
 * Núcleo compartido de ambos guards. null = cualquiera de los 3 chequeos
 * falló; los callers NO diferencian el motivo (no filtrar que la ruta existe).
 */
async function resolveSystemAdmin(): Promise<SystemAdminAuth | null> {
  // 1) Claim JWT.
  const user = await extractAuthUser()
  if (!user || user.type !== 'system_admin') return null

  // 2) Fila DB activa (policy self-only via app.current_system_admin_id).
  //    El status se chequea en código (no en el WHERE) para que una fila
  //    'inactive' sea indistinguible de una inexistente para el caller.
  const rows = await withSystemAdminContext(user.systemAdminId, (tx) =>
    tx
      .select({
        id: systemAdmins.id,
        email: systemAdmins.email,
        firstName: systemAdmins.firstName,
        lastName: systemAdmins.lastName,
        status: systemAdmins.status,
      })
      .from(systemAdmins)
      .where(eq(systemAdmins.id, user.systemAdminId))
      .limit(1),
  )
  const row = rows[0]
  if (!row || row.status !== 'active') return null

  // 3) Allowlist por env. Se compara el email de la FILA (fuente de verdad),
  //    no el del JWT. Sin env o lista vacía: fail-closed, nadie pasa.
  const allowlist = parseAllowlist(process.env.SYSTEM_ADMIN_EMAILS)
  if (allowlist.length === 0 || !allowlist.includes(row.email.trim().toLowerCase())) {
    return null
  }

  return {
    user,
    admin: {
      id: row.id,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
    },
  }
}

/**
 * Guard para páginas/layouts de /super-admin/*. Cualquier fallo redirige a
 * /login SIN diferenciar motivo; nunca retorna null.
 */
export async function requireSystemAdmin(): Promise<SystemAdminAuth> {
  const auth = await resolveSystemAdmin()
  if (!auth) redirect('/login')
  return auth
}

/**
 * Guard para Server Actions del panel SuperAdmin. Sin redirect: devuelve
 * { ok: false } con error genérico. Incluye rate limit interno
 * (enforce('superAdminAction', email)) — las actions NO necesitan llamar
 * enforce aparte.
 */
export async function requireSystemAdminAction(): Promise<SystemAdminActionAuth> {
  const auth = await resolveSystemAdmin()
  if (!auth) return { ok: false, error: 'No autorizado.' }

  const outcome = await enforce('superAdminAction', auth.admin.email.trim().toLowerCase())
  if (!outcome.ok) {
    return { ok: false, error: 'Demasiadas operaciones, esperá un momento.' }
  }

  return { ok: true, ...auth }
}
