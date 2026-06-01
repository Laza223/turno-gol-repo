import { type NextRequest, NextResponse } from 'next/server'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import type { AuthUser } from '@/modules/auth/types'
import { unauthorized } from '@/shared/api-error'

export type AuthHandler = (
  req: NextRequest,
  user: AuthUser,
) => Promise<NextResponse> | NextResponse

export function withAuth(handler: AuthHandler): (req: NextRequest) => Promise<NextResponse> {
  return async (req) => {
    const user = await extractAuthUser()
    if (!user) {
      return unauthorized('Autenticación requerida.', { code: 'AUTH_REQUIRED' })
    }
    return handler(req, user)
  }
}
