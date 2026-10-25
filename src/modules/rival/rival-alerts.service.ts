import { and, asc, eq } from 'drizzle-orm'
import { publicTenantVisibilityConds } from '@/modules/tenants/search.service'
import { withPlayerContext, type DbTx } from '@/shared/db/client'
import { rivalAlertSubscriptions, tenants } from '@/shared/db/schema'
import { verifyAlertUnsubToken } from '@/shared/security/rival-alert-token'
import { uuid } from '@/shared/validation/primitives'
import { mapRivalDbError, RivalError } from './rival.errors'

/**
 * Suscripciones a las alertas "hay partido en [complejo]" (spec §5.8). Corren en
 * `withPlayerContext`: la RLS `rival_alert_subscriptions_own` deja tocar solo las del jugador, y
 * además cada query filtra por `player_id` (la RLS no es la única barrera). A diferencia de
 * `rival.service.ts`, la baja por token NO tiene sesión: el token firmado dice de quién es la
 * suscripción, y se opera con ese jugador como contexto.
 */

async function inPlayerContext<T>(playerId: string, fn: (tx: DbTx) => Promise<T>): Promise<T> {
  try {
    return await withPlayerContext(playerId, fn)
  } catch (err) {
    throw mapRivalDbError(err) ?? err
  }
}

/** Token válido Y con ids que son uuid: el token es nuestro, pero igual no se lo pasa crudo a la base. */
function parseToken(token: string): { playerId: string; tenantId: string } | null {
  const fields = verifyAlertUnsubToken(token)
  if (!fields) return null
  if (!uuid.safeParse(fields.playerId).success || !uuid.safeParse(fields.tenantId).success) {
    return null
  }
  return fields
}

/** Alta (o cambio de "solo si buscan arquero") de la alerta de un complejo. Una por jugador+complejo. */
export async function subscribeAlert(
  playerId: string,
  input: { tenantId: string; onlyGoalkeeper: boolean },
): Promise<void> {
  await inPlayerContext(playerId, async (tx) => {
    // Mismo filtro de visibilidad que `createMatch`: nada de alertas de complejos que un jugador
    // no podría encontrar.
    const [tenant] = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(and(eq(tenants.id, input.tenantId), ...publicTenantVisibilityConds()))
      .limit(1)
    if (!tenant) throw new RivalError('rival_tenant_unavailable')

    await tx
      .insert(rivalAlertSubscriptions)
      .values({ playerId, tenantId: input.tenantId, onlyGoalkeeper: input.onlyGoalkeeper })
      .onConflictDoUpdate({
        target: [rivalAlertSubscriptions.playerId, rivalAlertSubscriptions.tenantId],
        set: { onlyGoalkeeper: input.onlyGoalkeeper },
      })
  })
}

/** Baja desde la sesión (el jugador sale del contexto, no de un token). Idempotente. */
export async function unsubscribeAlert(playerId: string, tenantId: string): Promise<void> {
  await inPlayerContext(playerId, (tx) =>
    tx
      .delete(rivalAlertSubscriptions)
      .where(
        and(
          eq(rivalAlertSubscriptions.playerId, playerId),
          eq(rivalAlertSubscriptions.tenantId, tenantId),
        ),
      ),
  )
}

/** Las alertas del jugador, por nombre de complejo. */
export async function listMyAlerts(
  playerId: string,
): Promise<{ tenantId: string; tenantName: string; onlyGoalkeeper: boolean }[]> {
  return inPlayerContext(playerId, (tx) =>
    tx
      .select({
        tenantId: rivalAlertSubscriptions.tenantId,
        tenantName: tenants.name,
        onlyGoalkeeper: rivalAlertSubscriptions.onlyGoalkeeper,
      })
      .from(rivalAlertSubscriptions)
      .innerJoin(tenants, eq(tenants.id, rivalAlertSubscriptions.tenantId))
      .where(eq(rivalAlertSubscriptions.playerId, playerId))
      .orderBy(asc(tenants.name)),
  )
}

/**
 * GET de la página de baja: muestra a qué complejo corresponde el link, sin borrar nada (los
 * escáneres de mail abren los links). `null` si el token no es válido o la suscripción ya no existe.
 */
export async function peekAlertUnsub(token: string): Promise<{ tenantName: string } | null> {
  const fields = parseToken(token)
  if (!fields) return null
  const rows = await inPlayerContext(fields.playerId, (tx) =>
    tx
      .select({ tenantName: tenants.name })
      .from(rivalAlertSubscriptions)
      .innerJoin(tenants, eq(tenants.id, rivalAlertSubscriptions.tenantId))
      .where(
        and(
          eq(rivalAlertSubscriptions.playerId, fields.playerId),
          eq(rivalAlertSubscriptions.tenantId, fields.tenantId),
        ),
      )
      .limit(1),
  )
  return rows[0] ?? null
}

/**
 * POST de la baja. Idempotente: un token válido da `ok: true` aunque la suscripción ya no exista
 * (así la pantalla no revela si existía); uno inválido da `ok: false`.
 */
export async function unsubscribeByToken(token: string): Promise<{ ok: boolean }> {
  const fields = parseToken(token)
  if (!fields) return { ok: false }
  await inPlayerContext(fields.playerId, (tx) =>
    tx
      .delete(rivalAlertSubscriptions)
      .where(
        and(
          eq(rivalAlertSubscriptions.playerId, fields.playerId),
          eq(rivalAlertSubscriptions.tenantId, fields.tenantId),
        ),
      ),
  )
  return { ok: true }
}
