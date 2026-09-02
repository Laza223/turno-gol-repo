// Vive en `@/server` (composition root del runtime web) y no en `@/shared`:
// importa dominio a propósito — orquestar auth + rol + lifecycle de tenant ES su
// función, igual que `@/shared/jobs` lo hace para el runtime de background. Ver
// el bloque `turnogol/capas-server` de eslint.config.mjs.
import type { NextRequest, NextResponse } from 'next/server'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import type { StaffUser } from '@/modules/auth/types'
import { getSql, withTenantContext, type DbTx } from '@/shared/db/client'
import { captureException } from '@/lib/sentry'
import { forbidden, internal, unauthorized } from '@/shared/api-error'
import { guard } from '@/shared/rate-limit/route-guard'
import type { PolicyName } from '@/shared/rate-limit/policies'
import { getStaffRole } from '@/modules/staff/staff.service'
import type { StaffRole } from '@/modules/staff/roles'
import {
  BLOCKED_TENANT_STATUSES,
  READ_ONLY_TENANT_STATUSES,
} from '@/modules/tenants/tenant.lifecycle'
import { runRequestObservability } from '@/shared/middleware/observability'

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const BILLING_REACTIVATE_ALLOWED = new Set(['canceled', 'churned', 'blocked'])

// Default: cualquier miembro de staff activo (admin o manager). Pasar
// `{ roles: ['admin'] }` en rutas de configuración/facturación restringe a admin.
const ALL_STAFF_ROLES: readonly StaffRole[] = ['admin', 'manager']

export type TenantHandler = (
  req: NextRequest,
  user: StaffUser,
  tx: DbTx,
) => Promise<NextResponse> | NextResponse

export type WithTenantOptions = {
  roles?: readonly StaffRole[]
  /**
   * Política de rate-limit a aplicar, con el tenant como clave.
   *
   * Existe para que el chequeo corra ANTES de `withTenantContext` y no adentro
   * del handler, que es donde lo llamaba cada route handler a mano. `enforce()`
   * habla con Upstash por HTTP: hacerlo con la transacción ya abierta retiene
   * una de las 3 conexiones del pool (`DEFAULT_POOL_MAX`) durante un viaje a
   * internet, y encima para decidir algo que muchas veces termina en 429 —
   * es decir, sin llegar a usar esa conexión para nada.
   */
  rateLimit?: PolicyName
}

/**
 * Revalida el rol real contra `tenant_staff_members` (nunca el JWT: el claim
 * `role` viene hardcodeado a 'admin' para todo el staff). `null` cubre tanto
 * "rol equivocado" como "membresía desactivada" — un staff dado de baja
 * (`is_active=false`) queda bloqueado acá igual que ya bloquean
 * requireOperatorStaff/requireAdminStaff en los Server Actions.
 */
async function checkStaffRole(
  user: StaffUser,
  roles: readonly StaffRole[],
): Promise<NextResponse | null> {
  if (!user.staffUserId || !user.tenantId) {
    return forbidden('Falta el contexto de complejo.', { code: 'NO_TENANT_CONTEXT' })
  }
  const role = await getStaffRole(user.tenantId, user.staffUserId)
  if (!role || !roles.includes(role)) {
    return forbidden('Tu rol no permite realizar esta acción.', { code: 'ROLE_NOT_ALLOWED' })
  }
  return null
}

