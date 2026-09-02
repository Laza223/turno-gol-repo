// Vive en `@/server` (composition root del runtime web), no en `@/shared`: ver
// el bloque `turnogol/capas-server` de eslint.config.mjs.
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
export function withRole(required: Role, handler: RoleInnerHandler): RoleInnerHandler {
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
    // Sin try/catch acá a propósito: este layer corre DENTRO de la transacción
    // que abre withTenantContext (withRole/withAnyRole siempre se componen
    // adentro de withTenant). Atajar la excepción acá la convierte en un valor
    // resuelto normal para `db.transaction`, que hace COMMIT en vez de
    // ROLLBACK aunque el handler haya fallado a mitad de una escritura
    // multi-paso — el catch+captureException+internal() vive en with-tenant.ts,
    // que envuelve la llamada a withTenantContext DESDE AFUERA de la tx.
    return handler(req, user, tx)
  }
}

/**
 * Como `withRole` pero acepta cualquiera de varios roles. Para endpoints
 * operator-level (admin + manager) — p.ej. las métricas de NEGOCIO del complejo,
 * que el encargado ve igual que grilla/caja/reportes. El rol real se lee de
 * `tenant_staff_members` (nunca del claim del JWT).
 */
export function withAnyRole(allowed: readonly Role[], handler: RoleInnerHandler): RoleInnerHandler {
  return async (req, user, tx) => {
    if (!user.tenantId || !user.staffUserId) {
      return forbidden('Falta el contexto de complejo.', { code: 'NO_TENANT_CONTEXT' })
    }
    const role = await getStaffRole(user.tenantId, user.staffUserId)
    if (role === null || !allowed.includes(role)) {
      return forbidden('No tenés el rol requerido para esta acción.', {
        code: 'ROLE_REQUIRED',
        details: { required: allowed },
      })
    }
    // Ídem withRole: sin try/catch, corre dentro de la tx de withTenantContext.
    return handler(req, user, tx)
  }
}
