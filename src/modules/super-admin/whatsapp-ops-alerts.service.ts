import { eq } from 'drizzle-orm'
import type { Db } from '@/shared/db/client'
import { tenants, whatsappConnections } from '@/shared/db/schema'
import { isFeatureEnabled } from '@/shared/feature-flags'
import { logger } from '@/shared/lib/logger'
import { artDateOf } from '@/shared/time/art-date'
import {
  getKapsoPhoneNumber,
  getKapsoPhoneNumberHealth,
  KapsoPlatformError,
  type KapsoNumberHealth,
} from '@/lib/kapso/platform'
import {
  BOT_FEATURE_FLAG,
  markWhatsappDisconnected,
  restoreWhatsappConnection,
  type WhatsappDisconnectCause,
} from '@/modules/whatsapp-bot/whatsapp-bot.connection'
import { artHourKey, sendOpsAlerts, type OpsAlert } from './ops-alerts.service'
import {
  countBotErrorPaused,
  countInboundBacklog,
  getMonthMessageTotal,
  KAPSO_PLAN_MONTHLY_MESSAGES,
} from './whatsapp-monitor.service'

/**
 * Alertas por mail al dueño sobre el bot de WhatsApp (cron `whatsapp-ops-alerts`,
 * cada 5 min). Sin datos personales: conteos y, en el número caído, el nombre
 * del complejo.
 *
 * El envío y el dedupe por clave (`ops_alerts`, migr. 097) son del canal de ops:
 * `ops-alerts.service.ts`. Diseño del número caído:
 * docs/superpowers/specs/2026-10-23-whatsapp-desconectado-design.md.
 */

const KAPSO_WARN_RATIO = 0.8
/** Un entrante sin procesar de hace más que esto ya es una cola trabada, no un turno lento. */
const BACKLOG_ALERT_MINUTES = 5

type OpsSnapshot = { now: Date; monthTotal: number; backlog: number; botErrorPaused: number }

/** Qué alertas corresponden a esta foto. Pura: el dedupe y el envío van aparte. */
export function pickOpsAlerts(s: OpsSnapshot): OpsAlert[] {
  const alerts: OpsAlert[] = []
  const month = artDateOf(s.now).slice(0, 7)
  const limit = KAPSO_PLAN_MONTHLY_MESSAGES

  if (s.monthTotal >= limit) {
    alerts.push({
      key: `kapso-100:${month}`,
      subject: 'Bot de WhatsApp: se alcanzó el límite de mensajes del mes',
      lines: [
        `Este mes ya van ${s.monthTotal} mensajes y el plan de Kapso incluye ${limit}.`,
        'A partir de acá el bot puede dejar de enviar o recibir mensajes. Conviene pasar al plan Pro.',
      ],
    })
  } else if (s.monthTotal >= limit * KAPSO_WARN_RATIO) {
    alerts.push({
      key: `kapso-80:${month}`,
      subject: 'Bot de WhatsApp: llegó al 80% de los mensajes del mes',
      lines: [
        `Este mes ya van ${s.monthTotal} de ${limit} mensajes del plan de Kapso.`,
        'El conteo es aproximado (sale de nuestros registros, Kapso no lo informa).',
      ],
    })
  }

  if (s.backlog > 0) {
    alerts.push({
      key: `backlog:${artHourKey(s.now)}`,
      subject: 'Bot de WhatsApp: hay mensajes sin contestar',
      lines: [
        `Hay ${s.backlog} mensajes de jugadores sin procesar hace más de ${BACKLOG_ALERT_MINUTES} minutos.`,
        'Puede ser que el worker esté caído o que falte una clave del bot.',
      ],
    })
  }

  if (s.botErrorPaused > 0) {
    alerts.push({
      key: `bot-error:${artHourKey(s.now)}`,
      subject: 'Bot de WhatsApp: el bot falló y pausó conversaciones',
      lines: [
        `Hay ${s.botErrorPaused} conversaciones pausadas porque el bot tuvo un error.`,
        'Mientras estén pausadas, las atiende una persona del complejo.',
      ],
    })
  }

  return alerts
}

type NumberDownCause = WhatsappDisconnectCause | 'bloqueado' | 'otro'

type NumberVerdict =
  { kind: 'ok' | 'degraded' | 'unknown' } | { kind: 'down'; cause: NumberDownCause }

/**
 * Qué le pasa al número según Kapso. `null` es un 404: Kapso ya no lo tiene.
 * Los checks se miran antes que el `status` general: no se confía en que Kapso
 * los refleje siempre ahí. `degraded` (por ejemplo, el nombre visible sin
 * aprobar) no es caído: el bot sigue contestando dentro de la ventana de 24 h.
 */
