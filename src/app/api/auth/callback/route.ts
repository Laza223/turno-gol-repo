import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { provisionAndRouteStaff } from '@/modules/auth/auth.service'
import { getOrCreatePlayer } from '@/modules/players/player.service'
import { sanitizeNext } from '@/lib/safe-redirect'
import { logger } from '@/shared/lib/logger'
import { track, withSpan } from '@/shared/observability'
import { CURRENT_TERMS_VERSION } from '@/shared/terms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const tokenHashSchema = z.string().min(1).max(512)
const ALLOWED_OTP_TYPES = new Set<EmailOtpType>([
  'email',
  'signup',
  'recovery',
  'magiclink',
  'invite',
  'email_change',
])

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

  // token_hash + verifyOtp is the ONLY flow now (Google OAuth removed, so the
  // PKCE `code` branch is gone). verifyOtp needs NO code_verifier cookie, so it's
  // robust to the two ways the old code flow broke the first link: (1) requesting
  // a second link overwrote the verifier cookie; (2) an email scanner prefetched
  // and consumed the one-time code. Requires templates to point here with
  // token_hash + type (confirmation/recovery/magic-link templates).
  const tokenHash = tokenHashSchema.safeParse(params.get('token_hash'))
  if (!tokenHash.success) return redirectVerifyError(req, 'invalid')

  const rawType = params.get('type') ?? 'email'
  const otpType: EmailOtpType = ALLOWED_OTP_TYPES.has(rawType as EmailOtpType)
    ? (rawType as EmailOtpType)
    : 'email'
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash.data, type: otpType })
  if (error || !data?.user) {
    logger.error('Supabase verifyOtp error', { module: 'auth-callback', error: error instanceof Error ? error.message : String(error) })
    track.auth('auth.exchange_failed', {})
    return redirectVerifyError(req, 'exchange_failed')
  }
  const user = data.user

  // Recovery (staff "olvidé mi contraseña"): verifyOtp ya dejó activa la sesión
  // recovery. No se provisiona ni se setean claims acá — el usuario va a
  // /reset-password a fijar la nueva contraseña.
  if (otpType === 'recovery') {
    return NextResponse.redirect(new URL('/reset-password', req.url))
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

  // Staff: confirmación de alta (type=signup). Provisión + claims + ruteo en el
  // helper único (compartido con loginAction).
  if (!user.email) return redirectVerifyError(req, 'invalid')
  const { path } = await provisionAndRouteStaff(user)
  return NextResponse.redirect(new URL(path, req.url))
}
