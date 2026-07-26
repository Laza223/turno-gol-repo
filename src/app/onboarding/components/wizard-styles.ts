// Clases compartidas de campos del wizard. Token-safe (dark-ready) a propósito:
// los primitives ui/input siguen light-hardcodeados (MASTER §13 P0.1) y el
// wizard es theme-adaptive del lado del contenido.
// text-base en mobile: < 16px dispara el zoom de iOS al enfocar (MASTER §3.x).
export const fieldClass =
  'h-11 w-full rounded-lg border border-border bg-card px-3.5 text-base md:text-sm text-foreground placeholder:text-muted-foreground shadow-xs transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus:border-emerald-500'

export const labelClass = 'block text-sm font-medium text-foreground mb-1.5'
