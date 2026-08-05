/**
 * Tonos de estado — la tabla de tokens que consumen TODOS los mapeos
 * estado→visual del admin (reservas, grilla, canchas, abonados, staff).
 *
 * Por qué existe: hasta Fase 3 cada superficie tenía su propia copia de las
 * clases de badge. Cuatro copias de la misma receta, sincronizadas a mano, y ya
 * habían divergido: `bg-muted text-muted-foreground` (canchas offline, abonado
 * cancelado, staff manager, staff inactivo) da 4.21:1 sobre el fondo de card y
 * FALLA AA, mientras `reservas/status-visual.tsx` ya había arreglado el mismo
 * caso con una receta de slate. Con la tabla acá, el fix se aplica una vez.
 *
 * Cada tono expone las cinco formas en que el sistema pinta un estado
 * (MASTER §2.6): el pill de badge, el color del label sobre tinte, el borde
 * izquierdo de 3px de la grilla, el acento sólido de las listas, y los dos
 * niveles de tinte de fondo. Ninguna vista inventa un hex nuevo.
 *
 * Contraste (MASTER §2.4, re-verificado): los labels usan `*-800` en light y
 * `*-300` en dark. `text-red-700`/`text-red-300` para destructive — red-800 en
 * light quedaba innecesariamente apagado y 700 ya cumple AA sobre el tinte.
 */

export type StatusTone = 'success' | 'warning' | 'info' | 'destructive' | 'neutral' | 'brand'

/**
 * Pill de badge dual-theme (MASTER §6.5): tinte 10%/15% + texto AA + ring.
 *
 * `neutral` NO usa `bg-muted text-muted-foreground`: esa combinación es opaca y
 * da 4.21:1 (falla AA). La receta de slate mantiene el mismo peso visual y pasa.
 */
export const TONE_BADGE: Record<StatusTone, string> = {
  success:
    'bg-success/10 text-emerald-800 ring-1 ring-inset ring-success/25 dark:bg-success/15 dark:text-emerald-300 dark:ring-success/40',
  warning:
    'bg-warning/10 text-amber-800 ring-1 ring-inset ring-warning/25 dark:bg-warning/15 dark:text-amber-300 dark:ring-warning/40',
  info: 'bg-info/10 text-blue-800 ring-1 ring-inset ring-info/25 dark:bg-info/15 dark:text-blue-300 dark:ring-info/40',
  destructive:
    'bg-destructive/10 text-red-700 ring-1 ring-inset ring-destructive/25 dark:bg-destructive/15 dark:text-red-300 dark:ring-destructive/40',
  neutral:
    'bg-slate-500/10 text-slate-800 ring-1 ring-inset ring-slate-500/25 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-500/40',
  brand:
    'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-600/25 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/40',
}

/** Color del label de estado sobre un tinte (escala AA verificada, §2.4). */
export const TONE_TEXT: Record<StatusTone, string> = {
  success: 'text-emerald-800 dark:text-emerald-300',
  warning: 'text-amber-800 dark:text-amber-300',
  info: 'text-blue-800 dark:text-blue-300',
  destructive: 'text-red-700 dark:text-red-300',
  neutral: 'text-muted-foreground',
  brand: 'text-emerald-800 dark:text-emerald-300',
}

/** Borde izquierdo de 3px: identificador primario del estado en la grilla. */
export const TONE_BORDER: Record<StatusTone, string> = {
  success: 'border-l-success',
  warning: 'border-l-warning',
  info: 'border-l-info',
  destructive: 'border-l-destructive',
  neutral: 'border-l-slate-400 dark:border-l-slate-500',
  brand: 'border-l-primary',
}

/** Acento sólido (tira lateral de las listas). */
export const TONE_ACCENT: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  info: 'bg-info',
  destructive: 'bg-destructive',
  neutral: 'bg-muted-foreground',
  brand: 'bg-primary',
}

/** Tinte de fondo de la celda. `strong` marca el remate de un ciclo (Jugada). */
export const TONE_TINT: Record<StatusTone, string> = {
  success: 'bg-success/10 dark:bg-success/15',
  warning: 'bg-warning/10 dark:bg-warning/15',
  info: 'bg-info/10 dark:bg-info/15',
  destructive: 'bg-destructive/10 dark:bg-destructive/15',
  neutral: 'bg-muted/30 dark:bg-muted/40',
  brand: 'bg-primary/10 dark:bg-primary/15',
}

export const TONE_TINT_STRONG: Record<StatusTone, string> = {
  success: 'bg-success/15 dark:bg-success/20',
  warning: 'bg-warning/15 dark:bg-warning/20',
  info: 'bg-info/15 dark:bg-info/20',
  destructive: 'bg-destructive/15 dark:bg-destructive/20',
  neutral: 'bg-muted/40 dark:bg-muted/50',
  brand: 'bg-primary/15 dark:bg-primary/20',
}

/** Swatch de leyenda: cuadradito que enseña el mapeo color↔estado. */
export const TONE_SWATCH: Record<StatusTone, string> = {
  success: 'bg-success/15 border-l-2 border-l-success',
  warning: 'bg-warning/15 border-l-2 border-l-warning',
  info: 'bg-info/15 border-l-2 border-l-info',
  destructive: 'bg-destructive/15 border-l-2 border-l-destructive',
  neutral: 'bg-muted/40 border-l-2 border-l-slate-400 dark:border-l-slate-500',
  brand: 'bg-primary/15 border-l-2 border-l-primary',
}
