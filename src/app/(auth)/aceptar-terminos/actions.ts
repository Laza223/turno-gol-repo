'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { acceptPlayerTerms } from '@/modules/players/player.service'
import { sanitizeNext } from '@/lib/safe-redirect'
import { playerSuccessIntent, successVerifyPath } from '@/lib/auth-success'
import { CURRENT_TERMS_VERSION } from '@/shared/terms'

export type AcceptTermsState = { status: 'idle' } | { status: 'error'; message: string }

const schema = z.object({
  terms: z.literal('on', { error: 'Tenés que aceptar los términos.' }),
})

/**
 * Consentimiento diferido: solo se llega acá cuando el callback detectó
 * `hasAgreedTerms=false` (Google vía /ingresar, sin el checkbox de LoginGate).
 * Server Action en vez de simplemente redirigir con GET: escribe en `players`.
 */
export async function acceptTermsAction(
  _prev: AcceptTermsState,
  formData: FormData,
): Promise<AcceptTermsState> {
  const parsed = schema.safeParse({ terms: formData.get('terms') })
  const nextRaw = formData.get('next')
  const safeNext = sanitizeNext(typeof nextRaw === 'string' ? nextRaw : null)

  const user = await extractAuthUser()
  if (!user || user.type !== 'player') redirect('/ingresar')

  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Tenés que aceptar los términos.',
    }
  }

  await acceptPlayerTerms(user.playerId, CURRENT_TERMS_VERSION)

  const intent = playerSuccessIntent(safeNext, true)
  redirect(successVerifyPath(safeNext, intent))
}
