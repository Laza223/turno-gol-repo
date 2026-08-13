'use server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { IMPERSONATION_COOKIE_NAME } from '@/shared/security/impersonation-cookie'

/**
 * También limpia la cookie de impersonación (security scan F16) — mismo
 * motivo que `@/modules/auth/sign-out.action.ts`: este es el sign-out que usa
 * el layout de admin Y el de super-admin, así que un system admin que sale
 * por acá en vez de "Salir de impersonación" no debe dejar la cookie viva.
 */
export async function signOutAction(): Promise<never> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  ;(await cookies()).delete(IMPERSONATION_COOKIE_NAME)
  redirect('/login')
}
