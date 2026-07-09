import { and, eq } from 'drizzle-orm'
import { getWorkerDb } from '@/shared/db/client'
import { staffUsers, tenantStaffMembers } from '@/shared/db/schema'
import type { StaffRole } from './roles'

export interface StaffRosterMember {
  memberId: string
  staffUserId: string
  firstName: string
  lastName: string
  email: string
  role: StaffRole
  isActive: boolean
  createdAt: Date
  lastLoginAt: Date | null
}

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

/**
 * Roster COMPLETO (activos e inactivos) de un tenant, para la vista Equipo
 * (`(admin)/staff/page.tsx`) y el detalle de tenant del panel SuperAdmin
 * (`tenants.service.ts`). `staff_see_same_tenant_staff`
 * (006_rls_policies.sql) solo expone en `staff_users` las filas con una
 * `tenant_staff_members` ACTIVA para el tenant en curso — bajo el pool de
 * tenant (`turnogol_app`, RLS aplica) un INNER JOIN pierde por completo a
 * los miembros desactivados en vez de mostrarlos con badge "Inactivo" (el
 * admin ve a la persona esfumarse del listado). Mismo patrón que
 * getStaffRole: pool bypass-capable (`getWorkerDb`), filtrado explícito por
 * tenantId ya autenticado/validado (nunca de input del cliente) — el
 * caller es responsable de correr su guard de autorización ANTES de llamar
 * a esto.
 */
export async function listStaffRoster(tenantId: string): Promise<StaffRosterMember[]> {
  const db = getWorkerDb()
  return db
    .select({
      memberId: tenantStaffMembers.id,
      staffUserId: staffUsers.id,
      firstName: staffUsers.firstName,
      lastName: staffUsers.lastName,
      email: staffUsers.email,
      role: tenantStaffMembers.role,
      isActive: tenantStaffMembers.isActive,
      createdAt: tenantStaffMembers.createdAt,
      lastLoginAt: staffUsers.lastLoginAt,
    })
    .from(tenantStaffMembers)
    .innerJoin(staffUsers, eq(tenantStaffMembers.staffUserId, staffUsers.id))
    .where(eq(tenantStaffMembers.tenantId, tenantId))
    .orderBy(tenantStaffMembers.createdAt)
}

/**
 * ¿El email pertenece a algún miembro (activo O inactivo) de este tenant?
 * La usa `resendInviteAction`: el único punto de entrada de esa acción en la
 * UI (`StaffActions.tsx`) es justamente el miembro YA desactivado (el ítem
 * "Reenviar invitación" solo se renderiza cuando `!member.isActive`), así
 * que acotar la búsqueda a `is_active = true` la dejaba siempre en 0 filas.
 * Además, igual que en `listStaffRoster`, la RLS de `staff_users` esconde
 * las filas inactivas bajo el pool de tenant — mismo bypass (`getWorkerDb`),
 * filtrado explícito por tenantId ya autenticado.
 */
export async function isStaffMemberOfTenant(tenantId: string, email: string): Promise<boolean> {
  const db = getWorkerDb()
  const rows = await db
    .select({ id: tenantStaffMembers.id })
    .from(tenantStaffMembers)
    .innerJoin(staffUsers, eq(tenantStaffMembers.staffUserId, staffUsers.id))
    .where(and(eq(tenantStaffMembers.tenantId, tenantId), eq(staffUsers.email, email)))
    .limit(1)
  return rows.length > 0
}
