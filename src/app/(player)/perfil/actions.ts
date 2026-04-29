'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { players } from '@/shared/db/schema'

const profileSchema = z.object({
  first_name: z.string().min(1, 'Nombre requerido').max(100),
  last_name: z.string().min(1, 'Apellido requerido').max(100),
  phone: z.string().min(6).max(30).optional(),
  preferred_area: z.string().max(100).optional(),
})

export async function updateProfileAction(formData: FormData): Promise<void> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') redirect('/login')

  const raw = {
    first_name: formData.get('first_name') as string,
    last_name: formData.get('last_name') as string,
    phone: (formData.get('phone') as string) || undefined,
    preferred_area: (formData.get('preferred_area') as string) || undefined,
  }

  const parsed = profileSchema.safeParse(raw)
  if (!parsed.success) return

  await withPlayerContext(user.playerId, (tx) =>
    tx
      .update(players)
      .set({
        firstName: parsed.data.first_name,
        lastName: parsed.data.last_name,
        phone: parsed.data.phone ?? null,
        preferredArea: parsed.data.preferred_area ?? null,
      })
      .where(eq(players.id, user.playerId)),
  )

  revalidatePath('/perfil')
}
