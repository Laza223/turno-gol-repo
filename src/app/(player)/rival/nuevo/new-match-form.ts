import { FORMAT_OPTIONS } from '@/components/public/courtFacets'
import { RIVAL_LEVEL_LABELS } from '@/modules/rival/rival-display'
import { RIVAL_LEVELS } from '@/modules/rival/rival.schema'
import type { RivalFormResult } from '../actions'

export type CreateAction = (prev: RivalFormResult, formData: FormData) => Promise<RivalFormResult>
export type Mode = 'full' | 'rival'

export const INITIAL: RivalFormResult = { success: true }
/** Los campos del form con su error propio, en el orden en que aparecen. */
export const FIELD_ORDER = [
  'tenantId',
  'startsAt',
  'format',
  'capacity',
  'level',
  'courtDeclared',
] as const
export type Field = (typeof FIELD_ORDER)[number]
export const FIELD_IDS: Record<Field, string> = {
  tenantId: 'rival-complejo',
  startsAt: 'rival-hora',
  format: 'rival-formato',
  capacity: 'rival-cuantos-mas',
  level: 'rival-nivel',
  courtDeclared: 'rival-cancha',
}
/** Campos que la reserva fijada oculta: su error no tiene dónde pintarse y sale arriba del botón. */
export const LOCKED_FIELDS = ['tenantId', 'startsAt', 'format'] as const
export const FIELD_ERROR = 'text-[13px] leading-5 text-red-700 dark:text-red-300'
export const HELP = 'text-[13px] leading-5 text-muted-foreground'
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
export const MODE_CHIPS = [
  { value: 'full', label: 'Partido completo' },
  { value: 'rival', label: 'Mi equipo busca rival' },
]
export const MODE_HELP: Record<Mode, string> = {
  full: 'Armás el partido y le pasás el link a tu grupo.',
  rival: 'Tu equipo ya está: buscás con quién jugar.',
}
/** Mismo molde que un chip de `ChipGroup` (píldora de 44 px): "Otra hora" es uno más del grupo. */
export const CHIP_BUTTON =
  'inline-flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border border-border bg-card px-4 text-sm font-medium tabular-nums text-foreground transition-colors duration-150 hover:border-input focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background'
export const CHIP_BUTTON_ON =
  'border-primary bg-primary font-semibold text-primary-foreground hover:border-primary'
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
