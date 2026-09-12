import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Accent = 'emerald' | 'violet' | 'amber' | 'sky' | 'red' | 'slate'

interface DeltaProps {
  label: string
  direction: 'up' | 'down' | 'neutral'
  /** Color semántico independiente del glifo: para métricas invertidas (egresos)
   * donde subir (↑) es malo (rojo). Sin tone, deriva del direction (compat). */
  tone?: 'positive' | 'negative' | 'neutral'
}

interface StatCardProps {
  label: string
  value: ReactNode
  icon?: ReactNode
  sub?: string
  /** Variación vs período previo, con color semántico (up=emerald, down=red). */
  delta?: DeltaProps
  /** Acento del icon-halo. emerald=admin (default), violet=super-admin. */
  accent?: Accent
  /**
   * Detalle que descompone el `value`, dentro de la misma card. La pregunta y
   * su respuesta juntas: el desglose por método de "Cobrado hoy" vive acá y no
   * en una sección aparte, porque leer el total y tener que buscar de dónde
   * salió en otro lado es la fricción que el plegado tenía.
   *
   * Lo que se ponga acá tiene que sumar el `value`, o la card se contradice.
   */
  footer?: ReactNode
  className?: string
}

/**
 * Color del `value` cuando el accent es un estado de plata que exige acción
 * (H084 — MASTER §2.5 semáforo financiero + §9 von Restorff: "el estado que
 * exige acción es el distinto"). Antes el accent solo teñía el ícono de 36px;
 * la cifra —lo que el dueño realmente lee— quedaba en el mismo negro que
 * cualquier otro dato neutro. emerald/violet/sky/slate no llevan tono propio:
 * no son alertas de plata, así que el `value` sigue en `text-foreground`.
 */
const VALUE_TONE: Partial<Record<Accent, string>> = {
  // amber-800, no 700 (mismo criterio que PendingRefundsList/StreetMoneyList):
  // sobre un fondo casi blanco, amber-700 mide por debajo de AA.
  amber: 'text-amber-800 dark:text-amber-300',
  red: 'text-red-700 dark:text-red-400',
}

const ACCENT: Record<Accent, string> = {
  emerald:
    'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-500/25',
  violet:
    'bg-violet-500/10 text-violet-600 ring-violet-500/20 dark:bg-violet-500/15 dark:text-violet-400 dark:ring-violet-500/25',
  amber:
    'bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-500/25',
  sky: 'bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:bg-sky-500/15 dark:text-sky-400 dark:ring-sky-500/25',
  red: 'bg-red-500/10 text-red-600 ring-red-500/20 dark:bg-red-500/15 dark:text-red-400 dark:ring-red-500/25',
  slate:
    'bg-slate-500/10 text-slate-600 ring-slate-500/20 dark:bg-slate-500/15 dark:text-slate-400 dark:ring-slate-500/25',
}

const DELTA_TONE: Record<NonNullable<DeltaProps['tone']>, string> = {
  positive: 'text-emerald-700 dark:text-emerald-400',
  negative: 'text-red-600 dark:text-red-400',
  neutral: 'text-muted-foreground',
}

const DEFAULT_TONE: Record<DeltaProps['direction'], NonNullable<DeltaProps['tone']>> = {
  up: 'positive',
  down: 'negative',
  neutral: 'neutral',
}

const DELTA_GLYPH: Record<DeltaProps['direction'], string> = {
  up: '↑',
  down: '↓',
  neutral: '→',
}

/**
 * KPI card premium theme-adaptive (light=elevación, dark=glass) con icon-halo,
 * valor `font-display tabular-nums`, delta semántico y hover-lift. Primitiva
 * canónica: `MetricCard` (admin) y `SaMetricCard` (super-admin) delegan acá.
 */
export function StatCard({
  label,
  value,
  icon,
  sub,
  delta,
  accent = 'emerald',
  footer,
  className,
}: StatCardProps) {
  return (
    <div className={cn('card-premium card-premium-interactive group p-5', className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon && (
          <span
            className={cn(
              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset transition-transform duration-200 group-hover:scale-105',
              ACCENT[accent],
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p
        className={cn(
          'mt-3 font-display text-3xl font-bold tabular-nums tracking-tight',
          VALUE_TONE[accent] ?? 'text-foreground',
        )}
      >
        {value}
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        {delta && (
          <span
            className={cn(
              'text-xs font-semibold tabular-nums',
              DELTA_TONE[delta.tone ?? DEFAULT_TONE[delta.direction]],
            )}
          >
            {DELTA_GLYPH[delta.direction]} {delta.label}
          </span>
        )}
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  )
}
