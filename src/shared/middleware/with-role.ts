import type { NextRequest, NextResponse } from 'next/server'
import type { StaffUser } from '@/modules/auth/types'
import type { DbTx } from '@/shared/db/client'
import { forbidden } from '@/shared/api-error'
import { getStaffRole } from '@/modules/staff/staff.service'
import type { StaffRole } from '@/modules/staff/roles'

export type Role = StaffRole

export type RoleInnerHandler = (
  req: NextRequest,
  user: StaffUser,
  tx: DbTx,
) => Promise<NextResponse> | NextResponse

/**
 * Compose AFTER withTenant. Rejects si el rol real (leído de
 * tenant_staff_members) no es el requerido. `user.role` NUNCA sirve para esto:
 * viene hardcodeado a 'admin' para todo el staff (ver StaffUser/extractAuthUser),
 * así que comparar contra ese claim no rechaza a nadie (audit_report.md 3-14).
 */
export function withRole(
  required: Role,
  handler: RoleInnerHandler,
): RoleInnerHandler {
  return async (req, user, tx) => {
    if (!user.tenantId || !user.staffUserId) {
      return forbidden('Falta el contexto de complejo.', { code: 'NO_TENANT_CONTEXT' })
    }
    const role = await getStaffRole(user.tenantId, user.staffUserId)
    if (role !== required) {
      return forbidden('No tenés el rol requerido para esta acción.', {
        code: 'ROLE_REQUIRED',
        details: { required },
      })
    }
    return handler(req, user, tx)
  }
}
