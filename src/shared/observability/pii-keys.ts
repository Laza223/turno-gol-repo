/**
 * Claves que NUNCA salen del proceso. Criterio: identificadores DIRECTOS de una
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
 * clave nueva a cualquier `*Ctx` de `./breadcrumbs`, preguntarse si identifica a
 * una persona; si la respuesta es "sí" o "no sé", va acá.
 *
 * Vive en su propio módulo, y no en `./analytics`, porque los DOS destinos de
 * `track.*` la necesitan y `./breadcrumbs` no puede importar `./analytics`: eso
 * arrastraría el driver de Postgres al bundle del navegador. Acá no hay
 * dependencias, así que sirve en los cuatro runtimes.
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
