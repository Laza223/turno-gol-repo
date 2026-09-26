import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PriceSummary as Summary } from './price-model'

/**
 * El precio de una cancha en una o dos líneas: "$ 60.000 hasta las 18:00 ·
 * $ 84.000 desde las 18:00", con los días adelante cuando algún día cobra
 * distinto. Los días van en su propia columna: si los precios no entran en un
 * renglón, bajan alineados debajo de los precios, no debajo de los días. Lo
 * que se edita hora por hora se resume como rango.
 */
export function PriceSummary({ summary, className }: { summary: Summary; className?: string }) {
  if (summary.kind === 'empty') {
    return (
      <span className={cn('text-sm text-amber-800 dark:text-amber-300', className)}>
        Sin precio
      </span>
    )
  }
  if (summary.kind === 'custom') {
    return (
      <span className={cn('block text-sm tabular-nums', className)}>
        <span className="font-semibold text-foreground">
          {formatArs(summary.min)} a {formatArs(summary.max)}
        </span>{' '}
        <span className="text-muted-foreground">según la hora</span>
      </span>
    )
  }
  const withDays = summary.lines.some((l) => l.days)
  return (
    <span
      className={cn(
        'grid gap-y-1 text-sm tabular-nums',
        withDays && 'grid-cols-[auto_minmax(0,1fr)] gap-x-3',
        className,
      )}
    >
      {summary.lines.map((line, i) => (
        <span key={i} className="contents">
          {withDays && <span className="text-muted-foreground">{line.days}</span>}
          <span className="flex flex-wrap gap-x-3 gap-y-0.5">
            {line.parts.map((part, j) => (
              <span key={j} className="whitespace-nowrap">
                <span className="font-semibold text-foreground">{formatArs(part.price)}</span>
                {part.label && <span className="ml-1 text-muted-foreground">{part.label}</span>}
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  )
}
