import { addDays, artTodayStr } from '@/shared/dates/art'

/** Ventana de inicio de un partido: hoy y los 7 días siguientes, en días calendario ART. */
const RIVAL_START_WINDOW_DAYS = 7

/** Último día (ART, 'YYYY-MM-DD') en que se puede armar un partido. */
export function rivalLastStartDay(today: string = artTodayStr()): string {
  return addDays(today, RIVAL_START_WINDOW_DAYS)
}

/** ¿El día calendario ART `day` cae dentro de la ventana? Mismo borde para schema, service y CTAs. */
export function isInRivalStartWindow(day: string, today: string = artTodayStr()): boolean {
  return day <= rivalLastStartDay(today)
}
