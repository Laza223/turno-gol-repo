import { eq } from 'drizzle-orm'
import { whatsappConnections } from '@/shared/db/schema'
import { insertAuditLog } from '@/shared/db/audit'
import { withTenantContext, type DbTx } from '@/shared/db/client'
import { isFeatureEnabled } from '@/shared/feature-flags'
import { isUniqueViolation } from '@/shared/db/pg-errors'
import { logger } from '@/shared/lib/logger'
import {
  KapsoPlatformError,
  createKapsoSetupLink,
  ensureKapsoMessageWebhook,
  findKapsoCustomer,
  findOrCreateKapsoCustomer,
  getKapsoPhoneNumber,
  listKapsoPhoneNumbers,
} from '@/lib/kapso/platform'

/** Flag global en `false` (migración 096); se prende por complejo con un override. */
export const BOT_FEATURE_FLAG = 'whatsapp_bot'

export type WhatsappConnectionView = {
  displayPhoneNumber: string | null
  connected: boolean
  enabled: boolean
}

/**
 * Estado del asistente de WhatsApp de un complejo: `null` si no tiene TurnoGol
 * Plus (flag `whatsapp_bot` apagado para él); si lo tiene, la conexión, que es
 * null mientras nunca conectó su número. El panel muestra la sección siempre que
 * esto no sea null.
 *
 * El flag se lee ANTES de abrir la transacción: su loader abre otra, y anidadas
 * cada render retiene dos conexiones de un pool web de 3.
 */
export async function getWhatsappPlusState(
  tenantId: string,
): Promise<{ connection: WhatsappConnectionView | null } | null> {
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
  if (!row) return { connection: null }
  return {
    connection: {
      displayPhoneNumber: row.displayPhoneNumber,
      connected: row.status === 'connected',
      enabled: row.enabled,
    },
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

export type WhatsappConnectError =
  'kapso_no_disponible' | 'numero_de_otro_complejo' | 'conexion_incompleta'

type Tenant = { id: string; name: string }

const CALLBACK_PATH = '/api/whatsapp/connect/callback'

/** Un fallo de Kapso (caído, timeout, sin configurar) es "no disponible"; lo demás es un bug. */
function kapsoDown(
  tenantId: string,
  step: string,
  err: unknown,
): { ok: false; error: 'kapso_no_disponible' } {
  if (!(err instanceof KapsoPlatformError)) throw err
  logger.error('whatsapp connect: Kapso falló', {
    module: 'whatsapp-connect',
    tenantId,
    step,
    status: err.status,
    error: err.message,
  })
  return { ok: false, error: 'kapso_no_disponible' }
}

/** Link de Kapso para que el dueño conecte su número (coexistencia). */
export async function startWhatsappConnect(
  tenant: Tenant,
): Promise<{ ok: true; url: string } | { ok: false; error: 'kapso_no_disponible' }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    logger.error('whatsapp connect: falta NEXT_PUBLIC_APP_URL', {
      module: 'whatsapp-connect',
      tenantId: tenant.id,
    })
    return { ok: false, error: 'kapso_no_disponible' }
  }
  const successUrl = new URL(CALLBACK_PATH, appUrl)
  const failureUrl = new URL(CALLBACK_PATH, appUrl)
  failureUrl.searchParams.set('fallo', '1')

  try {
    const customer = await findOrCreateKapsoCustomer({ externalId: tenant.id, name: tenant.name })
    const link = await createKapsoSetupLink(customer.id, {
      successUrl: successUrl.toString(),
      failureUrl: failureUrl.toString(),
    })
    return { ok: true, url: link.url }
  } catch (err) {
    return kapsoDown(tenant.id, 'start', err)
  }
}

/**
 * Registra el número que el dueño acaba de conectar: verifica que sea de SU
 * cliente de Kapso y en coexistencia, suscribe el webhook y recién ahí guarda la
 * fila (con el webhook caído, una fila `connected` sería un bot mudo sin aviso).
 * El asistente queda apagado: lo prende el dueño.
 *
 * El audit `whatsapp.connected` va en la misma transacción que la fila: lo dejan
 * igual el callback de Kapso y el "Ya lo conecté".
 */
export async function registerWhatsappConnection(
  tenant: Tenant,
  phoneNumberId: string,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: WhatsappConnectError }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const secret = process.env.KAPSO_WEBHOOK_SECRET
  if (!appUrl || !secret) {
    logger.error('whatsapp connect: falta NEXT_PUBLIC_APP_URL o KAPSO_WEBHOOK_SECRET', {
      module: 'whatsapp-connect',
      tenantId: tenant.id,
    })
    return { ok: false, error: 'kapso_no_disponible' }
  }

  let number: Awaited<ReturnType<typeof getKapsoPhoneNumber>>
  try {
    const customer = await findKapsoCustomer(tenant.id)
    if (!customer) return { ok: false, error: 'conexion_incompleta' }
    number = await getKapsoPhoneNumber(phoneNumberId)
    if (!number || number.customerId !== customer.id || !number.isCoexistence) {
      return { ok: false, error: 'conexion_incompleta' }
    }
    await ensureKapsoMessageWebhook({
      phoneNumberId: number.phoneNumberId,
      url: new URL('/api/webhooks/whatsapp', appUrl).toString(),
      secret,
    })
  } catch (err) {
    return kapsoDown(tenant.id, 'register', err)
  }

  try {
    await withTenantContext(tenant.id, async (tx) => {
      await tx
        .insert(whatsappConnections)
        .values({
          tenantId: tenant.id,
          provider: 'kapso',
          phoneNumberId: number.phoneNumberId,
          wabaId: number.businessAccountId,
          displayPhoneNumber: number.displayPhoneNumber,
          status: 'connected',
          enabled: false,
        })
        .onConflictDoUpdate({
          target: whatsappConnections.tenantId,
          set: {
            phoneNumberId: number.phoneNumberId,
            wabaId: number.businessAccountId,
            displayPhoneNumber: number.displayPhoneNumber,
            status: 'connected',
            updatedAt: new Date(),
          },
        })
      await insertAuditLog(tx, {
        tenantId: tenant.id,
        actorId,
        actorType: 'staff',
        action: 'whatsapp.connected',
        resourceType: 'tenant',
        resourceId: tenant.id,
        metadata: { phoneNumberId: number.phoneNumberId },
      })
    })
  } catch (err) {
    if (isUniqueViolation(err, 'phone_number_id')) {
      logger.error('whatsapp connect: el número ya es de otro complejo', {
        module: 'whatsapp-connect',
        tenantId: tenant.id,
        phoneNumberId: number.phoneNumberId,
      })
      return { ok: false, error: 'numero_de_otro_complejo' }
    }
    throw err
  }
  return { ok: true }
}

/** "Ya lo conecté": busca el número coexistente del complejo en Kapso y lo registra. */
export async function findAndRegisterWhatsappConnection(
  tenant: Tenant,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: WhatsappConnectError }> {
  let phoneNumberId: string | undefined
  try {
    const customer = await findKapsoCustomer(tenant.id)
    if (!customer) return { ok: false, error: 'conexion_incompleta' }
    phoneNumberId = (await listKapsoPhoneNumbers(customer.id)).find(
      (n) => n.isCoexistence,
    )?.phoneNumberId
  } catch (err) {
    return kapsoDown(tenant.id, 'find', err)
  }
  if (!phoneNumberId) return { ok: false, error: 'conexion_incompleta' }
  return registerWhatsappConnection(tenant, phoneNumberId, actorId)
}
