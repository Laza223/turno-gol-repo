import { and, eq, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { withTenantContext } from '@/shared/db/client'
import { pushSubscriptions } from '@/shared/db/schema'
import type { pushSubscriptionSchema } from './push-subscription.schema'

/** Un endpoint existente sólo se renueva para su misma identidad; nunca se reasigna a ciegas. */
export async function savePushSubscription(
  tenantId: string,
  staffUserId: string,
  input: z.infer<typeof pushSubscriptionSchema>,
): Promise<string | null> {
  return withTenantContext(tenantId, async (tx) => {
    const [row] = await tx
      .insert(pushSubscriptions)
      .values({
        tenantId,
        staffUserId,
        endpoint: input.endpoint,
        p256dhKey: input.keys.p256dh,
        authKey: input.keys.auth,
        userAgent: input.userAgent ?? null,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          p256dhKey: input.keys.p256dh,
          authKey: input.keys.auth,
          userAgent: input.userAgent ?? null,
          lastUsedAt: sql`now()`,
        },
        setWhere: and(
          eq(pushSubscriptions.tenantId, tenantId),
          eq(pushSubscriptions.staffUserId, staffUserId),
        ),
      })
      .returning({ id: pushSubscriptions.id })
    return row?.id ?? null
  })
}

export async function findOwnPushSubscription(
  tenantId: string,
  staffUserId: string,
  subscriptionId: string,
) {
  return withTenantContext(tenantId, async (tx) => {
    const [row] = await tx
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.id, subscriptionId),
          eq(pushSubscriptions.tenantId, tenantId),
          eq(pushSubscriptions.staffUserId, staffUserId),
        ),
      )
      .limit(1)
    return row?.id ?? null
  })
}

export async function deletePushSubscription(
  tenantId: string,
  staffUserId: string,
  endpoint: string,
) {
  return withTenantContext(tenantId, (tx) =>
    tx
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.tenantId, tenantId),
          eq(pushSubscriptions.staffUserId, staffUserId),
          eq(pushSubscriptions.endpoint, endpoint),
        ),
      )
      .returning({ id: pushSubscriptions.id }),
  )
}
