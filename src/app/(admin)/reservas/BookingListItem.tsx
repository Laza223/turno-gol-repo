import Link from 'next/link'
import { Ban } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatArs, formatTime } from '@/lib/format'
import { QuickActions, type BookingQuickActions } from './QuickActions'
import { hasQuickActions } from './quick-actions-helpers'
import { reservaStatusVisual, ReservaStatusBadge } from './status-visual'
import type { ReservaListRow } from './queries'

function depositText(booking: Pick<ReservaListRow, 'depositStatus' | 'depositAmount'>): string {
  if (booking.depositAmount <= 0) return 'Sin seña'
  switch (booking.depositStatus) {
    case 'paid':
    case 'captured':
      return `Seña pagada (${formatArs(booking.depositAmount)})`
    case 'pending':
      return `Seña pendiente (${formatArs(booking.depositAmount)})`
    case 'refunded':
      return 'Seña reembolsada'
    default:
      return 'Sin seña'
  }
}

function clientName(booking: Pick<ReservaListRow, 'playerName' | 'guestName' | 'type'>): string {
  if (booking.type === 'block') return 'Bloqueo'
  return booking.playerName ?? booking.guestName ?? 'Sin nombre'
}

type Props = {
  booking: ReservaListRow
  /** Vista compacta (?vista=compacta): una línea por reserva, sin seña. */
  compact?: boolean
  /**
   * Server Actions de QuickActions, reenviadas tal cual (Server Component →
   * Client Component). Solo se usan si `hasQuickActions(booking)` es true.
   */
  actions: BookingQuickActions
}

export function BookingListItem({ booking, compact = false, actions }: Props) {
  const visual = reservaStatusVisual(booking)
  const name = clientName(booking)
  const isBlock = booking.type === 'block'
  const isAbonado = !isBlock && booking.type === 'fixed'
  const timeRange = `${formatTime(booking.timeStart)}–${formatTime(booking.timeEnd)}`

  const ariaLabel = [
    `Reserva ${timeRange}`,
    booking.courtName,
    name,
    visual.label,
    isAbonado ? 'abonado' : null,
  ]
    .filter(Boolean)
    .join(', ')

  const withActions = hasQuickActions(booking)

  // QuickActions ya se posiciona (z-10) contra el Link estirado de la fila
  // (Fitts: la fila entera navega al detalle, menos donde hay otro control).
  const quickActions = withActions && (
    <QuickActions
      booking={{
        id: booking.id,
        status: booking.status,
        type: booking.type,
        depositStatus: booking.depositStatus,
        depositAmount: booking.depositAmount,
        paymentMethod: booking.paymentMethod,
      }}
      label={`${name} · ${timeRange}`}
      {...actions}
    />
  )

  if (compact) {
    return (
      <li>
        <article
          aria-label={ariaLabel}
          className={cn(
            'group relative flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-1.5 shadow-sm transition-colors hover:bg-accent/50',
            withActions && 'pr-12 sm:pr-3',
          )}
        >
          <Link
            href={`/reservas/${booking.id}`}
            aria-label={ariaLabel}
            className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          />
          <span aria-hidden className={cn('h-6 w-1 shrink-0 rounded-full', visual.accent)} />
          <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground group-hover:text-emerald-700 dark:group-hover:text-emerald-400 sm:w-24">
            {timeRange}
          </span>
          <p className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm font-medium text-foreground">
            {isBlock && <Ban aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            {name}
          </p>
          <span className="hidden max-w-[9rem] truncate text-xs text-muted-foreground md:block">
            {booking.courtName}
          </span>
          <ReservaStatusBadge visual={visual} className="hidden sm:inline-flex" />
          {!isBlock && (
            <p className="hidden shrink-0 text-xs font-semibold tabular-nums text-foreground sm:block sm:w-20 sm:text-right">
              {formatArs(booking.priceSnapshot)}
            </p>
          )}
          {quickActions}
        </article>
      </li>
    )
  }

  return (
    <li>
      <article
        aria-label={ariaLabel}
        className={cn(
          'group relative flex gap-3 rounded-xl border border-border bg-card p-3 shadow-sm transition-colors hover:bg-accent/50',
          // En mobile el menú contextual vive arriba a la derecha (absoluto):
          // reservamos lugar para que no pise el contenido.
          withActions && 'pr-12 sm:pr-3',
        )}
      >
        <Link
          href={`/reservas/${booking.id}`}
          aria-label={ariaLabel}
          className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        />
        <span aria-hidden className={cn('w-1 shrink-0 self-stretch rounded-full', visual.accent)} />
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <div className="shrink-0 sm:w-28">
            <span className="text-sm font-semibold tabular-nums text-foreground group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
              {timeRange}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
              {isBlock && <Ban aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              {name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {booking.courtName}
              {!isBlock && <> · {depositText(booking)}</>}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <ReservaStatusBadge visual={visual} />
            {isAbonado && (
              <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30">
                Abonado
              </span>
            )}
          </div>

          {!isBlock && (
            <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground sm:w-20 sm:text-right">
              {formatArs(booking.priceSnapshot)}
            </p>
          )}

          {quickActions}
        </div>
      </article>
    </li>
  )
}
