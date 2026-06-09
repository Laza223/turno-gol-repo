import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

const uuidSchema = z.string().uuid()

/**
 * Extract the last path segment as a UUID and validate it via Zod.
 *
 * Many `[id]` route handlers used `req.nextUrl.pathname.split('/').pop()!`
 * and passed the raw string straight to Drizzle. A malformed value reached
 * Postgres and surfaced as `22P02 invalid input syntax for type uuid`, which
 * leaked the SQL to clients as a 500 with a stack trace. This helper rejects
 * adversarial inputs (`'OR'1'='1`, `../etc/passwd`, junk) with a clean 400
 * before any DB query runs.
 *
 * Usage:
 *   const r = parseRouteUuid(req)
 *   if ('response' in r) return r.response
 *   const id = r.uuid
 */
export function parseRouteUuid(
  req: NextRequest,
  position: 'last' | 'second-last' = 'last',
): { uuid: string } | { response: NextResponse } {
  const parts = req.nextUrl.pathname.split('/').filter(Boolean)
  const raw = position === 'last' ? parts[parts.length - 1] : parts[parts.length - 2]
  const parsed = uuidSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      response: NextResponse.json(
        { error: { code: 'INVALID_ID', message: 'ID inválido.' } },
        { status: 400 },
      ),
    }
  }
  return { uuid: parsed.data }
}