export function classifyNumberHealth(h: KapsoNumberHealth | null): NumberVerdict {
  if (!h) return { kind: 'down', cause: 'no_existe' }
  if (h.connection === 'DISCONNECTED') return { kind: 'down', cause: 'desconectado' }
  if (h.accessOk === false) return { kind: 'down', cause: 'sin_acceso' }
  if (h.messaging === 'BLOCKED') return { kind: 'down', cause: 'bloqueado' }
  if (h.status === 'unhealthy') return { kind: 'down', cause: 'otro' }
  if (h.status === 'error') return { kind: 'unknown' }
  return { kind: h.status === 'degraded' ? 'degraded' : 'ok' }
}

const RECONNECT_FIX = 'Hay que volver a conectar el número desde Ajustes > Asistente de WhatsApp.'

const DOWN_COPY: Record<NumberDownCause, { short: string; what: string; fix: string }> = {
  desconectado: {
    short: 'el número se desconectó',
    what: 'El número se desconectó de WhatsApp.',
    fix: RECONNECT_FIX,
  },
  sin_acceso: {
    short: 'Kapso perdió el acceso al número',
    what: 'Kapso perdió el acceso al número: el permiso de Meta venció o se revocó.',
    fix: RECONNECT_FIX,
  },
  no_existe: {
    short: 'Kapso ya no tiene el número',
    what: 'Kapso ya no tiene el número: lo sacaron del proyecto o Meta lo dio de baja.',
    fix: RECONNECT_FIX,
  },
  bloqueado: {
    short: 'Meta frenó los envíos',
    what: 'Meta frenó los envíos del número: puede ser el saldo de Kapso, el medio de pago o una restricción de la cuenta.',
    fix: 'Revisá el saldo de Kapso y la cuenta en Meta.',
  },
  otro: {
    short: 'el número tiene un problema',
    what: 'El número tiene un problema. El detalle está en Kapso.',
    fix: 'Revisá el número en el panel de Kapso.',
  },
}

/** Bloqueado u otro no se arreglan reconectando: la conexión queda como está. */
function isDisconnectCause(cause: NumberDownCause): cause is WhatsappDisconnectCause {
  return cause === 'desconectado' || cause === 'sin_acceso' || cause === 'no_existe'
}

function numberDownAlert(
  n: { tenantId: string; tenantName: string; enabled: boolean },
  cause: NumberDownCause,
  now: Date,
): OpsAlert {
  const copy = DOWN_COPY[cause]
  return {
    key: `wa-numero-caido:${n.tenantId}:${artDateOf(now)}`,
    subject: `WhatsApp de ${n.tenantName}: ${copy.short}`,
    lines: [
      copy.what,
      n.enabled
        ? 'El asistente está prendido: sus clientes no reciben respuesta.'
        : 'El asistente está apagado, así que hoy no se nota.',
      copy.fix,
    ],
  }
}

type BlindReason = 'sin_clave' | 'clave' | 'forma'

const BLIND_LINE: Record<BlindReason, string> = {
  sin_clave: 'Falta KAPSO_API_KEY en el worker.',
  clave:
    'Kapso rechazó la clave (KAPSO_API_KEY). Con la clave rechazada el bot tampoco puede mandar mensajes.',
  forma: 'Kapso devolvió una respuesta que no entendemos: puede que haya cambiado el formato.',
}

/** Sin esto, un monitor que no puede mirar quedaría callado igual que uno que no encuentra nada. */
function blindAlert(reason: BlindReason, now: Date): OpsAlert {
  return {
    key: `kapso-health:${artDateOf(now)}`,
    subject: 'No pudimos revisar los números de WhatsApp',
    lines: [
      BLIND_LINE[reason],
      'Mientras tanto no nos enteramos si se cae el número de algún complejo.',
    ],
  }
}

/** Menos de 5 por segundo: el límite de Kapso para el health es 5/s y 60/min por proyecto. */
const HEALTH_PAUSE_MS = 250

type NumberToCheck = Awaited<ReturnType<typeof listNumbersToCheck>>[number]

async function listNumbersToCheck(db: Db) {
  return db
    .select({
      tenantId: whatsappConnections.tenantId,
      tenantName: tenants.name,
      phoneNumberId: whatsappConnections.phoneNumberId,
      status: whatsappConnections.status,
      enabled: whatsappConnections.enabled,
    })
    .from(whatsappConnections)
    .innerJoin(tenants, eq(tenants.id, whatsappConnections.tenantId))
}

