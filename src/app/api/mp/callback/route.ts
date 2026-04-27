import { type NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { encrypt } from '@/lib/crypto/encrypt'
import { connectMercadoPago, completeOnboarding } from '@/modules/tenants/tenant.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type MpTokenResponse = {
  access_token: string
  refresh_token: string
  user_id: number
  public_key: string
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/onboarding?error=mp_missing_params', req.url),
    )
  }

  // Verify CSRF state
  const secret = process.env.MP_CLIENT_SECRET ?? ''
  const dot = state.indexOf('.')
  if (dot < 0) {
    return NextResponse.redirect(
      new URL('/onboarding?error=mp_invalid_state', req.url),
    )
  }
  const payload = state.slice(0, dot)
  const sig = state.slice(dot + 1)
  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.redirect(
      new URL('/onboarding?error=mp_invalid_state', req.url),
    )
  }

  // Decode tenantId from state payload
  const decoded = Buffer.from(payload, 'base64url').toString('utf8')
  const tenantId = decoded.split(':')[0]
  if (!tenantId) {
    return NextResponse.redirect(
      new URL('/onboarding?error=mp_invalid_state', req.url),
    )
  }

  // Exchange code for token
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
  const redirectUri = `${appUrl}/api/mp/callback`
  const clientId = process.env.MP_CLIENT_ID ?? ''

  const tokenRes = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: secret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(
      new URL('/onboarding?error=mp_token_failed', req.url),
    )
  }

  const tokenData = (await tokenRes.json()) as MpTokenResponse

  await connectMercadoPago(tenantId, {
    mpAccessToken: encrypt(tokenData.access_token),
    mpRefreshToken: encrypt(tokenData.refresh_token),
    mpUserId: String(tokenData.user_id),
    mpPublicKey: tokenData.public_key,
  })

  await completeOnboarding(tenantId)

  return NextResponse.redirect(new URL('/dashboard', req.url))
}
