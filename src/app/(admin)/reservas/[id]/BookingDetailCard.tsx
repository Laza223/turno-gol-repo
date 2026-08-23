import type { ReactNode } from 'react'
import { formatArs, formatDateLong, formatTime } from '@/lib/format'
import { METHOD_LABELS } from '@/lib/payment-method'
import { reservaStatusVisual, ReservaStatusBadge, RESERVA_UNPAID_VISUAL } from '../status-visual'
import { resolveDepositDisplayStatus } from '../deposit-display'
import type { ReservaDetail } from '../queries'

const DEPOSIT_LABEL: Record<string, string> = {
  paid: 'pagada',
  captured: 'pagada',
  pending: 'pendiente',
  // La plata todavía no se movió: el complejo la debe. Ver `deposit-display.ts`.
  refund_pending: 'a devolver',
  refunded: 'devuelta',
}

/**
 * Card `dl` de detalle de una reserva (fecha, cancha, cliente, estado, precio,
 * seña, método de pago) + notas del jugador y motivo de cancelación cuando
 * aplican. Extraído de `[id]/page.tsx` (PRESENTATIONAL_EXTRACTION_REQUIRED):
 * era el único bloque presentacional sustancial de esa page, antes de
 * delegar a BookingCharges/BookingActions.
 */
export function BookingDetailCard({ booking }: { booking: ReservaDetail }) {
  const visual = reservaStatusVisual(booking)
  const depositDisplayStatus = resolveDepositDisplayStatus(
    booking.depositStatus,
    booking.refundState,
  )

  const rows: Array<[string, ReactNode]> = [
    [
      'Fecha',
      `${formatDateLong(booking.date)} · ${formatTime(booking.timeStart)}–${formatTime(booking.timeEnd)}`,
    ],
    ['Cancha', booking.courtName],
    ['Cliente', booking.playerName ?? booking.guestName ?? '—'],
    ['Teléfono', booking.playerPhone ?? booking.guestPhone ?? '—'],
    [
      'Estado',
      // Los dos badges van dentro del MISMO <dd>: los e2e del detalle filtran
      // por `dd` con hasText 'Ausente'/'Jugada' (reservas-crud, TG-HP-211/212).
      <span key="estado" className="inline-flex flex-wrap items-center gap-1.5">
        <ReservaStatusBadge visual={visual} />
        {visual.unpaid && <ReservaStatusBadge visual={RESERVA_UNPAID_VISUAL} />}
      </span>,
    ],
    ['Precio', formatArs(booking.priceSnapshot)],
    [
      'Seña',
      booking.depositAmount > 0
        ? `${formatArs(booking.depositAmount)} (${DEPOSIT_LABEL[depositDisplayStatus] ?? depositDisplayStatus})`
        : 'Sin seña',
    ],
    [
      'Método de pago',
      booking.paymentMethod
        ? ((METHOD_LABELS as Record<string, string>)[booking.paymentMethod] ??
          booking.paymentMethod)
        : '—',
    ],
  ]

  return (
    <div className="card-premium rounded-xl p-6">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      {/* Cada bloque va en su PROPIO <dl>: un <dt>/<dd> suelto fuera de un <dl> es HTML
          inválido y viola la regla `dlitem` de axe (los pares término/definición solo
          existen dentro de una lista de definiciones). Antes colgaban de un <div>
          después de que el <dl> de arriba ya había cerrado. */}
      {booking.notesPlayer && (
        <dl className="mt-4 border-t border-border pt-4">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            Nota del jugador
          </dt>
          <dd className="mt-1 text-sm text-foreground">{booking.notesPlayer}</dd>
        </dl>
      )}
      {booking.canceledReason && (
        <dl className="mt-4 border-t border-border pt-4">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            Motivo de cancelación
          </dt>
          <dd className="mt-1 text-sm text-foreground">{booking.canceledReason}</dd>
        </dl>
      )}
    </div>
  )
}
