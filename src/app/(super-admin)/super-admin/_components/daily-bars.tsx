import { cn } from '@/lib/utils'
import { formatDayStr } from './sa-format'

export type DailyBarsDay = { day: string; value: number }

/**
 * Barras diarias hechas con `div`, como las de Métricas (DESIGN.md: "una barra
 * hecha con un div alcanza para comparar", sin librería de gráficos). Una
 * columna por día, la de hoy en `primary` y el resto apagadas. Cada barra
 * lleva su día y su cifra en texto para lectores de pantalla; con el mouse,
 * el `title`.
 */
export function DailyBars({
  days,
  label,
  className,
}: {
  days: DailyBarsDay[]
  /** Qué cuenta la serie ("Jugadores nuevos por día"): nombre de la lista. */
  label: string
  className?: string
}) {
  const max = Math.max(1, ...days.map((d) => d.value))
  const total = days.reduce((acc, d) => acc + d.value, 0)
  const lastIndex = days.length - 1

  return (
    <div className={cn('min-w-0', className)}>
      <ol aria-label={label} className="flex h-24 items-end gap-1">
        {days.map((d, i) => {
          const isToday = i === lastIndex
          const pct = d.value === 0 ? 0 : Math.max(6, Math.round((d.value / max) * 100))
          const dayLabel = isToday ? 'Hoy' : formatDayStr(d.day)
          return (
            <li
              key={d.day}
              title={`${dayLabel}: ${d.value}`}
              className="flex h-full min-w-0 flex-1 flex-col justify-end"
            >
              <span className="sr-only">
                {dayLabel}: {d.value}
              </span>
              {d.value > 0 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'block w-full rounded-t-sm',
                    isToday ? 'bg-primary' : 'bg-primary/35 dark:bg-primary/45',
                  )}
                  style={{ height: `${pct}%` }}
                />
              ) : (
                <span aria-hidden="true" className="block h-px w-full bg-border" />
              )}
            </li>
          )
        })}
      </ol>
      <div
        aria-hidden="true"
        className="mt-1.5 flex justify-between text-xs tabular-nums text-muted-foreground"
      >
        <span>{days[0] ? formatDayStr(days[0].day) : ''}</span>
        <span>Hoy</span>
      </div>
      <p className="sr-only">Total: {total}</p>
    </div>
  )
}
