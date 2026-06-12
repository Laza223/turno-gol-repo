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
