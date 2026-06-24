'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { players } from '@/shared/db/schema'
import { captureException } from '@/lib/sentry'

const profileSchema = z.object({
  first_name: z.string().min(1, 'Nombre requerido').max(100),
  last_name: z.string().min(1, 'Apellido requerido').max(100),
  phone: z.string().min(6).max(30).optional(),
  preferred_area: z.string().max(100).optional(),
})

export type UpdateProfileResult = { success: true } | { success: false; error: string }

export async function updateProfileAction(
  _prevState: UpdateProfileResult,
  formData: FormData,
): Promise<UpdateProfileResult> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') redirect('/ingresar')

  const raw = {
    first_name: formData.get('first_name') as string,
    last_name: formData.get('last_name') as string,
    phone: (formData.get('phone') as string) || undefined,
    preferred_area: (formData.get('preferred_area') as string) || undefined,
  }

  const parsed = profileSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  // #37: sin try/catch, un fallo de DB (timeout/conexion perdida) se propagaba
  // como uncaught server error al cliente, sin mensaje amigable ni reporte.
  let updated: { id: string }[]
  try {
    updated = await withPlayerContext(user.playerId, (tx) =>
      tx
        .update(players)
        .set({
          firstName: parsed.data.first_name,
          lastName: parsed.data.last_name,
          phone: parsed.data.phone ?? null,
          preferredArea: parsed.data.preferred_area ?? null,
        })
        .where(eq(players.id, user.playerId))
        .returning({ id: players.id }),
    )
  } catch (err) {
    captureException(err)
    return { success: false, error: 'No pudimos guardar tus cambios. Intentá de nuevo.' }
  }

  // #38: si el playerId no existe, el UPDATE no afecta filas. Sin este chequeo la
  // action devolvia success:true dando un feedback de exito falso.
  if (updated.length === 0) {
    return { success: false, error: 'No encontramos tu perfil.' }
  }

  revalidatePath('/perfil')
  return { success: true }
}

const prefSchema = z.object({
  pref: z.enum(['email', 'push']),
  enabled: z.boolean(),
})

export type UpdatePrefResult = { success: true } | { success: false; error: string }

/**
 * Persiste un toggle de notificación del jugador (players.notify_email /
 * notify_push). Server Action directa — sin endpoint — llamada desde los
 * switches de /perfil?tab=notificaciones.
 */
export async function updateNotificationPrefAction(
  pref: 'email' | 'push',
  enabled: boolean,
): Promise<UpdatePrefResult> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') redirect('/ingresar')

  const parsed = prefSchema.safeParse({ pref, enabled })
  if (!parsed.success) {
    return { success: false, error: 'Preferencia inválida.' }
  }

  let updated: { id: string }[]
  try {
    updated = await withPlayerContext(user.playerId, (tx) =>
      tx
        .update(players)
        .set(
          parsed.data.pref === 'email'
            ? { notifyEmail: parsed.data.enabled }
            : { notifyPush: parsed.data.enabled },
        )
        .where(eq(players.id, user.playerId))
        .returning({ id: players.id }),
    )
  } catch (err) {
    captureException(err)
    return { success: false, error: 'No pudimos guardar tu preferencia. Intentá de nuevo.' }
  }

  if (updated.length === 0) {
    return { success: false, error: 'No encontramos tu perfil.' }
  }

  revalidatePath('/perfil')
  return { success: true }
}
