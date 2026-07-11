/**
 * Reloj congelado para fixtures + preview de Storybook. El preview MUST usar
 * este mismo instante (ver .storybook/preview.tsx) para que un fixture con
 * `createdAt: minutesFromNow(-5)` y un componente que calcula "hace 5
 * minutos" respecto de `Date.now()` (mockeado a FROZEN_NOW) queden
 * consistentes. Si alguna vez se cambia esta fecha, hay que cambiarla en los
 * dos lugares a la vez.
 *
 * Sábado 14 de marzo de 2026, 15:30 ART (UTC-3).
 */
export const FROZEN_NOW: Date = new Date('2026-03-14T18:30:00.000Z')

/** Instante relativo a FROZEN_NOW. Negativo = pasado, positivo = futuro. */
export const minutesFromNow = (minutes: number): Date =>
  new Date(FROZEN_NOW.getTime() + minutes * 60_000)

export const hoursFromNow = (hours: number): Date => minutesFromNow(hours * 60)

export const daysFromNow = (days: number): Date => minutesFromNow(days * 24 * 60)

/**
 * Fecha calendario (YYYY-MM-DD) en la timezone del complejo (ART, sin DST)
 * para un instante dado. Default: FROZEN_NOW → '2026-03-14'.
 */
export const artDateString = (date: Date = FROZEN_NOW): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
