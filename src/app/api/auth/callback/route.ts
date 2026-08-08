import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  provisionAndRouteStaff,
  syncStaffUserEmail,
  OrphanedStaffSessionError,
} from '@/modules/auth/auth.service'
import { getOrCreatePlayer } from '@/modules/players/player.service'
import { sanitizeNext } from '@/lib/safe-redirect'
import { playerSuccessIntent, successVerifyPath } from '@/lib/auth-success'
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
  const supabase = await createClient()

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
  // El otro lado de `magiclink.sent`: sin este par la tasa de apertura del mail
  // es invisible, y un mail que cae en spam se ve igual que un usuario que
  // abandonó. `ok` distingue el click que abrió sesión del que llegó con el
  // código vencido o ya consumido.
  track.auth('magiclink.clicked', { ok: !error && !!data?.user })
  if (error || !data?.user) {
    logger.error('Supabase verifyOtp error', { module: 'auth-callback', error: error instanceof Error ? error.message : String(error) })
    track.auth('auth.exchange_failed', {})
    // otp_expired cubre tanto "venció por tiempo" como "ya fue consumido" (GoTrue
    // no distingue los dos casos con códigos separados) — mismo patrón que
    // reset-password/actions.ts:50 (error.code === 'same_password').
    if (error?.code === 'otp_expired') return redirectVerifyError(req, 'expired')
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
    const intent = playerSuccessIntent(next)
    return NextResponse.redirect(new URL(successVerifyPath(next, intent), req.url))
  }

  // Staff: confirmación de alta (type=signup) o de cambio de email
  // (type=email_change, disparado por updateUserEmailAction). Provisión +
  // claims + ruteo en el helper único (compartido con loginAction).
  if (!user.email) return redirectVerifyError(req, 'invalid')

  // email_change confirmado: sincronizar staff_users.email al nuevo email ANTES
  // de provisionAndRouteStaff. La identidad se resuelve por staff_user_id (ya
  // seteado en app_metadata de un login previo), así que el orden no evita el
  // huérfano — pero deja staff_users.email consistente con Supabase Auth
  // apenas se confirma, no un request después.
  if (otpType === 'email_change') {
    const staffUserId = typeof meta.staff_user_id === 'string' ? meta.staff_user_id : null
    if (staffUserId) await syncStaffUserEmail(staffUserId, user.email)
  }

  // JWT con staff_user_id huérfano (típicamente reset de DB local sin reseed
  // completo, no un flujo real en operación normal): en vez de dejar que el
  // throw llegue sin manejar a la pantalla de error genérica de Next.js, se
  // cierra la sesión y se redirige a /verify con el mismo mecanismo de error
  // por query param que ya usan expired/used/invalid/exchange_failed.
  let path: string
  try {
    ;({ path } = await provisionAndRouteStaff(user))
  } catch (err) {
    if (err instanceof OrphanedStaffSessionError) {
      await supabase.auth.signOut()
      return redirectVerifyError(req, 'orphaned_session')
    }
    throw err
  }
  return NextResponse.redirect(new URL(successVerifyPath(path, 'signup'), req.url))
}
