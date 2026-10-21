import { eq } from 'drizzle-orm'
import { whatsappConnections } from '@/shared/db/schema'
import { withTenantContext, type DbTx } from '@/shared/db/client'
import { isFeatureEnabled } from '@/shared/feature-flags'

/** Flag global en `false` (migración 096); se prende por complejo con un override. */
export const BOT_FEATURE_FLAG = 'whatsapp_bot'

export type WhatsappConnectionView = {
  displayPhoneNumber: string | null
  connected: boolean
  enabled: boolean
}

/**
 * La conexión de WhatsApp del complejo, o null si no tiene el asistente: sin
 * fila (nunca se conectó) o con el flag `whatsapp_bot` apagado para él. El
 * panel solo muestra la sección cuando esto no es null.
 *
 * El flag se lee ANTES de abrir la transacción: su loader abre otra, y anidadas
 * cada render retiene dos conexiones de un pool web de 3.
 */
export async function getWhatsappConnection(
  tenantId: string,
): Promise<WhatsappConnectionView | null> {
  if (!(await isFeatureEnabled(BOT_FEATURE_FLAG, tenantId))) return null
  const [row] = await withTenantContext(tenantId, (tx) =>
    tx
      .select({
        displayPhoneNumber: whatsappConnections.displayPhoneNumber,
        status: whatsappConnections.status,
        enabled: whatsappConnections.enabled,
      })
      .from(whatsappConnections)
      .where(eq(whatsappConnections.tenantId, tenantId))
      .limit(1),
  )
  if (!row) return null
  return {
    displayPhoneNumber: row.displayPhoneNumber,
    connected: row.status === 'connected',
    enabled: row.enabled,
  }
}

/** Prende o apaga el asistente. Devuelve false si el complejo no tiene conexión. */
export async function setWhatsappBotEnabled(
  tenantId: string,
  enabled: boolean,
  tx: DbTx,
): Promise<boolean> {
  const updated = await tx
    .update(whatsappConnections)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(whatsappConnections.tenantId, tenantId))
    .returning({ id: whatsappConnections.id })
  return updated.length > 0
}
