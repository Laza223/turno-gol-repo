import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { cookies } from 'next/headers'
import type { EmailOtpType, User } from '@supabase/supabase-js'
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
import {
  GOOGLE_TERMS_COOKIE_NAME,
  verifyGoogleTermsCookie,
} from '@/shared/security/google-terms-cookie'

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

/**
 * Única fuente de verdad de provisión de JUGADOR en el callback — la usan
 * tanto la rama `token_hash` (magic link) como `code` (Google OAuth,
 * reintroducida 2026-08-14, solo alcance jugador). `hasAgreedTerms` decide el
 * ruteo: si el consentimiento +18/ToC (ADR-012) no quedó resuelto en el mismo
 * viaje (Google no soporta `options.data`, así que `/ingresar` sin checkbox
 * llega acá sin haberlo mandado), una única pantalla `/aceptar-terminos` lo
 * captura antes de `next` — cubre LoginGate y /ingresar sin distinguir origen,
 * porque mira el estado final en DB, no de dónde vino el request.
 */
async function provisionPlayerAndRedirect(
  req: NextRequest,
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: User,
  opts: { agreedTerms: boolean; termsVersion: string },
): Promise<NextResponse> {
  const email = user.email
  if (!email) return redirectVerifyError(req, 'invalid')

  const meta: Record<string, unknown> = user.app_metadata ?? {}

  // Defensa cross-account (revisión adversarial 2026-08-14): esta identidad de
  // auth.users YA es staff/system_admin (mismo email de Gmail que su cuenta de
  // trabajo, típicamente vía auto-link de Supabase por email verificado). Sin
  // este chequeo, la rama `code` de Google marcaba `is_player:true` ENCIMA de
  // esos claims sin tocarlos — y como extractRealAuthUser mira `is_player`
  // ANTES que `is_system_admin`/staff (auth.middleware.ts), la cuenta quedaba
  // reclasificada `type:'player'` para SIEMPRE, incluso en su próximo login
  // normal con password. Sin flujo de autoservicio para revertirlo. Cierra
  // sesión y explica en vez de mergear un rol encima del otro.
  if (meta.tenant_id || meta.staff_user_id || meta.is_system_admin === true) {
    logger.warn('Cuenta staff/system_admin intentó loguearse como jugador', {
      module: 'auth-callback',
      authUserId: user.id,
    })
    await supabase.auth.signOut()
    return redirectVerifyError(req, 'account_conflict')
  }

  const userMeta: Record<string, unknown> = user.user_metadata ?? {}
  const firstNameMeta = typeof userMeta.first_name === 'string' ? userMeta.first_name : null
  const lastNameMeta = typeof userMeta.last_name === 'string' ? userMeta.last_name : null
  // Perfil de Google OAuth: claims OIDC estándar, no los que mandamos nosotros
  // en options.data del magic link.
  const givenName = typeof userMeta.given_name === 'string' ? userMeta.given_name : null
  const familyName = typeof userMeta.family_name === 'string' ? userMeta.family_name : null
  const fullName =
    typeof userMeta.full_name === 'string'
      ? userMeta.full_name
      : typeof userMeta.name === 'string'
        ? userMeta.name
        : null
  const [fullFirst, ...fullRest] = fullName ? fullName.split(' ') : []
  const firstName = firstNameMeta || givenName || fullFirst || email.split('@')[0] || 'Jugador'
  const lastName = lastNameMeta ?? familyName ?? fullRest.join(' ')

  const player = await getOrCreatePlayer(email, firstName, lastName, {
    agreedToTerms: opts.agreedTerms,
    termsVersion: opts.termsVersion,
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

  if (!player.hasAgreedTerms) {
    const url = new URL('/aceptar-terminos', req.url)
    url.searchParams.set('next', next)
    return NextResponse.redirect(url)
  }

  const intent = playerSuccessIntent(next, player.wasCreated)
  return NextResponse.redirect(new URL(successVerifyPath(next, intent), req.url))
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return withSpan('auth.callback', 'auth.session.exchange', () => handleAuthCallback(req))
}

async function handleAuthCallback(req: NextRequest): Promise<NextResponse> {
  const params = new URL(req.url).searchParams
  const supabase = await createClient()

  // Google OAuth (jugador, alcance ADR-002/2026-08-14): rama `code` separada de
  // la de OTP de abajo — exchangeCodeForSession en vez de verifyOtp, sin `type`.
  // El consentimiento viaja por la cookie firmada de google-terms-cookie.ts, NO
  // por un query param — solo LoginGate la setea (ahí el checkbox ya es
  // obligatorio antes del click); /ingresar nunca la setea y cae en el gate de
  // `hasAgreedTerms` de provisionPlayerAndRedirect.
  const code = params.get('code')
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    track.auth('oauth.exchanged', { ok: !error && !!data?.user })
    if (error || !data?.user) {
      logger.error('Supabase exchangeCodeForSession error', {
        module: 'auth-callback',
        error: error instanceof Error ? error.message : String(error),
      })
      track.auth('auth.exchange_failed', {})
      return redirectVerifyError(req, 'exchange_failed')
    }
    // Cookie firmada de un solo uso (no un query param en la URL — revisión
    // adversarial 2026-08-14, ver google-terms-cookie.ts): la seteó
    // startGoogleLoginFromReservar SOLO si el checkbox de términos estaba
    // tildado. Se borra siempre, se haya podido verificar o no.
    const cookieStore = await cookies()
    const termsCookie = verifyGoogleTermsCookie(cookieStore.get(GOOGLE_TERMS_COOKIE_NAME)?.value)
    cookieStore.delete(GOOGLE_TERMS_COOKIE_NAME)

    return provisionPlayerAndRedirect(req, supabase, data.user, {
      agreedTerms: termsCookie !== null,
      termsVersion: termsCookie?.termsVersion ?? CURRENT_TERMS_VERSION,
    })
  }

  // token_hash + verifyOtp is the other flow (email confirmation/recovery/magic
  // link/invite/email_change). verifyOtp needs NO code_verifier cookie, so it's
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
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash.data,
    type: otpType,
  })
  // El otro lado de `magiclink.sent`: sin este par la tasa de apertura del mail
  // es invisible, y un mail que cae en spam se ve igual que un usuario que
  // abandonó. `ok` distingue el click que abrió sesión del que llegó con el
  // código vencido o ya consumido.
  track.auth('magiclink.clicked', { ok: !error && !!data?.user })
  if (error || !data?.user) {
    logger.error('Supabase verifyOtp error', {
      module: 'auth-callback',
      error: error instanceof Error ? error.message : String(error),
    })
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
    const agreedTerms = userMeta.agreed_terms === true || meta.agreed_terms === true
    const termsVersion =
      typeof userMeta.terms_version === 'string' ? userMeta.terms_version : CURRENT_TERMS_VERSION
    return provisionPlayerAndRedirect(req, supabase, user, { agreedTerms, termsVersion })
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
