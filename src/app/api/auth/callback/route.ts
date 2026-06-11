import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { EmailOtpType, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getOrCreateStaffUser,
  resolveStaffTenants,
  setStaffTenantClaim,
} from '@/modules/auth/auth.service'
import { getOrCreatePlayer } from '@/modules/players/player.service'
import { sanitizeNext } from '@/lib/safe-redirect'
import { logger } from '@/shared/lib/logger'
import { track, withSpan } from '@/shared/observability'
import { CURRENT_TERMS_VERSION } from '@/shared/terms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const codeSchema = z.string().min(1).max(512)

function redirectVerifyError(req: NextRequest, code: string): NextResponse {
  const url = new URL('/verify', req.url)
  url.searchParams.set('error', code)
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return withSpan('auth.callback', 'auth.session.exchange', () => handleAuthCallback(req))
}

async function handleAuthCallback(req: NextRequest): Promise<NextResponse> {
  const params = new URL(req.url).searchParams
  const supabase = createClient()

  // Preferred flow: token_hash + verifyOtp. It needs NO PKCE code_verifier
  // cookie, so it's robust to the two ways the code flow below breaks the first
  // magic link: (1) requesting a second link overwrites the verifier cookie, so
  // the first link's code no longer matches; (2) an email scanner prefetches the
  // link and consumes the one-time code before the user clicks. verifyOtp sidesteps
  // both. Requires the email template to point here with token_hash (see route doc).
  const tokenHash = params.get('token_hash')
  const code = params.get('code')

  let user: User
  if (tokenHash) {
    const otpType = (params.get('type') ?? 'email') as EmailOtpType
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType })
    if (error || !data?.user) {
      logger.error('Supabase verifyOtp error', { module: 'auth-callback', error: error instanceof Error ? error.message : String(error) })
      track.auth('auth.exchange_failed', {})
      return redirectVerifyError(req, 'exchange_failed')
    }
    user = data.user
  } else if (code) {
    const parsedCode = codeSchema.safeParse(code)
    if (!parsedCode.success) return redirectVerifyError(req, 'invalid')
    const { data, error } = await supabase.auth.exchangeCodeForSession(parsedCode.data)
    if (error || !data?.user) {
      logger.error('Supabase auth exchange error', { module: 'auth-callback', error: error instanceof Error ? error.message : String(error) })
      track.auth('auth.exchange_failed', {})
      return redirectVerifyError(req, 'exchange_failed')
    }
    user = data.user
  } else {
    return redirectVerifyError(req, 'invalid')
  }

  const meta: Record<string, unknown> = user.app_metadata ?? {}
  const userMeta: Record<string, unknown> = user.user_metadata ?? {}
  const isPlayer = meta.is_player === true || userMeta.is_player === true

  if (isPlayer) {
    const email = user.email
    if (!email) return redirectVerifyError(req, 'invalid')

    const firstNameMeta = typeof userMeta.first_name === 'string' ? userMeta.first_name : null
    const lastNameMeta = typeof userMeta.last_name === 'string' ? userMeta.last_name : null
    const firstName = firstNameMeta || email.split('@')[0] || 'Jugador'
    const lastName = lastNameMeta ?? ''
    const agreedTerms = userMeta.agreed_terms === true || meta.agreed_terms === true
    const termsVersion = typeof userMeta.terms_version === 'string' ? userMeta.terms_version : CURRENT_TERMS_VERSION

    const player = await getOrCreatePlayer(email, firstName, lastName, {
      agreedToTerms: agreedTerms,
      termsVersion,
    })

    if (meta.player_id !== player.id || meta.is_player !== true) {
      const adminClient = createAdminClient()
      await adminClient.auth.admin.updateUserById(user.id, {
        app_metadata: { ...meta, is_player: true, player_id: player.id },
      })
      await supabase.auth.refreshSession()
    }

    track.auth('player.login', { playerId: player.id })
    const next = sanitizeNext(new URL(req.url).searchParams.get('next'))
    return NextResponse.redirect(new URL(next, req.url))
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
    track.auth('staff.onboarding', { staffUserId: ourStaff.id, tenantCount: 0 })
    return NextResponse.redirect(new URL('/onboarding', req.url))
  }

  if (tenants.length === 1) {
    await setStaffTenantClaim(user.id, tenants[0].tenantId, ourStaff.id)
    // Force refresh so the new app_metadata.tenant_id appears in the next JWT.
    await supabase.auth.refreshSession()
    track.auth('staff.login', { staffUserId: ourStaff.id, tenantCount: 1 })
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  // N tenants → user picks one at /select-tenant (page + selectTenantAction set
  // the tenant_id claim and refresh the session before entering /dashboard).
  track.auth('staff.login', { staffUserId: ourStaff.id, tenantCount: tenants.length })
  return NextResponse.redirect(new URL('/select-tenant', req.url))
}
