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
    redirect('/login')
  }

  try {
    await anonymizePlayer(user.playerId)
  } catch (err) {
    if (err instanceof PlayerAlreadyAnonymizedError) {
      // Already anonymized — treat as success (idempotent).
    } else if (err instanceof PlayerNotFoundError) {
      return {
        success: false,
        error: 'No encontramos tu cuenta. Cerrá sesión y volvé a intentar.',
      }
    } else {
      throw err
    }
  }

  const supabase = createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  return { success: true }
}
