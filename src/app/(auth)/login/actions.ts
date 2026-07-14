'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  provisionAndRouteStaff,
  signInWithPassword,
} from '@/modules/auth/auth.service'
import { MIN_PASSWORD_LENGTH } from '@/modules/auth/password'
import { enforce } from '@/shared/rate-limit/apply'

const GENERIC = 'Email o contraseña incorrectos.'

const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(MIN_PASSWORD_LENGTH),
})

// El éxito redirige (throw NEXT_REDIRECT), por eso no hay estado 'sent' como en
// magic link: idle | error. `unconfirmedEmail` habilita el reenvío de confirmación.
export type LoginState =
  | { status: 'idle' }
  | { status: 'error'; message: string; unconfirmedEmail?: string }

async function callbackOrigin(): Promise<string> {
  return (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  // Respuesta genérica también ante zod inválido: no revela qué campo falló ni si
  // el email existe (§6.2).
  if (!parsed.success) return { status: 'error', message: GENERIC }

  const rl = await enforce('authPassword', parsed.data.email)
  if (!rl.ok) {
    return {
      status: 'error',
      message: 'Demasiados intentos. Esperá unos minutos y probá de nuevo.',
    }
  }

  const result = await signInWithPassword(parsed.data.email, parsed.data.password)
  if (!result.ok) {
    if (result.code === 'email_not_confirmed') {
      return {
        status: 'error',
        message: 'Tenés que confirmar tu email antes de entrar.',
        unconfirmedEmail: parsed.data.email,
      }
    }
    return { status: 'error', message: GENERIC }
  }

  // Un jugador (passwordless por diseño) puede haber fijado una password vía
  // "olvidé mi contraseña" (ese flujo no filtra por tipo de cuenta) e intentar
  // entrar por acá. provisionAndRouteStaff no chequea is_player: sin este
  // corte crearía una fila espuria en staff_users (audit_report.md 3-10).
  // Mismo criterio que extractRealAuthUser (auth.middleware.ts).
  const meta = result.user.app_metadata ?? {}
  const userMeta = result.user.user_metadata ?? {}
  if (meta.is_player === true || userMeta.is_player === true) {
    await (await createClient()).auth.signOut()
    return { status: 'error', message: GENERIC }
  }

  // Cambio forzado (contraseña temporal del SuperAdmin): atajo que evita un render
  // del layout. El enforcement real vive también en el layout admin (R8).
  if (result.user.app_metadata?.force_password_change === true) {
    redirect('/reset-password')
  }

  const { path } = await provisionAndRouteStaff(result.user)
  redirect(path)
}

// ── Reenvío de confirmación de alta (caso email no confirmado) ──────────────

export type ResendState =
  | { status: 'idle' }
  | { status: 'sent' }
  | { status: 'error'; message: string }

export async function resendConfirmationAction(
  _prev: ResendState,
  formData: FormData,
): Promise<ResendState> {
  const email = z.string().trim().toLowerCase().pipe(z.email()).safeParse(formData.get('email'))
  if (!email.success) return { status: 'error', message: 'Email inválido.' }

  const rl = await enforce('authMagicLink', email.data)
  if (!rl.ok) {
    return { status: 'error', message: 'Demasiados intentos. Esperá un minuto.' }
  }

  const supabase = await createClient()
  await supabase.auth.resend({
    type: 'signup',
    email: email.data,
    options: { emailRedirectTo: `${await callbackOrigin()}/api/auth/callback` },
  })
  // Respuesta genérica: confirma siempre, exista o no la cuenta.
  return { status: 'sent' }
}
