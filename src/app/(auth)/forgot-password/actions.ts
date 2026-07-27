'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { enforce } from '@/shared/rate-limit/apply'
import { echoFields } from '@/shared/forms/echo'

// Respuesta SIEMPRE genérica: no revela si el email existe (§6.2).
export type ForgotState =
  | { status: 'idle' }
  | { status: 'sent' }
  | { status: 'error'; message: string; email?: string }

export async function forgotPasswordAction(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const { email: tipeado } = echoFields(formData, ['email'] as const)
  const email = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: 'Ingresá un email válido' }))
    .safeParse(formData.get('email'))
  if (!email.success) return { status: 'error', message: 'Ingresá un email válido.', email: tipeado }

  // Reusa authMagicLink (keyBy email, fail closed): un envío de reset comparte el
  // perfil de un envío de magic link.
  const rl = await enforce('authMagicLink', email.data)
  if (!rl.ok) {
    return { status: 'error', message: 'Demasiados intentos. Esperá un minuto y probá de nuevo.', email: tipeado }
  }

  const origin = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  const supabase = await createClient()
  // El template `recovery` arma la URL con token_hash + type=recovery apuntando
  // al callback; resetPasswordForEmail solo dispara el envío.
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${origin}/api/auth/callback`,
  })
  return { status: 'sent' }
}
