import { useMemo, useSyncExternalStore } from 'react'
import { signupDraftSchema, type SignupDraft } from '@/modules/onboarding/signup-draft.schema'

/**
 * Borrador del alta pública en `localStorage` (clave `tg_signup_draft`). Guarda las
 * respuestas del complejo y el celular; NUNCA la contraseña ni el mail: esos viajan
 * una sola vez, en el submit. Se lee de /register y de /register/finalizar (la vuelta
 * de Google), así que sobrevive a la redirección de OAuth.
 */
const KEY = 'tg_signup_draft'

export type SignupDraftData = Partial<SignupDraft>

// Si el storage no anda (modo privado), el borrador vive en memoria durante la pestaña.
let memoryRaw: string | null = null
const listeners = new Set<() => void>()

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY) ?? memoryRaw
  } catch {
    return memoryRaw
  }
}

function writeRaw(raw: string | null): void {
  memoryRaw = raw
  try {
    if (raw === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, raw)
  } catch {
    // storage lleno o bloqueado: queda en memoria
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

/**
 * El storage es input no confiable (otra versión, edición a mano): cada bloque se
 * valida por separado y el que no pasa se descarta, sin tirar abajo a los demás.
 */
function parseSignupDraft(raw: string | null): SignupDraftData {
  if (!raw) return {}
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof json !== 'object' || json === null) return {}
  const source = json as Record<string, unknown>
  const shape = signupDraftSchema.shape
  const out: SignupDraftData = {}
  const complex = shape.complex.safeParse(source.complex)
  if (complex.success) out.complex = complex.data
  const courts = shape.courts.safeParse(source.courts)
  if (courts.success) out.courts = courts.data
  const schedule = shape.schedule.safeParse(source.schedule)
  if (schedule.success) out.schedule = schedule.data
  const prices = shape.prices.safeParse(source.prices)
  if (prices.success) out.prices = prices.data
  const profile = shape.profile.safeParse(source.profile)
  if (profile.success) out.profile = profile.data
  const phone = shape.phone.safeParse(source.phone)
  if (phone.success) out.phone = phone.data
  const referralCode = shape.referralCode.safeParse(source.referralCode)
  if (referralCode.success && referralCode.data !== undefined) out.referralCode = referralCode.data
  return out
}

export function patchSignupDraft(patch: SignupDraftData): void {
  writeRaw(JSON.stringify({ ...parseSignupDraft(readRaw()), ...patch }))
}

export function clearSignupDraft(): void {
  writeRaw(null)
}

/**
 * `ready` es false en el servidor y durante la hidratación: ahí todavía no se puede
 * leer el storage, y pintar el borrador antes de tiempo rompería la hidratación.
 */
export function useSignupDraft(): { ready: boolean; draft: SignupDraftData } {
  const raw = useSyncExternalStore(subscribe, readRaw, () => undefined)
  const draft = useMemo(() => parseSignupDraft(raw ?? null), [raw])
  return { ready: raw !== undefined, draft }
}

export type SignupScreen =
  'complejo' | 'canchas' | 'horarios' | 'precios' | 'tu-complejo' | 'cuenta'

/** Orden de las pantallas y a cuál de los 4 tramos de la barra pertenece cada una. */
export const SIGNUP_SCREENS: readonly { id: SignupScreen; segment: 0 | 1 | 2 | 3 }[] = [
  { id: 'complejo', segment: 0 },
  { id: 'canchas', segment: 1 },
  { id: 'horarios', segment: 2 },
  { id: 'precios', segment: 2 },
  { id: 'tu-complejo', segment: 3 },
  { id: 'cuenta', segment: 3 },
]

export const SIGNUP_SEGMENTS = [
  'Tu complejo',
  'Canchas',
  'Horarios y precios',
  'Último paso',
] as const

/**
 * Primera pantalla con respuestas pendientes: de ahí retoma quien vuelve con un
 * borrador. Los precios cuentan como pendientes si no cubren los formatos de las
 * canchas (cambió la cantidad después de ponerlos).
 */
export function firstIncompleteScreen(draft: SignupDraftData): SignupScreen {
  if (!draft.complex) return 'complejo'
  if (!draft.courts) return 'canchas'
  if (!draft.schedule) return 'horarios'
  const courts = draft.courts
  const priced = draft.prices?.formats ?? []
  const pricesMatch =
    priced.length === Object.keys(courts).length &&
    priced.every((row) => courts[String(row.format)] === row.count)
  if (!pricesMatch) return 'precios'
  if (!draft.profile) return 'tu-complejo'
  return 'cuenta'
}
