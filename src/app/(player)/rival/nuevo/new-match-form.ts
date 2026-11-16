import { FORMAT_OPTIONS } from '@/components/public/courtFacets'
import { RIVAL_LEVEL_LABELS } from '@/modules/rival/rival-display'
import { RIVAL_LEVELS } from '@/modules/rival/rival.schema'
import type { NewMatchIntent } from '@/modules/rival/rival-form'
import type { RivalFormResult } from '../actions'

export type CreateAction = (prev: RivalFormResult, formData: FormData) => Promise<RivalFormResult>

/** Prefijo de los ids del WhatsApp (`BoardFields`): el hook enfoca el campo con error por su id. */
export const BOARD_ID_PREFIX = 'rival-nuevo'

export const INITIAL: RivalFormResult = { success: true }
/** Los campos del form con su error propio, en el orden en que aparecen. */
export const FIELD_ORDER = [
  'intent',
  'missing',
  'tenantId',
  'startsAt',
  'format',
  'capacity',
  'level',
  'courtDeclared',
  'whatsapp',
  'whatsappConsent',
] as const
export type Field = (typeof FIELD_ORDER)[number]
export const FIELD_IDS: Record<Field, string> = {
  intent: 'rival-necesito',
  missing: 'rival-faltan',
  whatsapp: `${BOARD_ID_PREFIX}-whatsapp`,
  whatsappConsent: `${BOARD_ID_PREFIX}-consent`,
  tenantId: 'rival-complejo',
  startsAt: 'rival-hora',
  format: 'rival-formato',
  capacity: 'rival-cuantos-mas',
  level: 'rival-nivel',
  courtDeclared: 'rival-cancha',
}
/** Campos que la reserva fijada oculta: su error no tiene dónde pintarse y sale arriba del botón. */
export const LOCKED_FIELDS = ['tenantId', 'startsAt', 'format'] as const
export const FIELD_ERROR = 'text-sm font-semibold text-portal-bad'
export const HELP = 'rv-small text-portal-soft'
/** Crear NO es idempotente: si la respuesta se perdió, el partido pudo haberse armado igual. */
export const UNCONFIRMED =
  'No pudimos confirmar si se armó el partido. Mirá en Mis partidos antes de volver a intentar.'
// Solo el número, bajo el título "Fútbol de": 8 chips en 2 filas de 4, sin esconder ninguno.
export const FORMAT_CHIPS = FORMAT_OPTIONS.map((f) => ({ value: String(f), label: String(f) }))
export const LEVEL_CHIPS = RIVAL_LEVELS.map((l) => ({ value: l, label: RIVAL_LEVEL_LABELS[l] }))
export const LEVEL_HELP: Record<string, string> = {
  tranqui: 'Para pasarla bien, sin drama.',
  parejo: 'Se juega en serio, sin pasarse.',
  picante: 'Se juega a ganar.',
}
/** Paso 1: lo que el usuario necesita. Las dos primeras salen al tablón al crear. */
export const INTENT_OPTIONS: { value: NewMatchIntent; title: string; help: string }[] = [
  { value: 'players', title: 'Me faltan jugadores', help: 'Sale al tablón y se suman.' },
  { value: 'rival', title: 'Busco rival', help: 'Tu equipo está completo.' },
  { value: 'group', title: 'Solo para mi grupo', help: 'Le pasás el link por WhatsApp.' },
]
export const MIN_CAPACITY = 2
export const MAX_CAPACITY = 22

/** Los errores por campo de la respuesta: `fieldErrors`, o el primero (`field`) si no los trae. */
export function reportedErrors(error: Extract<RivalFormResult, { success: false }> | null) {
  const out: Partial<Record<Field, string>> = {}
  for (const f of FIELD_ORDER) {
    const message = error?.fieldErrors?.[f] ?? (error?.field === f ? error.error : undefined)
    if (message) out[f] = message
  }
  return out
}
