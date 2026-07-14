'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Cierra la sesión (jugador o staff) y redirige al home del portal.
 * Server action compartido por el menú de cuenta y cualquier botón "Salir".
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}
