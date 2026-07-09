import { and, eq } from 'drizzle-orm'
import { getWorkerDb } from '@/shared/db/client'
import { staffUsers, tenantStaffMembers } from '@/shared/db/schema'
import type { StaffRole } from './roles'

/**
 * Rol del miembro ACTIVO en un tenant, leído de la DB (no del JWT: el claim
 * `role` queda viejo si un admin cambia el rol después del login). Se llama
 * SIEMPRE antes de `withTenantContext` (guards.ts, with-tenant.ts,
 * with-role.ts, callbacks de MP) — es lo que decide si corresponde entrar
 * a ese contexto — así que no hay `app.current_tenant_id` seteado todavía y
 * RLS sobre `tenant_staff_members` bajo el pool restringido (`turnogol_app`,
 * PR #30) devolvería 0 filas. Mismo patrón de acceso que getStaffTenant en
 * tenant.service.ts: pool bypass-capable (`getWorkerDb`), filtrado explícito
 * por tenantId + staffUserId ya autenticados (no user-controlled).
 */
export async function getStaffRole(
  tenantId: string,
  staffUserId: string,
): Promise<StaffRole | null> {
  const db = getWorkerDb()
  const rows = await db
    .select({ role: tenantStaffMembers.role })
    .from(tenantStaffMembers)
    .where(
      and(
        eq(tenantStaffMembers.tenantId, tenantId),
        eq(tenantStaffMembers.staffUserId, staffUserId),
        eq(tenantStaffMembers.isActive, true),
      ),
    )
    .limit(1)
  return rows[0]?.role ?? null
}

/**
 * staff_user_id del primer admin ACTIVO del tenant (orden por antigüedad). Lo usa
 * la impersonación del SuperAdmin como "proxy" para los FKs a staff_users.id
 * (cash_flows.registered_by, bookings.created_by_staff, daily_cash_closes.closed_by,
 * etc.): la identidad real queda en el audit log, pero las filas necesitan un
 * staff_user_id que exista en ese tenant. null si el tenant no tiene admin activo.
 *
 * Llamada SIEMPRE antes de que exista tenant context de staff: desde
 * `resolveImpersonatedStaffContextFor` (dentro de `extractAuthUser`, previo a
 * cualquier `withTenantContext`) y desde el pre-check de la acción de
 * impersonación del super admin (sesión system_admin, sin tenant context de
 * staff). Sin `app.current_tenant_id` seteado, RLS sobre `tenant_staff_members`
 * bajo el pool restringido (`turnogol_app`, PR #30) devolvería 0 filas — mismo
 * patrón de acceso que getStaffTenant/getStaffRole: pool bypass-capable
 * (`getWorkerDb`), filtrado explícito por tenantId ya resuelto (no user-controlled).
 */
export async function getFirstActiveAdminStaffUserId(
  tenantId: string,
): Promise<string | null> {
  const db = getWorkerDb()
  const rows = await db
    .select({ staffUserId: tenantStaffMembers.staffUserId })
    .from(tenantStaffMembers)
    .where(
      and(
        eq(tenantStaffMembers.tenantId, tenantId),
        eq(tenantStaffMembers.role, 'admin'),
        eq(tenantStaffMembers.isActive, true),
      ),
    )
    .orderBy(tenantStaffMembers.createdAt)
    .limit(1)
  return rows[0]?.staffUserId ?? null
}

/**
 * Upsert (por email) del registro `staff_users` global. `006_rls_policies.sql`
 * deliberadamente no da a `staff_users` policies de INSERT/UPDATE ("gestión
 * vía service role"), y `036_force_rls_remaining_tables.sql` le agregó FORCE
 * ROW LEVEL SECURITY — así que un write vía el pool de tenant (`turnogol_app`,
 * PR #30) viola RLS incluso dentro de una transacción con
 * `app.current_tenant_id` seteado, porque no hay policy que lo autorice.
 * Mismo patrón que `getOrCreateStaffUser` en auth.service.ts: pool
 * bypass-capable (`getWorkerDb`), sin filtro por tenant porque la tabla es
 * global. El caller (`inviteStaffAction`) ya validó rol admin + duplicado
 * antes de llamar a esto.
 */
export async function upsertStaffUser(
  email: string,
  firstName: string,
  lastName: string,
): Promise<{ id: string }> {
  const db = getWorkerDb()
  const lower = email.toLowerCase()
  const [row] = await db
    .insert(staffUsers)
    .values({ email: lower, firstName, lastName })
    .onConflictDoUpdate({
      target: staffUsers.email,
      set: { firstName, lastName },
    })
    .returning({ id: staffUsers.id })

  if (!row) throw new Error('upsertStaffUser: insert/update returned no row')
  return row
}
