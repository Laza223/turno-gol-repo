import type { OpeningHours } from '@/modules/tenants/tenant.types'
import {
  DAY_KEYS,
  DAY_LABELS,
  type DayKey,
  type PriceGrid,
  activeHoursForDay,
  getOperativeHours,
  hourLabel,
} from '@/modules/courts/pricing-grid'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Cuatro escalones de verde, del precio más barato al más caro. El verde acá
 * es "precio", no "acción": ningún tramo es clickeable, y el texto va siempre
 * en `foreground` (el tinte más fuerte sigue por encima de 7:1 en los dos
 * temas).
 */
const TINTS = [
  'bg-emerald-500/10 dark:bg-emerald-400/10',
  'bg-emerald-500/20 dark:bg-emerald-400/20',
  'bg-emerald-500/30 dark:bg-emerald-400/30',
  'bg-emerald-500/45 dark:bg-emerald-400/40',
] as const

type Segment = { from: number; to: number; price: number | null }

function segmentsOf(grid: PriceGrid, hours: number[], day: DayKey): Segment[] {
  const out: Segment[] = []
  for (const h of hours) {
    const price = grid[day]?.[h] ?? null
    const last = out.at(-1)
    if (last && last.price === price && last.to === h) last.to = h + 1
    else out.push({ from: h, to: h + 1, price })
  }
  return out
}

/**
 * "Así queda la semana": un renglón por día con el horario del complejo
 * dibujado como una barra y cada tramo de precio adentro. Es la verificación
 * que antes pedía leer 105 celdas: se ve de un vistazo qué cuesta el turno de
 * cada día y a qué hora cambia. Una hora sin precio aparece en ámbar.
 */
export function WeekPricePreview({
  grid,
  openingHours,
  closesNextDay,
  className,
}: {
  grid: PriceGrid
  openingHours: OpeningHours
  closesNextDay: boolean
  className?: string
}) {
  const span = getOperativeHours(openingHours, closesNextDay)
  if (span.length === 0) return null
  const start = span[0]!
  const end = span.at(-1)! + 1
  const pct = (h: number) => `${((h - start) / (end - start)) * 100}%`

  const rows = DAY_KEYS.map((day) => {
    const hours = activeHoursForDay(openingHours, day, closesNextDay)
    return { day, segments: segmentsOf(grid, hours, day) }
  })

  const prices = [
    ...new Set(rows.flatMap((r) => r.segments.flatMap((s) => (s.price == null ? [] : [s.price])))),
  ].sort((a, b) => a - b)
  const tintOf = (price: number) => {
    if (prices.length === 1) return TINTS[1]
    const rank = prices.indexOf(price) / (prices.length - 1)
    return TINTS[Math.round(rank * (TINTS.length - 1))]
  }

  // Marcas del eje: apertura, cierre y las horas donde cambia el precio en
  // más de un día (el corte de la noche). Un corte de un solo día no se marca:
  // se lee en su propio renglón.
  const cutCount = new Map<number, number>()
  for (const r of rows) {
    for (const s of r.segments.slice(1)) cutCount.set(s.from, (cutCount.get(s.from) ?? 0) + 1)
  }
  // Dos marcas pegadas (00:00 y 01:00) se pisan: gana la de las puntas.
  const minGap = (end - start) * 0.1
  const cuts = [...cutCount]
    .filter(([h, n]) => n > 1 && h - start >= minGap && end - h >= minGap)
    .map(([h]) => h)
    .sort((a, b) => a - b)
  const marks = [start, ...cuts.filter((h, i) => i === 0 || h - cuts[i - 1]! >= minGap), end]

  return (
    <figure className={cn('space-y-1.5', className)}>
      <figcaption className="sr-only">Precio del turno por día y por hora</figcaption>
      <div aria-hidden="true" className="relative ml-11 h-4">
        {marks.map((h, i) => (
          <span
            key={h}
            className={cn(
              'absolute top-0 text-[11px] font-medium tabular-nums text-muted-foreground',
              i === 0 ? '' : i === marks.length - 1 ? '-translate-x-full' : '-translate-x-1/2',
            )}
            style={{ left: pct(h) }}
          >
            {hourLabel(h)}
          </span>
        ))}
      </div>
      <ul className="space-y-1">
        {rows.map(({ day, segments }) => (
          <li key={day} className="flex items-center gap-3">
            <span className="w-8 shrink-0 text-xs font-medium text-muted-foreground">
              {DAY_LABELS[day]}
            </span>
            <div className="relative h-7 flex-1 rounded-md bg-muted/50 dark:bg-muted/30">
              {segments.length === 0 ? (
                <span className="absolute inset-0 flex items-center px-2 text-xs text-muted-foreground">
                  Cerrado
                </span>
              ) : (
                segments.map((s) => (
                  <span
                    key={s.from}
                    title={`${DAY_LABELS[day]} ${hourLabel(s.from)}–${hourLabel(s.to)}: ${
                      s.price == null ? 'sin precio' : formatArs(s.price)
                    }`}
                    className={cn(
                      '@container absolute inset-y-0 flex items-center justify-center overflow-hidden rounded-md border-2 border-card text-xs font-medium tabular-nums',
                      s.price == null
                        ? 'border-dashed border-amber-500/70 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'
                        : cn(tintOf(s.price), 'text-foreground'),
                    )}
                    style={{ left: pct(s.from), width: pct(start + s.to - s.from) }}
                  >
                    <span className="hidden truncate px-1 text-[11px] @min-[3.5rem]:inline @min-[5rem]:text-xs">
                      {s.price == null ? 'Sin precio' : formatArs(s.price)}
                    </span>
                  </span>
                ))
              )}
            </div>
          </li>
        ))}
      </ul>
    </figure>
  )
}
