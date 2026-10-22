import type PgBoss from 'pg-boss'
import { eq, sql as drizzleSql } from 'drizzle-orm'
import { tenants } from '@/shared/db/schema'
import { getWorkerSql, getWorkerDb } from '@/shared/db/client'
import { refreshMpAccessToken, type MpRefreshedTokens } from '@/modules/payments/mp-oauth'
import { encrypt } from '@/lib/crypto/encrypt'
import { MpGrantRevokedError, TenantMpNotConnectedError } from '@/modules/payments/payment.errors'
import { markMpDisconnected } from '@/modules/payments/mp-connection.service'
import { CRON_WORK_OPTIONS, QUEUE_REFRESH_MP_TOKENS } from '../definitions'
import { logger } from '@/shared/lib/logger'
import { captureMessage } from '@/lib/sentry'

/**
 * `revoked`: MP dijo que el permiso ya no existe. Se DEVUELVE en vez de tirar
 * para que la marca salga después de la tx con el token que se usó; tirar
 * adentro la contaría como un fallo más del barrido.
 */
type RefreshOutcome =
  | { kind: 'refreshed' }
  | { kind: 'skipped' }
  | { kind: 'revoked'; usedRefreshToken: string; mpError: MpGrantRevokedError['mpError'] }

/**
 * Freno ante un `invalid_grant` masivo. Un refresh token está atado al par
 * (aplicación, vendedor): si cambian las credenciales de la aplicación
 * (`MP_CLIENT_ID` repuntado, Vercel y Railway desalineados), TODOS los refresh
 * fallan con el mismo código sin que ningún dueño haya revocado nada, y los
 * access tokens siguen cobrando. Marcar ahí les cortaría la seña a todos los
 * complejos con un push falso. Desde 3 revocados y más de la mitad del barrido
 * se trata como un problema de configuración: no se marca y se avisa a Sentry.
 */
const MASS_REVOKE_MIN = 3

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
 * Sonda de desconexión (migr. 100): si MP contesta `invalid_grant` o
 * `unauthorized_client`, el complejo revocó el permiso y se marca
 * `mp_disconnected_at` (aviso en Hoy + un push). Un refresh exitoso la limpia.
 * Spec: `docs/superpowers/specs/2026-10-22-aviso-mp-desconectado-design.md`.
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
  const revoked: Array<{ tenantId: string } & Extract<RefreshOutcome, { kind: 'revoked' }>> = []
  for (const row of rows) {
    try {
      const outcome = await db.transaction(async (tx): Promise<RefreshOutcome> => {
        const lockKey = `mp_refresh:${row.id}`
        const lockRows = (await tx.execute(
          drizzleSql`SELECT pg_try_advisory_xact_lock(hashtext(${lockKey})) AS locked`,
        )) as unknown as Array<{ locked: boolean }>
        if (!lockRows[0]?.locked) return { kind: 'skipped' }

        const tenantRows = await tx
          .select({ mpRefreshToken: tenants.mpRefreshToken })
          .from(tenants)
          .where(eq(tenants.id, row.id))
          .limit(1)
        const encryptedRefresh = tenantRows[0]?.mpRefreshToken
        if (!encryptedRefresh) throw new TenantMpNotConnectedError(row.id)

        let fresh: MpRefreshedTokens
        try {
          fresh = await refreshMpAccessToken(encryptedRefresh)
        } catch (err) {
          if (err instanceof MpGrantRevokedError) {
            return { kind: 'revoked', usedRefreshToken: encryptedRefresh, mpError: err.mpError }
          }
          throw err
        }
        await tx
          .update(tenants)
          .set({
            mpAccessToken: encrypt(fresh.accessToken),
            mpRefreshToken: encrypt(fresh.refreshToken),
            ...(fresh.userId ? { mpUserId: fresh.userId } : {}),
            ...(fresh.publicKey ? { mpPublicKey: fresh.publicKey } : {}),
            mpConnectedAt: new Date(),
            // Refresh exitoso = permiso vivo: cura la marca de desconexión.
            mpDisconnectedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(tenants.id, row.id))
        return { kind: 'refreshed' }
      })
      if (outcome.kind === 'refreshed') refreshed += 1
      else if (outcome.kind === 'skipped') skippedLocked += 1
      else revoked.push({ tenantId: row.id, ...outcome })
    } catch (err) {
      logger.error('tenant token refresh failed', {
        module: 'refresh-mp-tokens',
        tenantId: row.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const massRevoke = revoked.length >= MASS_REVOKE_MIN && revoked.length * 2 > rows.length
  if (massRevoke) {
    logger.error('refresh-mp-tokens: invalid_grant masivo, no se marca ningún complejo', {
      module: 'refresh-mp-tokens',
      revoked: revoked.length,
      total: rows.length,
    })
    captureMessage(
      'refresh-mp-tokens: invalid_grant masivo (¿credenciales de la app de MP?)',
      'error',
    )
  } else {
    for (const r of revoked) {
      // Fuera de la tx del candado: la marca abre la suya. Un complejo ya
      // marcado no vuelve a avisar (compare-and-set en markMpDisconnected).
      await markMpDisconnected({
        tenantId: r.tenantId,
        usedRefreshToken: r.usedRefreshToken,
        detectedBy: 'cron',
        mpError: r.mpError,
      })
    }
  }

  if (rows.length > 0) {
    logger.info('refreshed mp tokens', {
      module: 'refresh-mp-tokens',
      refreshed,
      skipped_locked: skippedLocked,
      revoked: revoked.length,
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
