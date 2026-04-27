import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getOrCreateStaffUser,
  resolveStaffTenants,
  setStaffTenantClaim,
} from '@/modules/auth/auth.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/dashboard'

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', req.url))
  }

  const supabase = createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data?.user) {
    const msg = encodeURIComponent(error?.message ?? 'exchange_failed')
    return NextResponse.redirect(new URL(`/login?error=${msg}`, req.url))
  }

  const user = data.user
  const meta: Record<string, unknown> = user.app_metadata ?? {}
  const userMeta: Record<string, unknown> = user.user_metadata ?? {}
  const isPlayer = meta.is_player === true || userMeta.is_player === true

  if (isPlayer) {
    return NextResponse.redirect(new URL('/mis-reservas', req.url))
  }

  // Staff path
  const email = user.email
  if (!email) {
    return NextResponse.redirect(new URL('/login?error=no_email', req.url))
  }

  const givenName = typeof userMeta.given_name === 'string' ? userMeta.given_name : null
  const familyName = typeof userMeta.family_name === 'string' ? userMeta.family_name : null
  const firstNameMeta = typeof userMeta.first_name === 'string' ? userMeta.first_name : null
  const lastNameMeta = typeof userMeta.last_name === 'string' ? userMeta.last_name : null
  const firstName = firstNameMeta ?? givenName ?? email.split('@')[0]
  const lastName = lastNameMeta ?? familyName ?? ''

  const ourStaff = await getOrCreateStaffUser(email, firstName, lastName)
  const tenants = await resolveStaffTenants(ourStaff.id)

  if (tenants.length === 0) {
    return NextResponse.redirect(new URL('/onboarding', req.url))
  }

  if (tenants.length === 1) {
    await setStaffTenantClaim(user.id, tenants[0].tenantId, ourStaff.id)
    // Force refresh so the new app_metadata.tenant_id appears in the next JWT.
    await supabase.auth.refreshSession()
    return NextResponse.redirect(new URL(next, req.url))
  }

  // N tenants → user picks. Pre-select happens in /select-tenant page (P4).
  const target = `/select-tenant?next=${encodeURIComponent(next)}`
  return NextResponse.redirect(new URL(target, req.url))
}
