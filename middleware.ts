import { NextResponse, type NextRequest } from 'next/server'
import { enforce, rateLimit429 } from '@/shared/rate-limit/apply'
import { parseClientIp } from '@/shared/rate-limit/key'

export const config = {
  matcher: [
    '/api/public/:path*',
    '/api/auth/:path*',
    '/verify',
  ],
}

export async function middleware(req: NextRequest): Promise<NextResponse | Response> {
  const path = req.nextUrl.pathname
  const ip = parseClientIp(req.headers)

  let policy: 'publicAvailability' | 'authVerify' | null = null
  if (path.startsWith('/api/public/')) policy = 'publicAvailability'
  else if (path.startsWith('/api/auth/') || path === '/verify') policy = 'authVerify'

  if (!policy) return NextResponse.next()

  const outcome = await enforce(policy, ip)
  if (!outcome.ok) return rateLimit429(outcome)
  return NextResponse.next()
}
