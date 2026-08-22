import type PgBoss from 'pg-boss'
import { eq, sql as drizzleSql } from 'drizzle-orm'
import { tenants } from '@/shared/db/schema'
import { getWorkerSql, getWorkerDb } from '@/shared/db/client'
import { refreshMpAccessToken } from '@/modules/payments/mp-oauth'
import { encrypt } from '@/lib/crypto/encrypt'
import { TenantMpNotConnectedError } from '@/modules/payments/payment.errors'
import { CRON_WORK_OPTIONS, QUEUE_REFRESH_MP_TOKENS } from '../definitions'
import { logger } from '@/shared/lib/logger'

type RefreshOutcome = 'refreshed' | 'skipped'

/**
 * Proactively refresh every connected tenant's MP access token (Hallazgo 4).
 *
 * Vigencia real del access token: **180 días**, no ~6 h como decía este
 * comentario. MEDIDO contra producción el 2026-08-22 — el log
 * `mp oauth: token emitido` (`api/mp/callback/route.ts`) trae
 * `expiresInDays: 180`, y coincide con lo que documenta MercadoPago. El cron
 * cada 4 h se deja igual: es barato, mantiene el `refresh_token` circulando
 * (MercadoPago lo rota y es de un solo uso) y sirve de sonda temprana —
 * si las credenciales de la aplicación dejan de servir, se entera en horas y
 * no en meses. Lo que cambia es la expectativa: un token que no se refresca
 * NO se cae al rato, aguanta medio año. Per-tenant failures are logged and
 * skipped so one bad tenant doesn't block the rest.
 *
 * OJO con el filtro de `status` de abajo: un complejo en `canceled` queda
 * fuera del barrido y su token no se renueva nunca más. Con 180 días de
 * vigencia no es urgente, pero es real (`complejo titi` está así hoy).
 *
 * Concurrency safety (B11/T2): each tenant's refresh runs inside a transaction
 * that first attempts `pg_try_advisory_xact_lock(hashtext('mp_refresh:'||id))`.
 * If two worker processes (or a manual run overlapping the schedule) hit the
 * same tenant, only one acquires the lock and calls MP; the others observe
 * `locked = false` and skip without calling MP. The lock auto-releases at tx
 * end, so the next 4h pass refreshes normally. The MP fetch + DB update happen
 * inline (not via `refreshTenantMpToken`) so they share the lock-holding tx.
 */
export async function runRefreshMpTokens(): Promise<void> {
  // Pool worker (BYPASSRLS): el barrido es cross-tenant. Hoy `tenants` no tiene
  // RLS, así que el pool de la app también leería — pero el día que la tenga,
  // este SELECT devolvería cero filas en silencio y ningún token se refrescaría.
  const sql = getWorkerSql()
  const rows = await sql<{ id: string }[]>`
    SELECT id
    FROM tenants
    WHERE mp_refresh_token IS NOT NULL
      AND status IN ('active', 'trialing', 'past_due', 'suspended')
  `

  const db = getWorkerDb()
  let refreshed = 0
  let skippedLocked = 0
  for (const row of rows) {
    try {
      const outcome = await db.transaction(async (tx): Promise<RefreshOutcome> => {
        const lockKey = `mp_refresh:${row.id}`
        const lockRows = (await tx.execute(
          drizzleSql`SELECT pg_try_advisory_xact_lock(hashtext(${lockKey})) AS locked`,
        )) as unknown as Array<{ locked: boolean }>
        if (!lockRows[0]?.locked) return 'skipped'

        const tenantRows = await tx
          .select({ mpRefreshToken: tenants.mpRefreshToken })
          .from(tenants)
          .where(eq(tenants.id, row.id))
          .limit(1)
        const encryptedRefresh = tenantRows[0]?.mpRefreshToken
        if (!encryptedRefresh) throw new TenantMpNotConnectedError(row.id)

        const fresh = await refreshMpAccessToken(encryptedRefresh)
        await tx
          .update(tenants)
          .set({
            mpAccessToken: encrypt(fresh.accessToken),
            mpRefreshToken: encrypt(fresh.refreshToken),
            ...(fresh.userId ? { mpUserId: fresh.userId } : {}),
            ...(fresh.publicKey ? { mpPublicKey: fresh.publicKey } : {}),
            mpConnectedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(tenants.id, row.id))
        return 'refreshed'
      })
      if (outcome === 'refreshed') refreshed += 1
      else skippedLocked += 1
    } catch (err) {
      logger.error('tenant token refresh failed', {
        module: 'refresh-mp-tokens',
        tenantId: row.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (rows.length > 0) {
    logger.info('refreshed mp tokens', {
      module: 'refresh-mp-tokens',
      refreshed,
      skipped_locked: skippedLocked,
      total: rows.length,
    })
  }
}

export async function registerRefreshMpTokensWorker(boss: PgBoss): Promise<void> {
  // Every 4 hours.
  await boss.schedule(QUEUE_REFRESH_MP_TOKENS, '0 */4 * * *', {})
  await boss.work(QUEUE_REFRESH_MP_TOKENS, CRON_WORK_OPTIONS, async () => {
    await runRefreshMpTokens()
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_REFRESH_MP_TOKENS })
}
