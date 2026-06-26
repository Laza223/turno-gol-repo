import Link from 'next/link'
import { Ban } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatArs, formatTime } from '@/lib/format'
import { QuickActions } from './QuickActions'
import { hasQuickActions } from './quick-actions-helpers'
import type { ReservaListRow } from './queries'

type ItemVisual = { accent: string; badge: string; label: string }

/**
 * Mismo lenguaje visual que la grilla (BookingCard.slotVisual): acento lateral
 * 500/600 como señal no-cromática + texto 700/800 sobre fondo 50 (AA). Acá el
 * estado va en badge porque la lista filtra por estado, no por tipo.
 */
const STATUS_VISUALS: Record<string, ItemVisual> = {
  pending_payment: {
    accent: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
    label: 'Pago pendiente',
  },
  confirmed: {
    accent: 'bg-blue-600',
    badge: 'bg-blue-50 text-blue-800 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30',
    label: 'Confirmada',
  },
  completed: {
    accent: 'bg-slate-300',
    badge: 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-400/30',
    label: 'Completada',
  },
  no_show: {
    accent: 'bg-red-500',
    badge: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30',
    label: 'Ausente',
  },
  canceled_refunded: {
    accent: 'bg-slate-300',
    badge: 'bg-slate-100 text-slate-500 ring-slate-500/20 dark:bg-slate-500/15 dark:text-slate-400 dark:ring-slate-400/30',
    label: 'Cancelada',
  },
  canceled_no_refund: {
    accent: 'bg-slate-300',
    badge: 'bg-slate-100 text-slate-500 ring-slate-500/20 dark:bg-slate-500/15 dark:text-slate-400 dark:ring-slate-400/30',
    label: 'Cancelada',
  },
  expired: {
    accent: 'bg-slate-300',
    badge: 'bg-slate-100 text-slate-500 ring-slate-500/20 dark:bg-slate-500/15 dark:text-slate-400 dark:ring-slate-400/30',
    label: 'Expirada',
  },
}

const FALLBACK_VISUAL = STATUS_VISUALS.completed!

export function itemVisual(booking: Pick<ReservaListRow, 'status' | 'type'>): ItemVisual {
  if (booking.type === 'block') {
    return {
      accent: 'bg-slate-400',
      badge: 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-400/30',
      label: 'Bloqueo',
    }
  }
  return STATUS_VISUALS[booking.status] ?? FALLBACK_VISUAL
}

export function depositText(booking: Pick<ReservaListRow, 'depositStatus' | 'depositAmount'>): string {
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

export function clientName(booking: Pick<ReservaListRow, 'playerName' | 'guestName' | 'type'>): string {
  if (booking.type === 'block') return 'Bloqueo'
  return booking.playerName ?? booking.guestName ?? 'Sin nombre'
}

type Props = {
  booking: ReservaListRow
  /** Vista compacta (?vista=compacta): una línea por reserva, sin seña. */
  compact?: boolean
}

export function BookingListItem({ booking, compact = false }: Props) {
  const visual = itemVisual(booking)
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
    />
  )

  if (compact) {
    return (
      <li>
        <article
          aria-label={ariaLabel}
          className={cn(
            'relative flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-1.5 shadow-sm transition-colors hover:border-emerald-500/30',
            withActions && 'pr-12 sm:pr-3',
          )}
        >
          <span aria-hidden className={cn('h-6 w-1 shrink-0 rounded-full', visual.accent)} />
          <Link
            href={`/reservas/${booking.id}`}
            className="shrink-0 text-xs font-semibold tabular-nums text-foreground hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline sm:w-24"
          >
            {timeRange}
          </Link>
          <p className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm font-medium text-foreground">
            {isBlock && <Ban aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            {name}
          </p>
          <span className="hidden max-w-[9rem] truncate text-xs text-muted-foreground md:block">
            {booking.courtName}
          </span>
          <span
            className={cn(
              'hidden shrink-0 items-center rounded-full px-1.5 py-px text-[11px] font-medium ring-1 ring-inset sm:inline-flex',
              visual.badge,
            )}
          >
            {visual.label}
          </span>
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
          'relative flex gap-3 rounded-xl border border-border bg-card p-3 shadow-sm transition-colors hover:border-emerald-500/30',
          // En mobile el menú contextual vive arriba a la derecha (absoluto):
          // reservamos lugar para que no pise el contenido.
          withActions && 'pr-12 sm:pr-3',
        )}
      >
        <span aria-hidden className={cn('w-1 shrink-0 self-stretch rounded-full', visual.accent)} />
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <div className="shrink-0 sm:w-28">
            <Link
              href={`/reservas/${booking.id}`}
              className="text-sm font-semibold tabular-nums text-foreground hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline"
            >
              {timeRange}
            </Link>
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
            <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', visual.badge)}>
              {visual.label}
            </span>
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
