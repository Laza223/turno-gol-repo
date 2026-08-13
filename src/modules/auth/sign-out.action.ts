'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { IMPERSONATION_COOKIE_NAME } from '@/shared/security/impersonation-cookie'

/**
 * Cierra la sesión (jugador o staff) y redirige al home del portal.
 * Server action compartido por el menú de cuenta y cualquier botón "Salir".
 *
 * También limpia la cookie de impersonación (security scan F16): antes solo
 * la acción explícita "Salir de impersonación" la borraba, así que un system
 * admin que cerraba sesión con este botón genérico (ej. en una máquina
 * compartida) dejaba la cookie firmada viva hasta su propio TTL — cualquier
 * otra persona que iniciara sesión en ese mismo navegador quedaba con sus
 * audit logs re-atribuidos al system admin. `delete()` es un no-op inocuo
 * cuando no había impersonación en curso.
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  ;(await cookies()).delete(IMPERSONATION_COOKIE_NAME)
  redirect('/')
}
