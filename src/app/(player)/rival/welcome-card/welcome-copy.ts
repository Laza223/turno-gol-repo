import type { useFieldErrors } from '../use-field-errors'
import type { RivalFormResult } from '../actions'
import type { PhotoRemoveAction, PhotoUploadAction } from '@/components/rival/PlayerPhotoField'
import { RIVAL_POSITION_LABELS } from '@/modules/rival/rival-display'
import { RIVAL_ZONES } from '@/modules/rival/rival-zones'
import { RIVAL_POSITIONS } from '@/modules/rival/rival.schema'

/** Firma de la Server Action (llega por prop: importarla como valor arrastra drizzle al bundle del browser). */
export type WelcomeAction = (prev: RivalFormResult, formData: FormData) => Promise<RivalFormResult>

/** La foto opcional de la bienvenida: la actual del jugador y las dos Server Actions (por prop). */
export type WelcomePhoto = {
  url: string | null
  uploadAction: PhotoUploadAction
  removeAction: PhotoRemoveAction
}

/**
 * Qué pide la tarjeta ahora (lo decide `welcomeNeeds`): nombre y reglas (`identity`), la zona
 * (`profile`) y, además, la posición (`position`: el capitán de un equipo rival no la da).
 */
export type WelcomeNeeds = { identity: boolean; profile: boolean; position: boolean }

export type WelcomeField = 'firstName' | 'zone'
export type WelcomeFieldErrors = ReturnType<typeof useFieldErrors<WelcomeField>>

export const FIELD_ORDER: readonly WelcomeField[] = ['firstName', 'zone']
export const FIELD_IDS: Record<WelcomeField, string> = {
  firstName: 'rival-nombre',
  zone: 'rival-zona',
}

export const INITIAL: RivalFormResult = { success: true }
export const FIELD_ERROR = 'text-[13px] leading-5 text-red-700 dark:text-red-300'

export const INTRO = {
  identity: 'Para armar tu partido necesitamos tu nombre y que aceptes las reglas.',
  both: 'Para sumarte, contanos quién sos.',
  profile:
    'Elegí tu posición y tu zona. El organizador las usa para armar los equipos. Lo pedimos una sola vez.',
  /** Capitán de un equipo que pide jugar contra el partido: solo la zona; el organizador coordina, no arma equipos. */
  profileRival:
    'Elegí tu zona. El organizador la ve para coordinar el partido. Lo pedimos una sola vez.',
} as const

/** Código de conducta (spec §7). */
export const CONDUCT = [
  'Llegá a horario.',
  'Si no podés ir, bajate a tiempo.',
  'Cero violencia e insultos.',
  'Lo demás se arregla entre ustedes por WhatsApp: TurnoGol no organiza ni cobra.',
] as const

export const POSITION_OPTIONS = RIVAL_POSITIONS.map((value) => ({
  value,
  label: RIVAL_POSITION_LABELS[value],
}))
export const ZONE_OPTIONS = RIVAL_ZONES.map((z) => ({ value: z, label: z }))
