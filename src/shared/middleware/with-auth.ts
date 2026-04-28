import { type NextRequest, NextResponse } from 'next/server'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import type { AuthUser } from '@/modules/auth/types'

export type AuthHandler = (
  req: NextRequest,
  user: AuthUser,
) => Promise<NextResponse> | NextResponse

export function withAuth(handler: AuthHandler): (req: NextRequest) => Promise<NextResponse> {
  return async (req) => {
    const user = await extractAuthUser()
    if (!user) {
      return NextResponse.json(
        { error: 'unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 },
      )
    }
    return handler(req, user)
  }
}
