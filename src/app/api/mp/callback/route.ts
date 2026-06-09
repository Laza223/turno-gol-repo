import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
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

const querySchema = z.object({
  code: z.string().min(1).max(512),
  state: z.string().min(1).max(1024),
})

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    code: url.searchParams.get('code'),
    state: url.searchParams.get('state'),
  })

  if (!parsed.success) {
    return NextResponse.redirect(
      new URL('/onboarding?error=mp_missing_params', req.url),
    )
  }
  const { code, state } = parsed.data

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

  // Decode tenantId + issued-at timestamp from the state payload.
  // Formato (ver oauth-start/route.ts): base64url(`${tenantId}:${Date.now()}`)
  const decoded = Buffer.from(payload, 'base64url').toString('utf8')
  const [tenantId, tsRaw] = decoded.split(':')
  if (!tenantId || !tsRaw) {
    return NextResponse.redirect(
      new URL('/onboarding?error=mp_invalid_state', req.url),
    )
  }

  // Anti-replay (#10): el state va por la URL de redirect de MP (queda en logs,
  // historial, Referer). El ts esta firmado por HMAC, asi que solo lo evaluamos
  // sobre payloads con firma valida. Rechazar states expirados o con ts futuro.
  const issuedAt = Number(tsRaw)
  const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutos
  const age = Date.now() - issuedAt
  if (!Number.isFinite(issuedAt) || age < 0 || age > STATE_TTL_MS) {
    return NextResponse.redirect(
      new URL('/onboarding?error=mp_invalid_state', req.url),
    )
  }

  // Exchange code for token — require APP_URL (no req.url origin fallback to
  // avoid host-header injection into the OAuth redirect_uri).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    return NextResponse.redirect(
      new URL('/onboarding?error=mp_config_missing', req.url),
    )
  }
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
