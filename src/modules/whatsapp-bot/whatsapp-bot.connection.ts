import { and, eq } from 'drizzle-orm'
import { whatsappConnections } from '@/shared/db/schema'
import { insertAuditLog, insertSystemAuditLog } from '@/shared/db/audit'
import { withTenantContext, type Db, type DbTx } from '@/shared/db/client'
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
  hasKapsoMessageWebhook,
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
  'kapso_no_disponible' | 'numero_de_otro_complejo' | 'conexion_incompleta' | KapsoSetupError

/** Lo que Kapso pone en `error_code` al volver de un setup link fallido, en nuestro código. */
const KAPSO_SETUP_ERRORS = {
  facebook_auth_failed: 'facebook_cancelado',
  phone_verification_failed: 'numero_no_verificado',
  waba_limit_reached: 'limite_de_cuentas',
  token_exchange_failed: 'meta_fallo',
  link_expired: 'link_vencido',
  already_used: 'link_usado',
} as const

type KapsoSetupError = (typeof KAPSO_SETUP_ERRORS)[keyof typeof KAPSO_SETUP_ERRORS]

/**
 * El `error_code` de Kapso, traducido. Uno desconocido (o ninguno) es
 * `conexion_incompleta`: el query string nunca llega tal cual a la pantalla.
 */
export function connectErrorFromKapso(code: string | undefined): WhatsappConnectError {
  return code && Object.hasOwn(KAPSO_SETUP_ERRORS, code)
    ? KAPSO_SETUP_ERRORS[code as keyof typeof KAPSO_SETUP_ERRORS]
    : 'conexion_incompleta'
}

type Tenant = { id: string; name: string }

const CALLBACK_PATH = '/api/whatsapp/connect/callback'
const WEBHOOK_PATH = '/api/webhooks/whatsapp'

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
 * La primera conexión deja el asistente apagado (lo prende el dueño); al
 * reconectar, aunque sea otro número, `enabled` queda como estaba (decisión de
 * Lazar, 2026-10-22).
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
      url: new URL(WEBHOOK_PATH, appUrl).toString(),
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

/** Caídas que se arreglan volviendo a conectar el número desde Ajustes. */
export type WhatsappDisconnectCause = 'desconectado' | 'sin_acceso' | 'no_existe'

type ConnectionRef = { tenantId: string; phoneNumberId: string }

/**
 * CAS sobre el estado de la conexión + su audit, en una transacción. Compara
 * también el número: si el dueño reconectó otro en el medio, no se pisa.
 */
async function flipConnectionStatus(
  db: Db,
  conn: ConnectionRef,
  from: 'connected' | 'disconnected',
  audit: { action: string; metadata: Record<string, unknown> },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(whatsappConnections)
      .set({ status: from === 'connected' ? 'disconnected' : 'connected', updatedAt: new Date() })
      .where(
        and(
          eq(whatsappConnections.tenantId, conn.tenantId),
          eq(whatsappConnections.phoneNumberId, conn.phoneNumberId),
          eq(whatsappConnections.status, from),
        ),
      )
      .returning({ id: whatsappConnections.id })
    if (updated.length === 0) return false
    await insertSystemAuditLog(tx, {
      tenantId: conn.tenantId,
      action: audit.action,
      resourceType: 'tenant',
      resourceId: conn.tenantId,
      metadata: { phoneNumberId: conn.phoneNumberId, ...audit.metadata },
    })
    return true
  })
}

/**
 * El monitor encontró el número caído: pasa a `disconnected`, que es lo que
 * Ajustes le muestra al dueño (con "Volver a conectar") y lo que la ingesta y el
 * turno ya tratan como apagado. `db` es el pool worker. Devuelve si cambió.
 */
export function markWhatsappDisconnected(
  db: Db,
  conn: ConnectionRef,
  cause: WhatsappDisconnectCause,
): Promise<boolean> {
  return flipConnectionStatus(db, conn, 'connected', {
    action: 'whatsapp.disconnected',
    metadata: { cause },
  })
}

/**
 * Un número que el monitor había marcado caído volvió a dar sano (Meta lo
 * reconectó): vuelve a `connected` sin que el dueño entre a Ajustes. Solo si
 * nuestro webhook sigue suscrito: sin él, `connected` sería un bot mudo, y ahí
 * conviene que el dueño reconecte (eso lo vuelve a suscribir). Puede tirar
 * `KapsoPlatformError`.
 */
export async function restoreWhatsappConnection(db: Db, conn: ConnectionRef): Promise<boolean> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) return false
  const subscribed = await hasKapsoMessageWebhook({
    phoneNumberId: conn.phoneNumberId,
    url: new URL(WEBHOOK_PATH, appUrl).toString(),
  })
  if (!subscribed) return false
  return flipConnectionStatus(db, conn, 'disconnected', {
    action: 'whatsapp.reconnected',
    metadata: {},
  })
}
