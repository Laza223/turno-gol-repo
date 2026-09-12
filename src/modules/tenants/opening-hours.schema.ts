import { z } from 'zod'
import { effectiveCloseMins } from '@/shared/time/operating-day'

/** HH:MM en formato 24h (00:00–23:59). */
const TIME_HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const WEEK_DAYS = [
  { key: 'mon', label: 'Lunes' },
  { key: 'tue', label: 'Martes' },
  { key: 'wed', label: 'Miércoles' },
  { key: 'thu', label: 'Jueves' },
  { key: 'fri', label: 'Viernes' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
] as const

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
 *
 * Día operativo: con `closesNextDay`, un cierre <= apertura (ej. 08:00→02:00) se
 * interpreta como la madrugada del día siguiente y pasa a ser válido. Un cierre
 * 00:00 siempre cuenta como medianoche (fin del día), con o sin el flag.
 */
export function isValidDayRange(open: string, close: string, closesNextDay = false): boolean {
  return effectiveCloseMins(open, close, closesNextDay) > openMinutes(open)
}

const hhmmField = z.string().regex(TIME_HHMM_RE, 'Formato HH:MM')

type RawDay = { open: string; close: string; closed: boolean }

/**
 * Deriva `closesNextDay` a partir de los pares (open, close) ya parseados: alcanza
 * con que UN día ABIERTO tenga cierre <= apertura (ej. abre 18:00, cierra 02:00)
 * para que el complejo opere pasada la medianoche — ya no es un checkbox manual.
 *
 * Reusa `isValidDayRange` (mismo archivo) llamado con `closesNextDay=false`: si el
 * rango NO es válido asumiendo que el día no cruza medianoche, es justamente porque
 * necesita cruzarla. Evita reimplementar la aritmética de horas (que ya vive en
 * `effectiveCloseMins`, operating-day.ts, y NUNCA se reescribe a mano).
 */
function deriveClosesNextDay(days: Record<string, RawDay>): boolean {
  return WEEK_DAYS.some(
    ({ key }) => !days[key]!.closed && !isValidDayRange(days[key]!.open, days[key]!.close, false),
  )
}

/**
 * Contrato FormData del form de horarios (settings y wizard de onboarding):
 * `${day}_open` / `${day}_close` + hidden `${day}_closed` ('on' solo si cerrado).
 * `closesNextDay` ya NO llega del FormData (no hay checkbox manual): se deriva acá
 * mismo a partir de los 7 pares open/close. Devuelve el input crudo para
 * `horariosSchema`.
 */
export function horariosFormDataToInput(formData: FormData): Record<string, unknown> {
  const days: Record<string, RawDay> = Object.fromEntries(
    WEEK_DAYS.map(({ key }) => [
      key,
      {
        open: formData.get(`${key}_open`) as string,
        close: formData.get(`${key}_close`) as string,
        closed: formData.get(`${key}_closed`) === 'on',
      },
    ]),
  )

  return {
    ...days,
    closesNextDay: deriveClosesNextDay(days),
  }
}

// `closed` viaja con cada día (rediseño 2026-07-02, pages/horarios-precios.md §2.3).
// Antes el schema lo despojaba: un domingo cerrado en el wizard de onboarding se
// perdía silenciosamente al guardar desde /settings/horarios.
const horariosDaySchema = z.object({
  open: hhmmField,
  close: hhmmField,
  closed: z.boolean().default(false),
})

/**
 * Schema de los 7 días de apertura/cierre + el flag de día operativo. Además del
 * formato HH:MM por campo, valida que cada día tenga cierre posterior a la
 * apertura (BLOCKER #4) con un mensaje que identifica el día. Cuando
 * `closesNextDay` está prendido, un cierre <= apertura es válido (madrugada).
 *
 * `closesNextDay` NO va dentro de opening_hours: vive en la columna
 * tenants.closes_next_day. El caller separa ambos antes de persistir.
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
    closesNextDay: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    let openDays = 0
    for (const { key, label } of WEEK_DAYS) {
      const day = data[key]
      // Día cerrado: sus horas quedan como recuerdo para cuando se reabra — no se validan.
      if (day.closed) continue
      openDays++
      if (!isValidDayRange(day.open, day.close, data.closesNextDay)) {
        // Rama defensiva: `horariosFormDataToInput` (única puerta de entrada
        // real, en las dos superficies que usan este schema) ya deriva
        // `closesNextDay=true` para cualquier día con `close <= open` antes de
        // llegar acá, así que este `addIssue` no dispara en ningún camino de
        // producción — solo si algo llama al schema directo con un
        // `closesNextDay` que no refleja los días que le pasa (como hace
        // `tests/unit/opening-hours-validation.test.ts` a propósito, para
        // ejercitar el schema en aislamiento). El mensaje ya no nombra un
        // checkbox: el rediseño de Configuración (2026-09) lo eliminó — el
        // flag se deriva solo, no hay nada que "activar".
        ctx.addIssue({
          code: 'custom',
          path: [key, 'close'],
          message: `${label}: el horario de cierre debe ser posterior al de apertura.`,
        })
      }
    }
    if (openDays === 0) {
      ctx.addIssue({
        code: 'custom',
        path: [],
        message: 'Abrí al menos un día de la semana.',
      })
    }
  })
