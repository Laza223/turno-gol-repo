import { z } from 'zod'

/**
 * Etiquetas de cliente (B12 / decisión de fase v2 D3, migr. 074).
 *
 * El set es CERRADO y el motivo es legal, no de UI: lo que un cliente puede
 * leer ejerciendo derecho de acceso (Ley 25.326) queda controlado en origen, y
 * nunca aparece un "chanta, no atenderle el teléfono" escrito a las 2 AM. Por
 * eso NO hay texto libre y NO hay etiquetas configurables por complejo.
 *
 * La regla que gobierna el set: **una etiqueta solo se justifica si captura
 * algo que el sistema no puede medir solo**. Por eso quedaron afuera "VIP"
 * (categoría sin consecuencia = decoración que igual es dato personal) y "Paga
 * tarde" (el sistema ya lo mide con deuda real).
 *
 * Agregar una sexta es aditivo (ALTER TYPE ... ADD VALUE + esta lista + el
 * label). Agregar texto libre NO se concede: se reabre D3 con el dueño.
 */
export const PLAYER_TAGS = [
  'gets_credit',
  'no_credit',
  'group_organizer',
  'agreed_price',
  'difficult',
] as const

export type PlayerTag = (typeof PLAYER_TAGS)[number]

/** Label en español rioplatense. El ENUM va en inglés como el resto del schema. */
export const PLAYER_TAG_LABELS: Record<PlayerTag, string> = {
  gets_credit: 'Se le fía',
  no_credit: 'No fiar',
  group_organizer: 'Organiza el grupo',
  agreed_price: 'Tiene precio acordado',
  difficult: 'Trato conflictivo',
}

/**
 * Ayuda de una línea para la ficha: por qué existe cada una, en los términos
 * del complejo. Sirve para que el staff no invente su propia semántica.
 */
export const PLAYER_TAG_HINTS: Record<PlayerTag, string> = {
  gets_credit: 'Se le puede dejar la cancha a cuenta.',
  no_credit: 'Cobrar siempre por adelantado.',
  group_organizer: 'Es quien junta al grupo y decide dónde juegan.',
  agreed_price: 'Tiene un precio hablado distinto al de la lista.',
  difficult: 'Hubo problemas de trato. Atender con cuidado.',
}

/**
 * `gets_credit` y `no_credit` son opuestos: tenerlas juntas no significa nada y
 * deja al mostrador sin saber qué hacer. Se rechaza en el borde, no se resuelve
 * en silencio eligiendo una.
 */
const EXCLUSIVE_PAIRS: ReadonlyArray<readonly [PlayerTag, PlayerTag]> = [
  ['gets_credit', 'no_credit'],
]

/** No se exporta: su único consumidor es `playerTagsSchema`, acá abajo. */
const playerTagSchema = z.enum(PLAYER_TAGS)

/**
 * Normaliza a un set: deduplica y ordena por el orden canónico de `PLAYER_TAGS`
 * (que es el de presentación), así dos guardados con las mismas etiquetas en
 * distinto orden producen la misma fila y el diff del audit log es legible.
 * El CHECK `chk_ptr_tags_unique` es la garantía de abajo; esto es la de arriba.
 */
export function normalizePlayerTags(tags: readonly PlayerTag[]): PlayerTag[] {
  const set = new Set(tags)
  return PLAYER_TAGS.filter((t) => set.has(t))
}

export const playerTagsSchema = z
  .array(playerTagSchema)
  .max(PLAYER_TAGS.length, 'Demasiadas etiquetas.')
  .transform(normalizePlayerTags)
  .refine(
    (tags) => !EXCLUSIVE_PAIRS.some(([a, b]) => tags.includes(a) && tags.includes(b)),
    { message: 'No se puede marcar "Se le fía" y "No fiar" a la vez.' },
  )
