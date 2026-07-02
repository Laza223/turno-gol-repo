'use client'

import { Banknote, CalendarClock, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { bookingDisplayName } from './BookingCard'
import type { GridBooking } from '@/lib/booking/grid-cells'

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  mercadopago: 'MercadoPago',
  other: 'Otro',
}

function formatArs(cents: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function depositLabel(booking: GridBooking): string {
  const amount = booking.depositAmount ?? 0
  switch (booking.depositStatus) {
    case 'paid':
      return amount > 0 ? `Seña pagada (${formatArs(amount)})` : 'Seña pagada'
    case 'pending':
      return amount > 0 ? `Seña pendiente (${formatArs(amount)})` : 'Seña pendiente'
    case 'refunded':
      return 'Seña reembolsada'
    case 'captured':
      return 'Seña cobrada'
    case 'not_required':
      return 'Sin seña'
    default:
      return 'Seña: —'
  }
}

type Props = {
  booking: GridBooking
  courtName: string
  id: string
  /** Lado de apertura según la fila: las últimas abren hacia arriba. */
  side: 'top' | 'bottom'
  /** Alineación según la columna: la última cancha alinea a la derecha. */
  align: 'left' | 'right'
}

/**
 * Detalle de una reserva al hover/focus del slot. Solo lectura: quién
 * reservó, horario, precio, método de pago y estado de la seña.
 */
export function BookingPopover({ booking, courtName, id, side, align }: Props) {
  const isBlock = booking.type === 'block'
  const name = bookingDisplayName(booking)

  return (
    <div
      id={id}
      role="tooltip"
      className={cn(
        'absolute z-[25] w-60 rounded-lg border border-border bg-popover p-3 text-left shadow-lg',
        'animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none',
        side === 'bottom' ? 'top-full mt-1' : 'bottom-full mb-1',
        align === 'left' ? 'left-0' : 'right-0',
      )}
    >
      <p className="flex items-center gap-1.5 text-sm font-semibold text-popover-foreground">
        <User aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        <span className="truncate">{name ?? (isBlock ? 'Bloqueo' : 'Sin nombre')}</span>
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarClock aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        <span className="tabular-nums">
          {courtName} · {booking.timeStart}–{booking.timeEnd}
        </span>
      </p>
      {!isBlock && (
        <dl className="mt-2 space-y-1 border-t border-border pt-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Precio</dt>
            <dd className="font-medium tabular-nums text-popover-foreground">
              {formatArs(booking.priceSnapshot)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="flex items-center gap-1 text-muted-foreground">
              <Banknote aria-hidden className="h-3.5 w-3.5 text-muted-foreground/70" />
              Pago
            </dt>
            <dd className="font-medium text-popover-foreground">
              {booking.paymentMethod ? PAYMENT_LABELS[booking.paymentMethod] : '—'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Seña</dt>
            <dd className="font-medium text-popover-foreground">{depositLabel(booking)}</dd>
          </div>
        </dl>
      )}
    </div>
  )
}
