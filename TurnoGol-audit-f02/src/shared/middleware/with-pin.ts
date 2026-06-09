import { type NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  verifyPin,
  COOKIE_NAME,
  COOKIE_TTL_MS,
  buildPinCookie,
  verifyPinCookie,
} from '@/modules/auth/pin'
import { getSql, type DbTx } from '@/shared/db/client'
import type { StaffUser } from '@/modules/auth/types'

export type PinInnerHandler = (
  req: NextRequest,
  user: StaffUser,
  tx: DbTx,
) => Promise<NextResponse> | NextResponse

/**
 * Compose AFTER withTenant (or withRole). Validates a recent PIN session cookie;
 * otherwise requires `X-Staff-Pin` header, hashes + compares against
 * tenants.settings->>'staff_pin_hash'. On success, sets/refreshes cookie (30m TTL).
 */
export function withPin(handler: PinInnerHandler): PinInnerHandler {
  return async (req, user, tx) => {
    const cookieStore = cookies()
    const existing = cookieStore.get(COOKIE_NAME)?.value
    if (existing && verifyPinCookie(existing)) {
      return handler(req, user, tx)
    }
    const provided = req.headers.get('x-staff-pin')
    if (!provided) {
      return NextResponse.json(
        { error: 'forbidden', code: 'PIN_REQUIRED' },
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
    const rows = await sql<{ hash: string | null }[]>`
      SELECT settings->>'staff_pin_hash' AS hash
      FROM tenants
      WHERE id = ${user.tenantId}
      LIMIT 1
    `
    const hash = rows[0]?.hash ?? null
    if (!hash) {
      return NextResponse.json(
        { error: 'forbidden', code: 'PIN_NOT_CONFIGURED' },
        { status: 403 },
      )
    }
    const ok = await verifyPin(provided, hash)
    if (!ok) {
      return NextResponse.json(
        { error: 'forbidden', code: 'PIN_INVALID' },
        { status: 403 },
      )
    }
    const res = await handler(req, user, tx)
    res.cookies.set({
      name: COOKIE_NAME,
      value: buildPinCookie(),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: Math.floor(COOKIE_TTL_MS / 1000),
      path: '/',
    })
    return res
  }
}
