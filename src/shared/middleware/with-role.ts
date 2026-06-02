import type { NextRequest, NextResponse } from 'next/server'
import type { StaffUser } from '@/modules/auth/types'
import type { DbTx } from '@/shared/db/client'
import { forbidden } from '@/shared/api-error'

// v1: el único rol staff es 'admin'. Zonas sensibles se protegen con PIN, no con rol.
export type Role = 'admin'

export type RoleInnerHandler = (
  req: NextRequest,
  user: StaffUser,
  tx: DbTx,
) => Promise<NextResponse> | NextResponse

/**
 * Compose AFTER withTenant. Rejects if user.role !== required.
 * Signature mirrors what withTenant passes through.
 */
export function withRole(
  required: Role,
  handler: RoleInnerHandler,
): RoleInnerHandler {
  return async (req, user, tx) => {
    if (user.role !== required) {
      return forbidden('No tenés el rol requerido para esta acción.', {
        code: 'ROLE_REQUIRED',
        details: { required },
      })
    }
    return handler(req, user, tx)
  }
}
