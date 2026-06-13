import { and, eq } from 'drizzle-orm'
import { getDb } from '@/shared/db/client'
import { tenantStaffMembers } from '@/shared/db/schema'
import type { StaffRole } from './roles'

/**
 * Rol del miembro ACTIVO en un tenant, leído de la DB (no del JWT: el claim
 * `role` queda viejo si un admin cambia el rol después del login). Mismo
 * patrón de acceso que getStaffTenant (getDb directo, sin tenant context).
 */
export async function getStaffRole(
  tenantId: string,
  staffUserId: string,
): Promise<StaffRole | null> {
  const db = getDb()
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
 */
export async function getFirstActiveAdminStaffUserId(
  tenantId: string,
): Promise<string | null> {
  const db = getDb()
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
