/**
 * La ventana de tiempo de "Plata en la calle".
 *
 * B11 midió que `getDebts` procesa **toda la historia de turnos completados del
 * complejo** para devolver la deuda vigente: con ~1 año de datos son 10.922
 * filas construidas, ordenadas y agregadas para descartarlas y devolver cero.
 * El predicado "¿todavía debe?" depende de un agregado (`HAVING`), así que
 * ningún índice lo puede resolver — la única forma de que la pantalla no crezca
 * con la vida del complejo es no mirar toda la vida del complejo.
 *
 * **Esto acota la CONSULTA, no la deuda.** Nada vence ni se deja de deber: la
 * fila sigue existiendo y `'all'` la trae. La decisión del dueño (2026-08-12)
 * fue explícita en ese punto — se evaluó vencer la deuda a los 6 meses con un
 * aviso previo y se descartó, porque esconder plata que a alguien le deben y
 * dejar de deberla son cosas distintas.
 *
 * Los 12 meses salen de que, según el dueño, **nadie debe más de 6 meses en la
 * práctica**: la ventana por defecto ya muestra el 100% de la deuda real con el
 * doble de margen.
 *
 * La ventana viaja a los TRES orígenes (turnos, fiados de cantina, inscripciones
 * de torneo) desde esta única constante. Que se aplique en uno solo rompería dos
 * cosas: el rótulo de la pantalla mentiría, y el total dejaría de coincidir con
 * la lista — `tests/integration/street-money-total.test.ts` verifica justamente
 * que las dos rutas den lo mismo.
 */

/** Meses hacia atrás que muestra la pantalla por defecto. */
export const STREET_MONEY_DEFAULT_MONTHS = 12

/** `'all'` = sin cota, lo que pide el botón "Ver anteriores". */
export type StreetMoneyWindow = { sinceMonths: number } | 'all'

export const DEFAULT_STREET_MONEY_WINDOW: StreetMoneyWindow = {
  sinceMonths: STREET_MONEY_DEFAULT_MONTHS,
}

/**
 * Fecha de corte en `YYYY-MM-DD`, o `null` si la ventana no acota.
 *
 * Devuelve un string y no un `Date` porque los tres consumidores lo comparan
 * contra columnas distintas (`bookings.date` es DATE; `created_at` es
 * TIMESTAMPTZ) y un `YYYY-MM-DD` castea limpio contra las dos.
 */
export function streetMoneyCutoffDate(window: StreetMoneyWindow, now: Date): string | null {
  if (window === 'all') return null
  const cutoff = new Date(now)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - window.sinceMonths)
  return cutoff.toISOString().slice(0, 10)
}