/**
 * Consulta la salud de cada número con TurnoGol Plus (con el asistente prendido
 * o no: un número caído es un bot mudo el día que lo prendan) y arma los mails.
 * Además mueve el estado de la conexión: caído por desconexión, acceso o 404 →
 * `disconnected`; un `disconnected` que vuelve a dar sano → `connected`.
 *
 * Un error de Kapso no es un número caído: se loguea y el próximo tick reintenta.
 * Las excepciones son la clave rechazada y una respuesta ilegible, que dejan al
 * monitor ciego para todos los números: cortan el tick y avisan una vez por día.
 */
async function checkNumbersHealth(db: Db, now: Date): Promise<OpsAlert[]> {
  const all = await listNumbersToCheck(db)
  const plus = await Promise.all(all.map((n) => isFeatureEnabled(BOT_FEATURE_FLAG, n.tenantId)))
  const numbers = all.filter((_, i) => plus[i])
  if (numbers.length === 0) return []
  if (!process.env.KAPSO_API_KEY) return [blindAlert('sin_clave', now)]

  const alerts: OpsAlert[] = []
  for (const [i, n] of numbers.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, HEALTH_PAUSE_MS))
    const log = { module: 'super-admin', tenantId: n.tenantId, phoneNumberId: n.phoneNumberId }
    let health: KapsoNumberHealth | null
    try {
      health = await getKapsoPhoneNumberHealth(n.phoneNumberId)
      // Un 404 del health es "Kapso ya no lo tiene" solo si el número tampoco
      // aparece. Si aparece, cambió la API: desconectar callaría a todos los bots.
      if (!health && (await getKapsoPhoneNumber(n.phoneNumberId))) {
        return [...alerts, blindAlert('forma', now)]
      }
    } catch (err) {
      if (!(err instanceof KapsoPlatformError)) throw err
      if (err.status === 401 || err.status === 403) return [...alerts, blindAlert('clave', now)]
      if (err.status >= 200 && err.status < 300) return [...alerts, blindAlert('forma', now)]
      logger.warn('whatsapp: falló la consulta de salud a Kapso', {
        ...log,
        status: err.status,
        error: err.message,
      })
      // 429: el límite es por proyecto, seguir solo suma rechazos. El próximo tick sigue.
      if (err.status === 429) return alerts
      continue
    }

    const verdict = classifyNumberHealth(health)
    if (verdict.kind === 'down') alerts.push(numberDownAlert(n, verdict.cause, now))
    if (verdict.kind === 'unknown') logger.warn('whatsapp: Kapso no pudo revisar el número', log)
    if (verdict.kind === 'degraded') {
      logger.info('whatsapp: número degradado', { ...log, failing: health?.failingChecks })
    }
    // Aparte: si falla la escritura del estado, el mail de este número y el del
    // resto del tick salen igual.
    try {
      await syncConnectionStatus(db, n, verdict, log)
    } catch (err) {
      logger.error('whatsapp: no se pudo actualizar el estado de la conexión', {
        ...log,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return alerts
}

/**
 * Caído por desconexión, acceso o 404 → `disconnected`; un `disconnected` que
 * vuelve a dar sano → `connected`. `n.status` es la foto del principio del
 * tick: el CAS de cada lado es el que evita pisar una reconexión del dueño.
 */
async function syncConnectionStatus(
  db: Db,
  n: NumberToCheck,
  verdict: NumberVerdict,
  log: Record<string, unknown>,
): Promise<void> {
  if (verdict.kind === 'down') {
    const { cause } = verdict
    if (
      n.status === 'connected' &&
      isDisconnectCause(cause) &&
      (await markWhatsappDisconnected(db, n, cause))
    ) {
      logger.warn('whatsapp: número caído, se marca desconectado', { ...log, cause })
    }
    return
  }
  if (verdict.kind === 'unknown') return
  if (n.status === 'disconnected' && (await restoreWhatsappConnection(db, n))) {
    logger.info('whatsapp: el número volvió, se marca conectado', log)
  }
}

/** Un tick del cron. `db` es el pool worker: tablas cross-tenant y `ops_alerts` deny-all. */
export async function runWhatsappOpsAlerts(db: Db, now: Date = new Date()): Promise<void> {
  const link = { path: '/super-admin/whatsapp', label: 'Abrir el monitor del bot' }
  const [monthTotal, backlog, botErrorPaused] = await Promise.all([
    getMonthMessageTotal(db, now),
    countInboundBacklog(db, BACKLOG_ALERT_MINUTES),
    countBotErrorPaused(db),
  ])
  // 100% y 80% en el mismo tick ya se resolvieron en `pickOpsAlerts`: un solo mail.
  await sendOpsAlerts(db, pickOpsAlerts({ now, monthTotal, backlog, botErrorPaused }), link)
  // Después de las de conteo: si Kapso tarda o falla, esas ya salieron.
  await sendOpsAlerts(db, await checkNumbersHealth(db, now), link)
}
