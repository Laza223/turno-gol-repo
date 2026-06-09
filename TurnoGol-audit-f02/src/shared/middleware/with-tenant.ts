import { type NextRequest, NextResponse } from 'next/server'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import type { StaffUser } from '@/modules/auth/types'
import { getSql, withTenantContext, type DbTx } from '@/shared/db/client'

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
      return NextResponse.json(
        { error: 'unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 },
      )
    }
    if (user.type !== 'staff') {
      return NextResponse.json(
        { error: 'forbidden', code: 'STAFF_REQUIRED' },
        { status: 403 },
      )
    }
    if (!user.tenantId) {
      return NextResponse.json(
        { error: 'forbidden', code: 'NO_TENANT_CONTEXT' },
        { status: 403 },
      )
    }
    const sql = getSql()
    const rows = await sql<{ status: string }[]>`
      SELECT status FROM tenants WHERE id = ${user.tenantId} LIMIT 1
    `
    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'forbidden', code: 'TENANT_NOT_FOUND' },
        { status: 403 },
      )
    }
    const status = rows[0].status
    if (BLOCKED_TENANT_STATUSES.has(status)) {
      return NextResponse.json(
        { error: 'forbidden', code: 'TENANT_BLOCKED', status },
        { status: 403 },
      )
    }
    if (READ_ONLY_TENANT_STATUSES.has(status) && !READ_METHODS.has(req.method)) {
      return NextResponse.json(
        { error: 'forbidden', code: 'TENANT_SUSPENDED_READ_ONLY', status },
        { status: 403 },
      )
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
      return NextResponse.json(
        { error: 'unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 },
      )
    }
    if (user.type !== 'staff') {
      return NextResponse.json(
        { error: 'forbidden', code: 'STAFF_REQUIRED' },
        { status: 403 },
      )
    }
    if (!user.tenantId) {
      return NextResponse.json(
        { error: 'forbidden', code: 'NO_TENANT_CONTEXT' },
        { status: 403 },
      )
    }
    const sql = getSql()
    const rows = await sql<{ status: string }[]>`
      SELECT status FROM tenants WHERE id = ${user.tenantId} LIMIT 1
    `
    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'forbidden', code: 'TENANT_NOT_FOUND' },
        { status: 403 },
      )
    }
    const status = rows[0].status
    if (status === 'deleted') {
      return NextResponse.json(
        { error: 'forbidden', code: 'TENANT_DELETED' },
        { status: 403 },
      )
    }
    if (status === 'blocked') {
      return NextResponse.json(
        { error: 'forbidden', code: 'TENANT_BLOCKED' },
        { status: 403 },
      )
    }
    // Allow canceled, churned, suspended, past_due, active, trialing.
    if (
      !BILLING_REACTIVATE_ALLOWED.has(status) &&
      !['active', 'trialing', 'past_due', 'suspended'].includes(status)
    ) {
      return NextResponse.json(
        { error: 'forbidden', code: 'TENANT_INVALID_STATE', status },
        { status: 403 },
      )
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
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    const sql = getSql()
    const rows = await sql<{ id: string; status: string }[]>`
      SELECT id, status FROM tenants WHERE slug = ${slug} LIMIT 1
    `
    if (rows.length === 0) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    const { id: tenantId, status } = rows[0]
    if (BLOCKED_TENANT_STATUSES.has(status)) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
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