export function withTenant(
  handler: TenantHandler,
  options?: WithTenantOptions,
): (req: NextRequest) => Promise<NextResponse> {
  const roles = options?.roles ?? ALL_STAFF_ROLES
  const run = async (req: NextRequest): Promise<NextResponse> => {
    const user = await extractAuthUser()
    if (!user) {
      return unauthorized('Autenticación requerida.', { code: 'AUTH_REQUIRED' })
    }
    if (user.type !== 'staff') {
      return forbidden('Se requiere una cuenta de staff.', { code: 'STAFF_REQUIRED' })
    }
    if (!user.tenantId) {
      return forbidden('Falta el contexto de complejo.', { code: 'NO_TENANT_CONTEXT' })
    }
    const roleRejection = await checkStaffRole(user, roles)
    if (roleRejection) return roleRejection
    const sql = getSql()
    const rows = await sql<{ status: string }[]>`
      SELECT status FROM tenants WHERE id = ${user.tenantId} LIMIT 1
    `
    if (rows.length === 0) {
      return forbidden('El complejo no existe.', { code: 'TENANT_NOT_FOUND' })
    }
    const status = rows[0].status
    if (BLOCKED_TENANT_STATUSES.has(status)) {
      return forbidden('El complejo está bloqueado.', {
        code: 'TENANT_BLOCKED',
        details: { status },
      })
    }
    if (READ_ONLY_TENANT_STATUSES.has(status) && !READ_METHODS.has(req.method)) {
      return forbidden('El complejo está suspendido (solo lectura).', {
        code: 'TENANT_SUSPENDED_READ_ONLY',
        details: { status },
      })
    }
    if (options?.rateLimit) {
      const throttled = await guard(options.rateLimit, user.tenantId)
      if (throttled) return throttled
    }
    try {
      return await withTenantContext(user.tenantId, async (tx) => handler(req, user, tx))
    } catch (err) {
      captureException(err)
      return internal('Ocurrió un error inesperado. Probá de nuevo en unos segundos.')
    }
  }
  return (req) => runRequestObservability(req, () => run(req))
}

/**
 * Variant for `/api/billing/reactivate` that bypasses BLOCKED gating for
 * `canceled`, `churned` and `blocked` tenants (where the user must still be
 * able to pay to bring the tenant back — ENS-20 widened `blocked` in from the
 * old canceled/churned-only carve-out, matching billing.service.reactivate()'s
 * own allowed-states list). Only `deleted` (data already wiped) stays locked out.
 */
export function withBillingTenant(
  handler: TenantHandler,
  options?: WithTenantOptions,
): (req: NextRequest) => Promise<NextResponse> {
  const roles = options?.roles ?? ALL_STAFF_ROLES
  const run = async (req: NextRequest): Promise<NextResponse> => {
    const user = await extractAuthUser()
    if (!user) {
      return unauthorized('Autenticación requerida.', { code: 'AUTH_REQUIRED' })
    }
    if (user.type !== 'staff') {
      return forbidden('Se requiere una cuenta de staff.', { code: 'STAFF_REQUIRED' })
    }
    if (!user.tenantId) {
      return forbidden('Falta el contexto de complejo.', { code: 'NO_TENANT_CONTEXT' })
    }
    const roleRejection = await checkStaffRole(user, roles)
    if (roleRejection) return roleRejection
    const sql = getSql()
    const rows = await sql<{ status: string }[]>`
      SELECT status FROM tenants WHERE id = ${user.tenantId} LIMIT 1
    `
    if (rows.length === 0) {
      return forbidden('El complejo no existe.', { code: 'TENANT_NOT_FOUND' })
    }
    const status = rows[0].status
    if (status === 'deleted') {
      return forbidden('El complejo fue eliminado.', { code: 'TENANT_DELETED' })
    }
    // Allow canceled, churned, blocked, suspended, past_due, active, trialing.
    if (
      !BILLING_REACTIVATE_ALLOWED.has(status) &&
      !['active', 'trialing', 'past_due', 'suspended'].includes(status)
    ) {
      return forbidden('El complejo está en un estado que no permite esta acción.', {
        code: 'TENANT_INVALID_STATE',
        details: { status },
      })
    }
    try {
      return await withTenantContext(user.tenantId, async (tx) => handler(req, user, tx))
    } catch (err) {
      captureException(err)
      return internal('Ocurrió un error inesperado. Probá de nuevo en unos segundos.')
    }
  }
  return (req) => runRequestObservability(req, () => run(req))
}
