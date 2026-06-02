import type { NextRequest, NextResponse } from 'next/server'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import type { StaffUser } from '@/modules/auth/types'
import { getSql, withTenantContext, type DbTx } from '@/shared/db/client'
import { forbidden, notFound, unauthorized } from '@/shared/api-error'

/**
 * Tenant lifecycle gating per doc4 §2 (P18).
 *
 * - BLOCKED      → 403 always (no admin or player access).
 * - READ_ONLY    → 403 on non-GET/HEAD; admin keeps read access. Players still
 *                  see their bookings.
 * - canceled     → full admin access until current_period_end (sweep flips to
 *                  blocked at that point).
 * - active/trialing/past_due → full access.
 */
const BLOCKED_TENANT_STATUSES = new Set(['blocked', 'churned', 'deleted'])
const READ_ONLY_TENANT_STATUSES = new Set(['suspended'])

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const BILLING_REACTIVATE_ALLOWED = new Set(['canceled', 'churned'])

export type TenantHandler = (
  req: NextRequest,
  user: StaffUser,
  tx: DbTx,
) => Promise<NextResponse> | NextResponse

export function withTenant(handler: TenantHandler): (req: NextRequest) => Promise<NextResponse> {
  return async (req) => {
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
    return withTenantContext(user.tenantId, async (tx) => handler(req, user, tx))
  }
}

/**
 * Variant for `/api/billing/reactivate` that bypasses BLOCKED gating for
 * `canceled` and `churned` tenants (where the user must still be able to
 * pay to bring the tenant back). All other terminal states (`blocked`,
 * `deleted`) remain locked out.
 */
export function withBillingTenant(
  handler: TenantHandler,
): (req: NextRequest) => Promise<NextResponse> {
  return async (req) => {
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
    if (status === 'blocked') {
      return forbidden('El complejo está bloqueado.', { code: 'TENANT_BLOCKED' })
    }
    // Allow canceled, churned, suspended, past_due, active, trialing.
    if (
      !BILLING_REACTIVATE_ALLOWED.has(status) &&
      !['active', 'trialing', 'past_due', 'suspended'].includes(status)
    ) {
      return forbidden('El complejo está en un estado que no permite esta acción.', {
        code: 'TENANT_INVALID_STATE',
        details: { status },
      })
    }
    return withTenantContext(user.tenantId, async (tx) => handler(req, user, tx))
  }
}

// ─── Public-by-slug variant (no auth) ───────────────────────────────
// Used by /api/public/complex/[slug] and similar.

export type PublicTenantHandler = (
  req: NextRequest,
  tenantId: string,
  tx: DbTx,
) => Promise<NextResponse> | NextResponse

export type RouteContext<P> = { params: P }

export function withPublicTenant(
  handler: PublicTenantHandler,
): (req: NextRequest, ctx: RouteContext<{ slug: string }>) => Promise<NextResponse> {
  return async (req, ctx) => {
    const slug = ctx.params.slug
    if (!slug) {
      return notFound('El complejo no existe.')
    }
    const sql = getSql()
    const rows = await sql<{ id: string; status: string }[]>`
      SELECT id, status FROM tenants WHERE slug = ${slug} LIMIT 1
    `
    if (rows.length === 0) {
      return notFound('El complejo no existe.')
    }
    const { id: tenantId, status } = rows[0]
    if (BLOCKED_TENANT_STATUSES.has(status)) {
      return notFound('El complejo no existe.')
    }
    if (READ_ONLY_TENANT_STATUSES.has(status) && !READ_METHODS.has(req.method)) {
      // Public players can still book on suspended tenants per doc4 §2 — the
      // restriction is admin-side. But for write methods on public endpoints
      // (cancel by player, etc.) keep them open: doc4 §2 says players still
      // see and cancel. Allow.
    }
    return withTenantContext(tenantId, async (tx) => handler(req, tenantId, tx))
  }
}
