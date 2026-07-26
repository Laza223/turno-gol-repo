import {
  END_OF_DAY_MINS,
  endLabelFromMins,
  startLabelFromMins,
} from '@/shared/time/operating-day'
import { SLOT_DURATION_MINUTES } from '@/shared/constants'
import { TournamentSlotRangeError } from './tournament.errors'

// Lógica pura del reparto de una franja en horas. Sin DB: se testea sola.

// Copia local igual que en booking.service.ts, court.service.ts, public.service.ts…
// (el repo lo tiene privado en cada módulo; unificarlo es un refactor aparte).
function timeToMins(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Techo defensivo: una franja no puede abarcar más de un día operativo. */
const MAX_RANGE_MINS = 24 * 60

export type ExpandedSlot = {
  /** HH:MM (hora de pared; 1440 → '00:00'). */
  timeStart: string
  /** HH:MM o '24:00' (1440 como FIN es '24:00'). */
  timeEnd: string
  /** Minutos en el eje continuo del día que abre (post-medianoche ≥ 1440). */
  startMins: number
  /** El slot sucede el día calendario SIGUIENTE al día operativo. */
  physicallyNextDay: boolean
}

/**
 * Reparte una franja (timeStart→timeEnd) en slots de SLOT_DURATION_MINUTES
 * sobre el eje continuo del día operativo.
 *
 * El torneo posee HORAS ENTERAS: una fila de bookings por hora y por cancha, no
 * una sola reserva larga. Dos razones:
 *
 *  1. Skip-on-conflict. Si 16:00 ya está reservado, una única reserva 14:00→20:00
 *     fallaría entera; por hora se toman 14, 15, 17, 18 y 19 y se reporta 16.
 *  2. Liberación parcial. Recortar el torneo borra las horas sobrantes en vez de
 *     borrar y recrear todo.
 *
 * Los PARTIDOS (fase 2) viven adentro de estas horas con su propio starts_at, y
 * por eso un relámpago de partidos de 25 min no rompe el turno de 60 min fijo.
 *
 * Maneja el día operativo: con `closesNextDay`, una franja 22:00→02:00 se
 * extiende más allá de 1440 y las horas de madrugada salen con
 * `physicallyNextDay`, igual que las de un abonado nocturno.
 */
export function expandRangeToHourSlots(args: {
  timeStart: string
  timeEnd: string
  /** Apertura del día, en minutos. Define qué es "madrugada". */
  openMins: number
  closesNextDay: boolean
}): ExpandedSlot[] {
  const { openMins, closesNextDay } = args

  let start = timeToMins(args.timeStart)
  let end = timeToMins(args.timeEnd)
  // '00:00' como FIN es medianoche (fin del día), no el arranque del día.
  if (end === 0) end = END_OF_DAY_MINS

  if (closesNextDay && start < openMins) {
    // Franja íntegramente de madrugada (00:00→02:00 con apertura 08:00):
    // pertenece al día operativo anterior, entera.
    start += END_OF_DAY_MINS
    end += END_OF_DAY_MINS
  } else if (closesNextDay && end <= start) {
    // Franja que cruza medianoche (22:00→02:00).
    end += END_OF_DAY_MINS
  }

  if (end <= start) {
    throw new TournamentSlotRangeError(
      'La hora de fin tiene que ser posterior a la de inicio.',
    )
  }
  if (end - start > MAX_RANGE_MINS) {
    throw new TournamentSlotRangeError(
      'La franja no puede abarcar más de 24 horas.',
    )
  }
  if ((end - start) % SLOT_DURATION_MINUTES !== 0) {
    throw new TournamentSlotRangeError(
      `La franja tiene que ser un múltiplo de ${SLOT_DURATION_MINUTES} minutos.`,
    )
  }

  const slots: ExpandedSlot[] = []
  for (let m = start; m + SLOT_DURATION_MINUTES <= end; m += SLOT_DURATION_MINUTES) {
    slots.push({
      timeStart: startLabelFromMins(m),
      timeEnd: endLabelFromMins(m + SLOT_DURATION_MINUTES),
      startMins: m,
      physicallyNextDay: m >= END_OF_DAY_MINS,
    })
  }
  return slots
}
