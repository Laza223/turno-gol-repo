import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getOrCreateStaffUser,
  resolveStaffTenants,
  setStaffTenantClaim,
} from '@/modules/auth/auth.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function redirectVerifyError(req: NextRequest, code: string): NextResponse {
  const url = new URL('/verify', req.url)
  url.searchParams.set('error', code)
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const code = new URL(req.url).searchParams.get('code')
  if (!code) return redirectVerifyError(req, 'invalid')

  const supabase = createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data?.user) {
    console.error('Supabase auth exchange error:', error)
    return redirectVerifyError(req, 'exchange_failed')
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
  if (!email) return redirectVerifyError(req, 'invalid')

  const givenName = typeof userMeta.given_name === 'string' ? userMeta.given_name : null
  const familyName = typeof userMeta.family_name === 'string' ? userMeta.family_name : null
  const firstNameMeta = typeof userMeta.first_name === 'string' ? userMeta.first_name : null
  const lastNameMeta = typeof userMeta.last_name === 'string' ? userMeta.last_name : null
  const phoneMeta = typeof userMeta.phone === 'string' ? userMeta.phone : null
  const firstName = firstNameMeta ?? givenName ?? email.split('@')[0]
  const lastName = lastNameMeta ?? familyName ?? ''

  const ourStaff = await getOrCreateStaffUser(email, firstName, lastName, phoneMeta)
  const tenants = await resolveStaffTenants(ourStaff.id)

  if (tenants.length === 0) {
    // Set staffUserId so they can pass the layout checks, even without a tenant
    const adminClient = createAdminClient()
    await adminClient.auth.admin.updateUserById(user.id, {
      app_metadata: { ...meta, staff_user_id: ourStaff.id }
    })
    await supabase.auth.refreshSession()
    return NextResponse.redirect(new URL('/onboarding', req.url))
  }

  if (tenants.length === 1) {
    await setStaffTenantClaim(user.id, tenants[0].tenantId, ourStaff.id)
    // Force refresh so the new app_metadata.tenant_id appears in the next JWT.
    await supabase.auth.refreshSession()
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  // N tenants → user picks at /select-tenant (out of scope here).
  return NextResponse.redirect(new URL('/select-tenant', req.url))
}
