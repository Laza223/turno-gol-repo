// Clases compartidas de campos del wizard.
//
// DEPRECADO (2026-08-15): existían porque `ui/input` estaba light-hardcodeado
// (MASTER §13 P0.1). Esa deuda ya está cerrada — el primitive es token-safe y
// además trae hover, disabled y `md:h-10`, que acá faltan. Sobreviven solo para
// el `<select>` de provincias, que `Input` no cubre; mueren cuando ese select
// pase a `ui/combobox`.
// text-base en mobile: < 16px dispara el zoom de iOS al enfocar (MASTER §3.x).
export const fieldClass =
  'h-11 w-full rounded-lg border border-border bg-card px-3.5 text-base md:text-sm text-foreground placeholder:text-muted-foreground shadow-xs transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus:border-emerald-500'

export const labelClass = 'block text-sm font-medium text-foreground mb-1.5'
