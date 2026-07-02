import Link from 'next/link'
import {
  CalendarPlus,
  CheckCircle2,
  Clock,
  HandCoins,
  MoonStar,
  Repeat,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatArs, formatTime } from '@/lib/format'
import {
  badgeKindForRow,
  relativeStartLabel,
  rowDisplayName,
  type BookingBadgeKind,
  type DayBookingRow,
} from '@/app/(admin)/dashboard/dashboard-lib'

const MAX_ROWS = 6

/**
 * Badges de estado — mismo mapa que la grilla (pages/grilla.md §2): color =
 * estado de la plata (§2.5), ícono + label = qué es. Texto en escala AA
 * verificada (§2.4): *-800 light / *-300 dark sobre tinte alpha del token.
 */
const BADGE: Record<BookingBadgeKind, { label: string; icon: typeof Clock; classes: string }> = {
  esperando: {
    label: 'Esperando seña',
    icon: Clock,
    classes: 'bg-warning/10 text-amber-800 dark:bg-warning/15 dark:text-amber-300',
  },
  senada: {
    label: 'Señada',
    icon: CheckCircle2,
    classes: 'bg-success/10 text-emerald-800 dark:bg-success/15 dark:text-emerald-300',
  },
  abonado: {
    label: 'Abonado',
    icon: Repeat,
    classes: 'bg-info/10 text-blue-800 dark:bg-info/15 dark:text-blue-300',
  },
  confirmada: {
    label: 'Confirmada',
    icon: HandCoins,
    classes: 'bg-info/10 text-blue-800 dark:bg-info/15 dark:text-blue-300',
  },
}

function StateBadge({ kind }: { kind: BookingBadgeKind }) {
  const { label, icon: Icon, classes } = BADGE[kind]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        classes,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  )
}

function EmptyRow({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <Icon className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  )
}

interface UpcomingBookingsProps {
  upcoming: DayBookingRow[]
  playedToday: number
  dayIsClosed: boolean
  nowHhmm: string
  openHhmm: string
  closesNextDay: boolean
}

/**
 * "Quién viene" — próximos turnos de hoy desde ahora (pages/dashboard.md §3).
 * Server Component puro: los datos llegan resueltos desde la page.
 */
export function UpcomingBookings({
  upcoming,
  playedToday,
  dayIsClosed,
  nowHhmm,
  openHhmm,
  closesNextDay,
}: UpcomingBookingsProps) {
  const visible = upcoming.slice(0, MAX_ROWS)
  const overflow = upcoming.length - visible.length

  return (
    <section aria-labelledby="proximos-turnos" className="card-premium rounded-2xl">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 id="proximos-turnos" className="text-base font-semibold text-foreground">
          Próximos turnos
        </h2>
        <Link
          href="/grilla"
          className="text-sm font-semibold text-emerald-700 transition-colors hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          Ver grilla →
        </Link>
      </div>

      {dayIsClosed ? (
        <EmptyRow icon={MoonStar}>Hoy el complejo está cerrado.</EmptyRow>
      ) : visible.length === 0 ? (
        playedToday > 0 ? (
          <EmptyRow icon={CheckCircle2}>
            No quedan turnos por jugar hoy — se {playedToday === 1 ? 'jugó' : 'jugaron'}{' '}
            {playedToday}.{' '}
            <Link
              href="/grilla"
              className="font-semibold text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300"
            >
              Ver el día en la grilla
            </Link>
          </EmptyRow>
        ) : (
          <EmptyRow icon={CalendarPlus}>
            Todavía no hay reservas para hoy.{' '}
            <Link
              href="/grilla"
              className="font-semibold text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300"
            >
              Cargar la primera desde la grilla
            </Link>
          </EmptyRow>
        )
      ) : (
        <>
          <ul className="divide-y divide-border">
            {visible.map((row) => {
              const relative = relativeStartLabel(row, nowHhmm, openHhmm, closesNextDay)
              const name = rowDisplayName(row)
              return (
                <li key={row.id}>
                  <Link
                    href={`/reservas/${row.id}`}
                    className="flex min-h-[44px] items-center gap-4 px-5 py-3 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    aria-label={`${formatTime(row.timeStart)} ${name} en ${row.courtName} — ver reserva`}
                  >
                    <div className="w-14 shrink-0">
                      <p className="font-display text-lg font-bold tabular-nums leading-tight text-foreground">
                        {formatTime(row.timeStart)}
                      </p>
                      {relative && (
                        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          {relative}
                        </p>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{name}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {row.courtName} · {formatTime(row.timeStart)}–
                        {formatTime(row.timeEnd) === '24:00' ? '00:00' : formatTime(row.timeEnd)}
                      </p>
                    </div>
                    <StateBadge kind={badgeKindForRow(row)} />
                    <p className="hidden shrink-0 text-sm font-semibold tabular-nums text-foreground sm:block">
                      {formatArs(row.priceSnapshot)}
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
          {overflow > 0 && (
            <div className="border-t border-border px-5 py-3">
              <Link
                href="/grilla"
                className="text-sm font-semibold text-emerald-700 transition-colors hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                {overflow} {overflow === 1 ? 'turno más' : 'turnos más'} — ver grilla →
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  )
}
