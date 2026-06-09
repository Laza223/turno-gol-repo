'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { signInWithMagicLink } from '@/modules/auth/auth.service'
import { enforce } from '@/shared/rate-limit/apply'

const schema = z.object({ email: z.string().trim().toLowerCase().email() })

export type LoginState =
  | { status: 'idle' }
  | { status: 'sent'; email: string }
  | { status: 'error'; message: string }

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({ email: formData.get('email') })
  if (!parsed.success) {
    return { status: 'error', message: 'Email inválido.' }
  }

  const rl = await enforce('authMagicLink', parsed.data.email)
  if (!rl.ok) {
    return {
      status: 'error',
      message: 'Demasiados intentos. Probá de nuevo en un minuto.',
    }
  }

  const origin =
    headers().get('origin') ??
    process.env.NEXT_PUBLIC_APP_URL ??
    ''
  const result = await signInWithMagicLink(
    parsed.data.email,
    `${origin}/api/auth/callback`,
  )
  if (!result.ok) {
    return { status: 'error', message: 'No pudimos enviar el email. Probá de nuevo.' }
  }
  return { status: 'sent', email: parsed.data.email }
}
