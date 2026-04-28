import { type NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'node:crypto'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) {
    return NextResponse.redirect(new URL('/onboarding', req.url))
  }

  const clientId = process.env.MP_CLIENT_ID
  if (!clientId) {
    return NextResponse.redirect(
      new URL('/onboarding?error=mp_not_configured', req.url),
    )
  }

  const payload = Buffer.from(`${tenant.id}:${Date.now()}`).toString('base64url')
  const secret = process.env.MP_CLIENT_SECRET ?? ''
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  const state = `${payload}.${sig}`

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
  const redirectUri = `${appUrl}/api/mp/callback`

  const mpAuthUrl = new URL('https://auth.mercadopago.com/authorization')
  mpAuthUrl.searchParams.set('client_id', clientId)
  mpAuthUrl.searchParams.set('response_type', 'code')
  mpAuthUrl.searchParams.set('platform_id', 'mp')
  mpAuthUrl.searchParams.set('state', state)
  mpAuthUrl.searchParams.set('redirect_uri', redirectUri)

  return NextResponse.redirect(mpAuthUrl)
}
