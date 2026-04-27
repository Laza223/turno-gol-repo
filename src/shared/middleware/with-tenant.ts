import { type NextRequest, NextResponse } from 'next/server'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import type { StaffUser } from '@/modules/auth/types'
import { getSql, withTenantContext, type DbTx } from '@/shared/db/client'

const BLOCKED_TENANT_STATUSES = new Set([
  'suspended',
  'blocked',
  'churned',
  'deleted',
])

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
    if (BLOCKED_TENANT_STATUSES.has(rows[0].status)) {
      return NextResponse.json(
        { error: 'forbidden', code: 'TENANT_BLOCKED', status: rows[0].status },
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
    if (rows.length === 0 || BLOCKED_TENANT_STATUSES.has(rows[0].status)) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    const tenantId = rows[0].id
    return withTenantContext(tenantId, async (tx) => handler(req, tenantId, tx))
  }
}
