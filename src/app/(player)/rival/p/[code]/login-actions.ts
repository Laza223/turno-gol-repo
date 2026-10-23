'use server'

import { z } from 'zod'
import { headers, cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { signInWithPlayerMagicLink, signInWithGooglePlayer } from '@/modules/auth/auth.service'
import { isRivalEnabled } from '@/modules/rival/rival.flags'
import { inviteCodeSchema } from '@/modules/rival/rival.schema'
import {
  buildGoogleTermsCookie,
  GOOGLE_TERMS_COOKIE_NAME,
  GOOGLE_TERMS_COOKIE_TTL_MS,
} from '@/shared/security/google-terms-cookie'
import {
  RIVAL_INTENT_COOKIE_NAME,
  RIVAL_INTENT_COOKIE_TTL_MS,
  RIVAL_INTENT_PARAM,
  signCookieRivalIntent,
  signEmailRivalIntent,
} from '@/shared/security/rival-intent'
import { isRivalPath } from '@/lib/auth-success'
import { sanitizeNext } from '@/lib/safe-redirect'
import { captureMessage } from '@/lib/sentry'
import { enforce } from '@/shared/rate-limit'
import { CURRENT_TERMS_VERSION, TERMS_REQUIRED_MESSAGE } from '@/shared/terms'
import { echoFields } from '@/shared/forms/echo'
import { nameFromEmail } from '@/shared/forms/name-from-email'
import type { GateState } from '@/app/(public)/[slug]/reservar/actions'

/**
 * Ingreso de RIVAL ("Voy" sin sesión): espejo de `sendPlayerMagicLink` y de la action de Google de
 * `reservar/actions.ts`, pero el vínculo de intención es el del PARTIDO (`rival-intent.ts`) y no el
 * de una reserva. El estado de la respuesta es el mismo `GateState`, así que el `LoginGate` no se
 * entera de cuál de los dos flujos lo llama.
 */

const RIVAL_UNAVAILABLE = 'RIVAL todavía no está disponible.'
const INVALID_MATCH = 'El link del partido no es válido.'

/** Del `next` del form al código del partido, o `null` si no es `/rival/p/<code>` con un código válido. */
function codeFromNext(rawNext: unknown): string | null {
  const next = sanitizeNext(typeof rawNext === 'string' ? rawNext : null)
  if (!isRivalPath(next)) return null
  const code = inviteCodeSchema.safeParse(new URL(next, 'http://localhost').pathname.split('/')[3])
  return code.success ? code.data : null
}

const GATE_ECHO = ['email'] as const

// `terms` lo manda el ingreso (tocar un botón es aceptar: ver LoginGate) y el servidor lo exige igual.
const gateSchema = z.object({
  terms: z.literal('on', { error: TERMS_REQUIRED_MESSAGE }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: 'Ingresá un email válido' })),
})

export async function sendRivalMagicLinkAction(
  _prev: GateState,
  formData: FormData,
): Promise<GateState> {
  if (!(await isRivalEnabled())) return { status: 'error', message: RIVAL_UNAVAILABLE }
  const code = codeFromNext(formData.get('next'))
  if (!code) return { status: 'error', message: INVALID_MATCH }

  const values = echoFields(formData, GATE_ECHO)
  const parsed = gateSchema.safeParse({
    email: formData.get('email'),
    terms: formData.get('terms'),
  })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path[0]
    return {
      status: 'error',
      message: issue?.message ?? 'Datos inválidos.',
      ...(field === 'terms' || field === 'email' ? { field } : {}),
      values,
    }
  }

  // Mismo tope que el ingreso de la reserva: no inundar la casilla de un jugador.
  const rl = await enforce('authMagicLink', parsed.data.email)
  if (!rl.ok) {
    return {
      status: 'error',
      message: 'Demasiados intentos. Esperá un minuto y probá de nuevo.',
      values,
    }
  }

  const origin = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  // Si no se puede firmar (sin secreto) se degrada: el `next` va sin vínculo y el jugador toca
  // "Voy" de nuevo al volver. Nunca romper el ingreso.
  let next = `/rival/p/${code}`
  try {
    const token = signEmailRivalIntent({ code }, parsed.data.email)
    next = `${next}?${RIVAL_INTENT_PARAM}=${encodeURIComponent(token)}`
  } catch {
    captureMessage('rival: no se pudo firmar el vínculo de "Voy"', 'warning')
  }
  const redirectTo = `${origin}/api/auth/callback?next=${encodeURIComponent(next)}`

  const firstName = nameFromEmail(parsed.data.email)
  const result = await signInWithPlayerMagicLink(parsed.data.email, redirectTo, {
    firstName,
    lastName: '',
    agreedTerms: true,
    termsVersion: CURRENT_TERMS_VERSION,
  })
  if (!result.ok)
    return { status: 'error', message: 'No pudimos enviar el email. Probá de nuevo.', values }
  return { status: 'sent', email: parsed.data.email, firstName }
}

/**
 * Google desde "Voy": tocar el botón es aceptar los términos (clickwrap) y el form manda
 * `terms=on`; sin eso no redirige. Setea la cookie de términos y la del vínculo del partido ANTES
 * de mandar a Google (mismo razonamiento que `startGoogleLoginFromReservar`: ni el `next` ni un
 * query param viajan firmados por una URL externa).
 */
export async function startGoogleLoginFromRivalAction(
  _prev: GateState,
  formData: FormData,
): Promise<GateState> {
  if (!(await isRivalEnabled())) return { status: 'error', message: RIVAL_UNAVAILABLE }
  const code = codeFromNext(formData.get('next'))
  if (!code) return { status: 'error', message: INVALID_MATCH }

  const cookieStore = await cookies()
  if (formData.get('terms') !== 'on') {
    cookieStore.delete(GOOGLE_TERMS_COOKIE_NAME)
    cookieStore.delete(RIVAL_INTENT_COOKIE_NAME)
    return { status: 'error', message: TERMS_REQUIRED_MESSAGE, field: 'terms' }
  }
  // Los flags van escritos en cada `.set` (no en un objeto compartido): `cookie-flags.test.ts` los
  // exige literales en el bloque.
  cookieStore.set({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    name: GOOGLE_TERMS_COOKIE_NAME,
    value: buildGoogleTermsCookie(CURRENT_TERMS_VERSION),
    maxAge: Math.floor(GOOGLE_TERMS_COOKIE_TTL_MS / 1000),
  })
  cookieStore.set({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    name: RIVAL_INTENT_COOKIE_NAME,
    value: signCookieRivalIntent({ code }),
    maxAge: Math.floor(RIVAL_INTENT_COOKIE_TTL_MS / 1000),
  })

  const next = `/rival/p/${code}`
  const origin = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  const redirectTo = `${origin}/api/auth/callback?next=${encodeURIComponent(next)}`

  const result = await signInWithGooglePlayer(redirectTo)
  if (!result.url) redirect(next)
  redirect(result.url)
}

/** Firmas que consumen `RivalVoyGate` y el `LoginGate` (las actions entran por PROP). */
export type SendRivalMagicLink = typeof sendRivalMagicLinkAction
export type StartGoogleLoginFromRival = typeof startGoogleLoginFromRivalAction
