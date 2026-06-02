import { NextResponse, type NextRequest } from 'next/server'
import { enforce, rateLimit429 } from '@/shared/rate-limit/apply'
import { parseClientIp } from '@/shared/rate-limit/key'
import { resolveRequestId } from '@/shared/lib/request-id'
import {
  isForbiddenCrossSiteMutation,
  isSensitiveMutationPath,
} from '@/shared/security/fetch-metadata'

export const config = {
  matcher: [
    '/api/public/:path*',
    '/api/auth/:path*',
    '/verify',
    // Sec-Fetch isolation for payments + cancellations (see below).
    '/api/billing/:path*',
    '/api/bookings/:path*',
    '/api/player/bookings/:path*',
  ],
}

export async function middleware(req: NextRequest): Promise<NextResponse | Response> {
  const path = req.nextUrl.pathname
  const ip = parseClientIp(req.headers)

  // Trace correlation id: reuse incoming or mint a fresh one, propagate
  // downstream via request headers and echo it on the response.
  const requestId = resolveRequestId(req.headers.get('x-request-id'))
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-request-id', requestId)

  // Fetch Metadata isolation (CSRF / cross-origin-abuse defence-in-depth on the
  // money path). Block state-changing requests to payment/cancellation
  // endpoints that the browser stamps as cross-site. Webhooks and OAuth/auth
  // callbacks are excluded by isSensitiveMutationPath. See docs/security-decisions.md.
  if (
    isSensitiveMutationPath(path) &&
    isForbiddenCrossSiteMutation(req.method, req.headers.get('sec-fetch-site'))
  ) {
    const res = NextResponse.json(
      { error: { code: 'CROSS_SITE_FORBIDDEN', message: 'Origen de la solicitud no permitido.' } },
      { status: 403 },
    )
    res.headers.set('x-request-id', requestId)
    return res
  }

  let policy: 'publicAvailability' | 'authVerify' | null = null
  if (path.startsWith('/api/public/')) policy = 'publicAvailability'
  else if (path.startsWith('/api/auth/') || path === '/verify') policy = 'authVerify'

  if (policy) {
    const outcome = await enforce(policy, ip)
    if (!outcome.ok) {
      const res = rateLimit429(outcome, requestId)
      res.headers.set('x-request-id', requestId)
      return res
    }
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set('x-request-id', requestId)
  return res
}
