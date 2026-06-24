'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import {
  anonymizePlayer,
  PlayerAlreadyAnonymizedError,
  PlayerNotFoundError,
} from '@/modules/players/player.anonymization'
import { createClient } from '@/lib/supabase/server'

export type DeleteAccountResult = { success: true } | { success: false; error: string }

export async function requestDeleteAccountAction(): Promise<DeleteAccountResult> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') {
    redirect('/ingresar')
  }

  try {
    await anonymizePlayer(user.playerId)
  } catch (err) {
    if (err instanceof PlayerAlreadyAnonymizedError) {
      // Account was already anonymized (e.g. double-tab). Sign out and redirect
      // with the same deleted=1 param so the login page shows the farewell message.
      if (process.env.NEXT_PUBLIC_E2E !== '1') {
        const supabase = createClient()
        await supabase.auth.signOut()
      }
      redirect('/ingresar?deleted=1')
    } else if (err instanceof PlayerNotFoundError) {
      return {
        success: false,
        error: 'No encontramos tu cuenta. Cerrá sesión y volvé a intentar.',
      }
    } else {
      throw err
    }
  }

  // Sign out the deleted user so their session cookies become unusable.
  // SKIPPED in E2E because all player tests share one playerStorageState file
  // generated once in globalSetup — a real signOut invalidates that file's
  // refresh_token globally and every subsequent player spec ends up
  // redirected to /ingresar. The router.push('/ingresar?deleted=1') in
  // DeleteAccountForm still navigates the UI; the SQL anonymize already ran.
  if (process.env.NEXT_PUBLIC_E2E !== '1') {
    const supabase = createClient()
    await supabase.auth.signOut()
  }
  revalidatePath('/', 'layout')
  return { success: true }
}
