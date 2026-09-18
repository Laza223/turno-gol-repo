import Link from 'next/link'
import { formatDateLong } from '@/lib/format'
import { BookingListItem } from './BookingListItem'
import { buildHref, groupByDate } from './reservas-filters'
import type { BookingQuickActions } from './QuickActions'
import type { ReservaListRow } from './queries'

type Props = {
  /** Todas las canchas del tenant (`listCourts`, en su orden) — o solo la elegida por `?cancha`. */
  courts: Array<{ id: string; name: string }>
  bookings: ReservaListRow[]
  /** Hoy: una lista por cancha. Próximas: separadores de día adentro de cada cancha. */
  scope: 'hoy' | 'proximas'
  actions: BookingQuickActions
  cancellationPolicyHours?: number
  /** Filtros activos — para armar el link "Ver las N reservas" con `buildHref` (agrega `?cancha=`, preserva el resto). */
  status?: string
  q?: string
  /**
   * Total REAL por cancha (`courts.id`), del cupo por cancha de
   * `listTenantBookingsForBoard` (hallazgo #3, revisión redesign booking
   * modal 2026-09-14) — sólo viene cuando NO hay filtro de cancha. Si falta,
   * el header cae a `rows.length` y nunca hay link "Ver todas" (ya se está
   * viendo esa cancha entera, con su propia paginación abajo).
   */
  courtTotals?: Map<string, number>
}

/**
 * Hasta acá el tablero entra en UNA fila. Con 1216px útiles (1440 de pantalla
 * menos el riel de 72px y el `lg:px-8` del main) la quinta columna ya desborda,
 * así que a partir de la sexta cancha conviene bajar de fila antes que empujar
 * media pantalla fuera del viewport sin ningún indicador.
 */
const MAX_COLUMNS = 5

/**
 * Columnas por fila en escritorio: a lo sumo dos filas, todas del mismo ancho.
 * 6 canchas = 3+3, 7 = 4+3, 10 = 5+5. Repartir parejo y no "llenar 5 y bajar
 * una" evita la fila con una sola columna y un hueco de cuatro.
 */
export function courtsPerRow(total: number): number {
  if (total <= MAX_COLUMNS) return Math.max(1, total)
  return Math.ceil(total / 2)
}

/**
 * Tablero de Hoy/Próximas: una columna por cancha, cada una con su propio
 * scroll (`lg`+). Antes "Hoy" apilaba secciones (una cancha abajo de la
 * otra) — con 4+ canchas eso era puro scroll vertical para llegar a la
 * última, y "¿qué cancha está libre ahora?" es justo la pregunta que la
 * grilla ya responde mejor mirando todas a la vez. Lado a lado, un vistazo
 * alcanza.
 *
 * `< lg`: columnas de 85% de ancho (la siguiente cancha asoma) y alto
 * natural — nada de scroll anidado, la página entera scrollea (el root de
 * `(list)/page.tsx` es el `overflow-y-auto` de ese caso). `lg`+: hasta dos
 * filas balanceadas que llenan el alto disponible y scrollean cada una por su
 * cuenta, así "Cancha 1" con 15 turnos nunca empuja a "Cancha 2".
 */
export function CourtBoard({
  courts,
  bookings,
  scope,
  actions,
  cancellationPolicyHours,
  status,
  q,
  courtTotals,
}: Props) {
  const byCourt = new Map<string, ReservaListRow[]>()
  for (const c of courts) byCourt.set(c.name, [])
  for (const b of bookings) {
    byCourt.get(b.courtName)?.push(b)
  }

  const perRow = courtsPerRow(courts.length)

  return (
    <div
      // `< lg`: carrusel horizontal de una fila, columnas al 85% (la siguiente
      // asoma) — es lo correcto en un teléfono y no cambia.
      // `lg`+: filas balanceadas (6 canchas = 3+3, 10 = 5+5), todas del mismo
      // ancho y con su propio scroll. `minmax(13.75rem, 1fr)` deja que con 11+
      // canchas vuelva el scroll horizontal solo, sin caso especial.
      className="grid min-h-0 auto-cols-[85%] grid-flow-col items-start gap-3 overflow-x-auto snap-x pb-2 lg:min-h-0 lg:flex-1 lg:snap-none lg:auto-rows-fr lg:grid-flow-row lg:grid-cols-[repeat(var(--tg-board-cols),minmax(13.75rem,1fr))] lg:items-stretch"
      style={{ ['--tg-board-cols' as string]: String(perRow) }}
    >
      {courts.map((court) => {
        const rows = byCourt.get(court.name) ?? []
        // El header SIEMPRE muestra el total REAL de la cancha (hallazgo #3):
        // sin `courtTotals` (cancha ya filtrada / historial) cae a las filas
        // mostradas, que en ese caso SON el total de esta vista.
        const total = courtTotals?.get(court.id) ?? rows.length
        return (
          <section
            key={court.id}
            aria-label={court.name}
            // Borde de 1px y 12px de radio en vez de `card-premium`: esa receta
            // trae tres sombras y un filete emerald arriba, y con 10 columnas
            // en pantalla eso es decoración repetida diez veces.
            className="flex min-h-0 shrink-0 snap-start flex-col rounded-xl border border-border bg-card lg:h-full lg:min-w-0 lg:overflow-hidden"
          >
            <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-2 border-b border-border bg-card/95 px-3 py-2 backdrop-blur-xs">
              <h3 className="truncate text-sm font-semibold text-foreground">{court.name}</h3>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                {total}
              </span>
            </header>
            <div className="py-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {rows.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">Sin reservas</p>
              ) : scope === 'hoy' ? (
                <ul className="divide-y divide-border">
                  {rows.map((r) => (
                    <BookingListItem
                      key={r.id}
                      booking={r}
                      actions={actions}
                      cancellationPolicyHours={cancellationPolicyHours}
                      showCourt={false}
                    />
                  ))}
                </ul>
              ) : (
                groupByDate(rows).map(([date, dateRows]) => (
                  <div key={date}>
                    <p className="sticky top-0 z-[5] bg-card/95 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-xs">
                      {formatDateLong(date)}
                    </p>
                    <ul className="divide-y divide-border pb-1">
                      {dateRows.map((r) => (
                        <BookingListItem
                          key={r.id}
                          booking={r}
                          actions={actions}
                          cancellationPolicyHours={cancellationPolicyHours}
                          showCourt={false}
                        />
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
            {total > rows.length && (
              <Link
                href={buildHref({ dia: scope, status: status ?? '', q: q ?? '', cancha: court.id })}
                className="shrink-0 border-t border-border/60 px-3 py-2 text-center text-xs font-medium text-primary underline-offset-2 hover:underline"
              >
                Ver las {total} reservas
              </Link>
            )}
          </section>
        )
      })}
    </div>
  )
}
