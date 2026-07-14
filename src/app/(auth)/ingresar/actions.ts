'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { signInWithExistingPlayerMagicLink } from '@/modules/auth/auth.service'
import { enforce } from '@/shared/rate-limit/apply'
import { sanitizeNext } from '@/lib/safe-redirect'

export type PlayerLoginState =
  | { status: 'idle' }
  | { status: 'sent'; email: string }
  | { status: 'error'; message: string }

async function callbackOrigin(): Promise<string> {
  return (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
}

// Magic link de re-acceso para un jugador EXISTENTE (sesión vencida). El alta de
// jugador nuevo sigue ocurriendo al reservar (LoginGate), no acá.
export async function playerLoginAction(
  _prev: PlayerLoginState,
  formData: FormData,
): Promise<PlayerLoginState> {
  const email = z
    .string()
    .trim()
    .toLowerCase()
    .email({ message: 'Ingresá un email válido' })
    .safeParse(formData.get('email'))
  if (!email.success) return { status: 'error', message: 'Ingresá un email válido.' }

  const rl = await enforce('authMagicLink', email.data)
  if (!rl.ok) {
    return { status: 'error', message: 'Demasiados intentos. Esperá un minuto.' }
  }

  const nextRaw = formData.get('next')
  const safeNext = sanitizeNext(typeof nextRaw === 'string' ? nextRaw : null, '/mis-reservas')
  const redirectTo = `${await callbackOrigin()}/api/auth/callback?next=${encodeURIComponent(safeNext)}`
  const result = await signInWithExistingPlayerMagicLink(email.data, redirectTo)
  if (!result.ok) {
    return { status: 'error', message: 'No pudimos enviar el email. Probá de nuevo.' }
  }
  return { status: 'sent', email: email.data }
}
