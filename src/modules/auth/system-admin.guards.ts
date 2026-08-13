import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { extractRealAuthUser } from '@/modules/auth/auth.middleware'
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

type SystemAdminRow = {
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
export type SystemAdminActionAuth = ({ ok: true } & SystemAdminAuth) | { ok: false; error: string }

function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0)
}

/**
 * Chequeos 2+3 del guard (fila DB activa + allowlist) para un systemAdminId ya
 * conocido, sin volver a resolver la identidad real (security scan F11).
 * La usa la revalidación de la sesión de impersonación en cada lectura, para
 * que revocar un system admin (status inactive o sacarlo de
 * SYSTEM_ADMIN_EMAILS) corte una impersonación en curso de inmediato en vez
 * de esperar hasta 1h a que expire sola la cookie firmada.
 */
export async function isSystemAdminActiveAndAllowlisted(systemAdminId: string): Promise<boolean> {
  const rows = await withSystemAdminContext(systemAdminId, (tx) =>
    tx
      .select({ email: systemAdmins.email, status: systemAdmins.status })
      .from(systemAdmins)
      .where(eq(systemAdmins.id, systemAdminId))
      .limit(1),
  )
  const row = rows[0]
  if (!row || row.status !== 'active') return false
  const allowlist = parseAllowlist(process.env.SYSTEM_ADMIN_EMAILS)
  return allowlist.length > 0 && allowlist.includes(row.email.trim().toLowerCase())
}

/**
 * Núcleo compartido de ambos guards. null = cualquiera de los 3 chequeos
 * falló; los callers NO diferencian el motivo (no filtrar que la ruta existe).
 * Exportado para Route Handlers de /api/admin/* que necesitan el triple
 * chequeo pero no encajan en el patrón redirect (páginas) ni ok/error
 * (Server Actions) de los dos guards de abajo.
 */
export async function resolveSystemAdmin(): Promise<SystemAdminAuth | null> {
  // 1) Claim JWT. Identidad REAL: mientras se impersona, la cookie hace que
  //    extractAuthUser devuelva un staff sintético; el guard de SuperAdmin debe
  //    seguir viendo al system_admin para no auto-bloquearse (poder volver al
  //    panel y cortar la impersonación).
  const user = await extractRealAuthUser()
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
