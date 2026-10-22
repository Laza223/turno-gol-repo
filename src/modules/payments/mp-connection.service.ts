import { and, eq, isNull } from 'drizzle-orm'
import { tenants } from '@/shared/db/schema'
import { withTenantContext } from '@/shared/db/client'
import { insertSystemAuditLog } from '@/shared/db/audit'
import { notifyAdminPush } from '@/modules/notifications/push.service'
import { logger } from '@/shared/lib/logger'
import { captureException } from '@/lib/sentry'
import type { MpGrantRevokedError } from './payment.errors'

/** Qué camino comprobó que el permiso de MP ya no sirve. Va al audit log. */
export type MpDisconnectDetectedBy = 'webhook' | 'refresh_on_401' | 'cron'

/**
 * Espera antes del compare-and-set. Con dos refresh del mismo token, el que
 * gana ya lo consumió en MP pero puede no haber commiteado el nuevo: el que
 * pierde recibe `invalid_grant` y, sin esta espera, su CAS todavía ve el token
 * viejo y marca (push y audit falsos). Un segundo alcanza para que el ganador
 * persista, y este camino solo corre cuando un refresh ya falló.
 */
const MARK_RECHECK_DELAY_MS = 1_000

/**
 * Marca al complejo como "MercadoPago desconectado" (`tenants.mp_disconnected_at`).
 *
 * Se llama SOLO cuando un refresh respondió `invalid_grant` o
 * `unauthorized_client` (`MpGrantRevokedError`): el evento de desautorización
 * de MP es un disparador de esa comprobación, nunca la prueba. Spec:
 * `docs/superpowers/specs/2026-10-22-aviso-mp-desconectado-design.md`.
 *
 * Compare-and-set con dos condiciones:
 *   - `mp_refresh_token = usedRefreshToken`: si otro refresh ganó la carrera y
 *     rotó el token, el `invalid_grant` de este es del token viejo y no dice
 *     nada del permiso. No se marca.
 *   - `mp_disconnected_at IS NULL`: la segunda detección no re-marca ni vuelve
 *     a avisar.
 *
 * Los tokens NO se tocan: la marca es reversible y la limpia el próximo
 * refresh exitoso, la reconexión o el "Desconectar".
 *
 * El push sale después del commit y una sola vez por transición. Nunca tira:
 * corre en caminos de error (el refresh ya falló) y un fallo acá no puede tapar
 * el error original. Devuelve `true` si esta llamada hizo la transición.
 */
export async function markMpDisconnected(input: {
  tenantId: string
  /** El refresh token CIFRADO, tal como estaba en la fila al pedir el refresh. */
  usedRefreshToken: string
  detectedBy: MpDisconnectDetectedBy
  mpError: MpGrantRevokedError['mpError']
}): Promise<boolean> {
  const { tenantId, usedRefreshToken, detectedBy, mpError } = input
  await new Promise((resolve) => setTimeout(resolve, MARK_RECHECK_DELAY_MS))
  const at = new Date()

  let marked: boolean
  try {
    marked = await withTenantContext(tenantId, async (tx) => {
      const rows = await tx
        .update(tenants)
        .set({ mpDisconnectedAt: at, updatedAt: at })
        .where(
          and(
            eq(tenants.id, tenantId),
            eq(tenants.mpRefreshToken, usedRefreshToken),
            isNull(tenants.mpDisconnectedAt),
          ),
        )
        .returning({ id: tenants.id })
      if (rows.length === 0) return false

      // Qué lo detectó y qué dijo MP. Nunca tokens.
      await insertSystemAuditLog(tx, {
        tenantId,
        action: 'tenant.mp_disconnected_detected',
        resourceType: 'tenant',
        resourceId: tenantId,
        metadata: { detected_by: detectedBy, mp_error: mpError },
      })
      return true
    })
  } catch (err) {
    logger.error('mp: no se pudo marcar el complejo como desconectado', {
      module: 'mp-connection',
      tenantId,
      detectedBy,
      error: err instanceof Error ? err.message : String(err),
    })
    captureException(err)
    return false
  }

  if (!marked) return false

  // `warn` y no `info`: es un complejo que dejó de poder cobrar señas.
  logger.warn('mp: complejo marcado como desconectado', {
    module: 'mp-connection',
    tenantId,
    detectedBy,
    mpError,
  })

  try {
    await notifyAdminPush(tenantId, {
      type: 'mp_disconnected',
      url: '/dashboard',
      // Insumo de la dedupeKey (push.service): un instante por transición, así
      // un reintento del job de push no duplica el aviso.
      disconnectedAt: at.toISOString(),
    })
  } catch (err) {
    // El aviso en Hoy ya quedó: el push es un extra.
    logger.error('mp: falló el push de desconexión', {
      module: 'mp-connection',
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
  return true
}
