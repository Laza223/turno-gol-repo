import { z } from 'zod'

/** HH:MM en formato 24h (00:00–23:59). */
export const TIME_HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export const WEEK_DAYS = [
  { key: 'mon', label: 'Lunes' },
  { key: 'tue', label: 'Martes' },
  { key: 'wed', label: 'Miércoles' },
  { key: 'thu', label: 'Jueves' },
  { key: 'fri', label: 'Viernes' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
] as const

export type WeekDayKey = (typeof WEEK_DAYS)[number]['key']

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Minutos de apertura desde medianoche. */
export function openMinutes(hhmm: string): number {
  return toMinutes(hhmm)
}

/**
 * Minutos de cierre desde medianoche. '00:00' de cierre se interpreta como fin
 * del día (24:00 = 1440), igual que generateSlots, para que "cierra a medianoche"
 * sea un horario válido.
 */
export function closeMinutes(hhmm: string): number {
  const m = toMinutes(hhmm)
  return m === 0 ? 24 * 60 : m
}

/**
 * Regla del BLOCKER (triage_fixes #4): el cierre debe ser estrictamente
 * posterior a la apertura. Si close <= open, generateSlots produce CERO slots y
 * la cancha queda silenciosamente no disponible para reservar online.
 */
export function isValidDayRange(open: string, close: string): boolean {
  return closeMinutes(close) > openMinutes(open)
}

const hhmmField = z.string().regex(TIME_HHMM_RE, 'Formato HH:MM')

export const horariosDaySchema = z.object({
  open: hhmmField,
  close: hhmmField,
})

/**
 * Schema de los 7 días de apertura/cierre. Además del formato HH:MM por campo,
 * valida que cada día tenga cierre posterior a la apertura (BLOCKER #4) con un
 * mensaje que identifica el día.
 */
export const horariosSchema = z
  .object({
    mon: horariosDaySchema,
    tue: horariosDaySchema,
    wed: horariosDaySchema,
    thu: horariosDaySchema,
    fri: horariosDaySchema,
    sat: horariosDaySchema,
    sun: horariosDaySchema,
  })
  .superRefine((days, ctx) => {
    for (const { key, label } of WEEK_DAYS) {
      const day = days[key]
      if (!isValidDayRange(day.open, day.close)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key, 'close'],
          message: `${label}: el horario de cierre debe ser posterior al de apertura.`,
        })
      }
    }
  })

export type HorariosInput = z.infer<typeof horariosSchema>
