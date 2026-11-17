import { and, eq, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { withPlayerContext } from '@/shared/db/client'
import { playerPushSubscriptions } from '@/shared/db/schema'
import type { pushSubscriptionSchema } from './push-subscription.schema'

/**
 * Alta o renovación del dispositivo del jugador (migr. 114). Mismo criterio que
 * `savePushSubscription` del staff: un endpoint existente solo se renueva para
 * el mismo jugador, nunca se reasigna a ciegas (RLS lo esconde y el UPDATE no
 * procede; el caller lo trata como "pertenece a otra sesión").
 */
export async function savePlayerPushSubscription(
  playerId: string,
  input: z.infer<typeof pushSubscriptionSchema>,
): Promise<string | null> {
  return withPlayerContext(playerId, async (tx) => {
    const [row] = await tx
      .insert(playerPushSubscriptions)
      .values({
        playerId,
        endpoint: input.endpoint,
        p256dhKey: input.keys.p256dh,
        authKey: input.keys.auth,
        userAgent: input.userAgent ?? null,
      })
      .onConflictDoUpdate({
        target: playerPushSubscriptions.endpoint,
        set: {
          p256dhKey: input.keys.p256dh,
          authKey: input.keys.auth,
          userAgent: input.userAgent ?? null,
          lastUsedAt: sql`now()`,
        },
        setWhere: eq(playerPushSubscriptions.playerId, playerId),
      })
      .returning({ id: playerPushSubscriptions.id })
    return row?.id ?? null
  })
}

export async function deletePlayerPushSubscription(playerId: string, endpoint: string) {
  return withPlayerContext(playerId, (tx) =>
    tx
      .delete(playerPushSubscriptions)
      .where(
        and(
          eq(playerPushSubscriptions.playerId, playerId),
          eq(playerPushSubscriptions.endpoint, endpoint),
        ),
      )
      .returning({ id: playerPushSubscriptions.id }),
  )
}
