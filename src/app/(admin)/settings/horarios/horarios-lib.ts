// Lógica pura del form de horarios "general + excepciones"
// (pages/horarios-precios.md §2). Sin React ni DB: se testea como funciones.
//
// Modelo: un horario GENERAL (par open/close) que vale para todos los días,
// y por día un modo: 'general' (hereda), 'custom' (par propio) o 'closed'.
// La persistencia no cambia: al submit se expande a los 7 días del JSONB.

import { DAY_KEYS, type DayKey } from '@/shared/time/week-days'

export type DayMode = 'general' | 'custom' | 'closed'

export type DayView = {
  mode: DayMode
  /** Último par conocido del día — se conserva al cerrar/volver al general. */
  open: string
  close: string
}

export type ScheduleView = {
  general: { open: string; close: string }
  days: Record<DayKey, DayView>
}

/** Entrada tolerante: el JSONB puede venir incompleto (tenant recién creado). */
export type LooseOpeningHours = Partial<
  Record<DayKey, { open?: string; close?: string; closed?: boolean } | undefined>
>

const FALLBACK = { open: '08:00', close: '23:00' }

/**
 * OpeningHours guardado → vista general+excepciones.
 * El general es el par (open, close) MÁS FRECUENTE entre los días abiertos;
 * empate → el del primer día en orden lun..dom. Sin días abiertos → fallback.
 * Días con par distinto quedan en 'custom'; `closed: true` queda en 'closed'.
 */
export function deriveScheduleView(hours: LooseOpeningHours | undefined): ScheduleView {
  const normalized = DAY_KEYS.map((day) => {
    const d = hours?.[day]
    return {
      day,
      open: d?.open ?? FALLBACK.open,
      close: d?.close ?? FALLBACK.close,
      closed: d?.closed === true,
    }
  })

  // Par más frecuente entre abiertos (empate → primera aparición).
  const counts = new Map<string, number>()
  for (const d of normalized) {
    if (d.closed) continue
    const key = `${d.open}|${d.close}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let generalKey: string | null = null
  for (const d of normalized) {
    if (d.closed) continue
    const key = `${d.open}|${d.close}`
    if (generalKey === null || (counts.get(key) ?? 0) > (counts.get(generalKey) ?? 0)) {
      generalKey = key
    }
  }
  const [gOpen, gClose] = generalKey ? generalKey.split('|') : [FALLBACK.open, FALLBACK.close]
  const general = { open: gOpen!, close: gClose! }

  const days = {} as Record<DayKey, DayView>
  for (const d of normalized) {
    days[d.day] = {
      mode: d.closed
        ? 'closed'
        : d.open === general.open && d.close === general.close
          ? 'general'
          : 'custom',
      open: d.open,
      close: d.close,
    }
  }
  return { general, days }
}

/** Valores efectivos de un día para los hidden inputs del form. */
export function effectiveDay(
  view: ScheduleView,
  day: DayKey,
): { open: string; close: string; closed: boolean } {
  const d = view.days[day]
  if (d.mode === 'general') return { ...view.general, closed: false }
  return { open: d.open, close: d.close, closed: d.mode === 'closed' }
}

function toMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/**
 * ¿Algún día abierto tiene cierre <= apertura sin el flag de madrugada?
 * ('00:00' de cierre cuenta como medianoche = fin del día, igual que el schema.)
 * Dispara el hint "¿Cerrás pasada la medianoche?" antes del submit.
 */
export function needsNextDayHint(view: ScheduleView, closesNextDay: boolean): boolean {
  if (closesNextDay) return false
  return DAY_KEYS.some((day) => {
    const e = effectiveDay(view, day)
    if (e.closed) return false
    const closeMins = toMins(e.close) === 0 ? 24 * 60 : toMins(e.close)
    return closeMins <= toMins(e.open)
  })
}
