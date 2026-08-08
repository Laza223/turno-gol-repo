import { after } from 'next/server'
import { getWorkerDb } from '@/shared/db/client'
import { analyticsEvents } from '@/shared/db/schema'
import { logger } from '@/shared/lib/logger'

/**
 * Destino durable de `track.*` (ver `./breadcrumbs`). **Solo servidor.**
 *
 * El breadcrumb de Sentry sigue existiendo y sirve para depurar un error: es el
 * rastro de lo que pasó ANTES de la excepción. Lo que no puede hacer es medir,
 * porque un breadcrumb solo se transmite adjunto a un evento de error — si el
 * flujo termina bien, nadie lo ve. Este módulo es la otra mitad.
 *
 * `breadcrumbs.ts` NO importa este archivo: se importa desde componentes
 * cliente y arrastrar el driver de Postgres al bundle del navegador rompería el
 * build. La conexión se hace al revés, registrando `recordEvent` como sink
 * desde `instrumentation.ts` y desde `run-workers.ts`.
 */

/**
 * Claves que NUNCA se persisten. Criterio: identificadores DIRECTOS de una
 * persona o de su dispositivo.
 *
 * `bookingId`/`courtId`/`paymentId` no están en la lista y es deliberado: son
 * identificadores de recursos del complejo, no de personas, y sin cruzarlos
 * contra otra tabla no identifican a nadie. Sirven para depurar un embudo raro.
 *
 * `endpoint` sí está: es la URL de la suscripción push, o sea un identificador
 * estable de dispositivo.
 *
 * Mantener esta lista chica y explícita es lo que sostiene la afirmación de la
 * migr. 072 de que `analytics_events` no es dato personal. Antes de agregar una
 * clave nueva a cualquier `*Ctx` de `breadcrumbs.ts`, preguntarse si identifica
 * a una persona; si la respuesta es "sí" o "no sé", va acá.
 */
export const PII_KEYS = new Set(['playerId', 'staffUserId', 'endpoint'])

/** Descarta las claves PII y los `undefined` (que solo ensucian el jsonb). */
export function scrub(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (PII_KEYS.has(k) || v === undefined) continue
    out[k] = v
  }
  return out
}

type EventRow = {
  category: string
  event: string
  tenantId: string | null
  data: Record<string, unknown>
}

/**
 * Escribe con el pool BYPASSRLS a propósito. `track.*` se llama desde adentro
 * de servicios que ya corren en su propia transacción con `SET LOCAL`, pero
 * este INSERT usa OTRA conexión, sin ese contexto: con el pool restringido, la
 * policy de INSERT rechazaría toda fila que lleve `tenant_id`. Analytics es
 * infraestructura del sistema, no del complejo — el mismo caso para el que
 * existe `getWorkerDb`.
 *
 * Nunca propaga: una falla de instrumentación no puede voltear un cobro. Si el
 * pool worker no está configurado, se pierde el evento y queda el warn.
 */
async function persist(row: EventRow): Promise<void> {
  try {
    await getWorkerDb().insert(analyticsEvents).values({
      category: row.category,
      event: row.event,
      tenantId: row.tenantId,
      data: row.data,
    })
  } catch (err) {
    logger.warn('analytics event no persistido', {
      module: 'analytics',
      category: row.category,
      event: row.event,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * `after()` corre el callback DESPUÉS de que la respuesta salió, así que el
 * INSERT no le suma latencia a nadie.
 *
 * Fuera de un request tira `Error: after() was called outside a request scope`
 * — es el caso de los workers de pg-boss, que son un proceso Node aparte sin
 * ciclo de request. Ahí el fire-and-forget alcanza: no hay usuario esperando y
 * el proceso es de larga vida, así que la promesa no se corta a mitad como sí
 * pasaría en una función serverless.
 */
function schedule(row: EventRow): void {
  try {
    after(() => void persist(row))
  } catch {
    void persist(row)
  }
}

/**
 * Sink de `track.*`. Sincrónico y a prueba de todo: si algo falla acá, el flujo
 * de negocio no se entera.
 */
export function recordEvent(
  category: string,
  event: string,
  data: Record<string, unknown>,
): void {
  try {
    const tenantId = typeof data.tenantId === 'string' ? data.tenantId : null
    schedule({ category, event, tenantId, data: scrub(data) })
  } catch {
    // Sin log: si ni siquiera se pudo armar la fila, loguear puede fallar igual.
  }
}
