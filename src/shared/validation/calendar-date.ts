/**
 * Validacion de fechas calendario reales (#16).
 *
 * El regex `^\d{4}-\d{2}-\d{2}$` (usado en `dateStr` de primitives) NO valida
 * que la fecha exista: deja pasar `2026-13-45` o `2026-02-31`. Esos valores,
 * inyectados crudos en un cast SQL `::date` o en el constructor Date, provocan
 * errores no controlados (Postgres rechaza el cast / Invalid Date -> throw).
 * Estos helpers cierran ese gap haciendo un round-trip por Date.
 */

/** True si `s` es una fecha calendario real en formato YYYY-MM-DD. */
export function isValidCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  // getTime NaN cubre meses/dias imposibles (2026-13-45); la comparacion del
  // round-trip cubre los rollover silenciosos (2026-02-31 -> 2026-03-03).
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** Devuelve `value` si es una fecha calendario valida; si no, `fallback`. */
export function safeDateParam(value: string | undefined, fallback: string): string {
  return value && isValidCalendarDate(value) ? value : fallback
}
