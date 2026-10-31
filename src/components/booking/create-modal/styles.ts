/**
 * Clases compartidas por los 4 forms de tipo (hallazgo #5, presupuesto de
 * líneas del rediseño 2026-09-14): el mismo `<select>`/campo de sólo lectura
 * de "Empieza"/"Hasta" se repetía literal en Turno, Turno fijo, Evento y
 * Bloqueo.
 */
export const selectClass =
  'h-11 w-full rounded-lg border border-border bg-card px-3 text-base text-foreground md:h-10 md:text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring'

/**
 * El dato de sólo lectura al lado de un campo ("hasta 18:00 · 1 h"): el alto
 * del select de al lado, para que las dos columnas sigan alineadas, pero sin
 * borde ni fondo. Con la caja del select parecía un campo deshabilitado.
 */
export const readOnlyFieldClass =
  'flex h-11 items-center text-base text-muted-foreground tabular-nums md:h-10 md:text-sm'
