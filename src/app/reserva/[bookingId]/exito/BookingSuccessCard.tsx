import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { formatArs, formatDateLong } from '@/lib/format'
import BookingQR from '@/components/booking/BookingQR'
import BookingReceipt from '@/components/booking/BookingReceipt'
import BookingSuccessExtras from '@/components/booking/BookingSuccessExtras'
import DownloadReceiptButton from '@/components/booking/DownloadReceiptButton'

export type ConfirmedBooking = {
  tenantName: string
  tenantSlug: string
  courtName: string
  address: string
  city: string
  latitude: number | null
  longitude: number | null
  /** "YYYY-MM-DD" */
  date: string
  /** "HH:MM:SS" o "HH:MM" */
  timeStart: string
  timeEnd: string
  priceSnapshot: number
  depositAmount: number
  depositStatus: string
}

/**
 * Card de éxito para un booking ya `confirmed` — variantes por `depositStatus`
 * (con seña / sin seña). El caso `status!=='confirmed'` (jugador vuelto de MP
 * antes del webhook) lo maneja `PaymentStatusWatcher`, fuera de esta área
 * (`@/components/booking`, WP-BOOK).
 */
export function BookingSuccessCard({
  bookingId,
  booking,
  verifyUrl,
}: {
  bookingId: string
  booking: ConfirmedBooking
  verifyUrl: string
}) {
  const remainingAmount = booking.priceSnapshot - booking.depositAmount

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
      {/* Celebración peak-end §5.3: un solo ring que se disipa (600ms, una vez) — sin loops. */}
      <div className="relative mb-6 flex h-20 w-20 items-center justify-center">
        <span className="reserva-success-badge relative flex h-20 w-20 animate-slot-pulse items-center justify-center rounded-full text-emerald-600 dark:text-emerald-400 motion-reduce:animate-none">
          <CheckCircle2 className="h-10 w-10" aria-hidden />
        </span>
      </div>
      <h1 className="font-display text-3xl font-black italic tracking-tight text-foreground">
        ¡Reserva <span className="hero-accent-text">confirmada!</span>
      </h1>
      <p className="mt-3 text-sm text-muted-foreground tabular-nums">
        <span className="font-semibold text-foreground">{booking.tenantName}</span> ·{' '}
        {booking.courtName}
        <br />
        {formatDateLong(booking.date)} · {booking.timeStart.slice(0, 5)}–
        {booking.timeEnd.slice(0, 5)}
      </p>
      {booking.depositStatus === 'not_required' ? (
        <p className="mt-4 text-sm text-muted-foreground tabular-nums">
          Pagás{' '}
          <span className="font-semibold text-foreground">{formatArs(booking.priceSnapshot)}</span>{' '}
          al llegar al complejo.
        </p>
      ) : (
        <div className="mt-4 space-y-1 text-sm text-muted-foreground tabular-nums">
          <p>
            Seña pagada:{' '}
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              {formatArs(booking.depositAmount)}
            </span>
          </p>
          <p>
            Resta abonar en el complejo:{' '}
            <span className="text-foreground">{formatArs(remainingAmount)}</span>
          </p>
        </div>
      )}
      <section
        aria-label="Comprobante para mostrar en el complejo"
        className="reserva-receipt-card mt-7 w-full overflow-hidden rounded-2xl p-5"
      >
        <div className="flex justify-center">
          <div className="rounded-xl bg-white p-3 shadow-lg">
            <BookingQR value={verifyUrl} label="Código QR de verificación de la reserva" />
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Mostrá este código al llegar: el complejo lo escanea y verifica tu reserva al instante.
        </p>
        <DownloadReceiptButton fileName={`comprobante-${booking.tenantSlug}-${booking.date}`} />
      </section>

      <BookingReceipt
        bookingId={bookingId}
        tenantName={booking.tenantName}
        address={booking.address}
        city={booking.city}
        courtName={booking.courtName}
        date={booking.date}
        timeStart={booking.timeStart}
        timeEnd={booking.timeEnd}
        priceSnapshot={booking.priceSnapshot}
        depositAmount={booking.depositAmount}
        depositStatus={booking.depositStatus}
        verifyUrl={verifyUrl}
      />

      <BookingSuccessExtras
        tenantName={booking.tenantName}
        courtName={booking.courtName}
        slug={booking.tenantSlug}
        date={booking.date}
        timeStart={booking.timeStart}
        timeEnd={booking.timeEnd}
        address={booking.address}
        city={booking.city}
        latitude={booking.latitude}
        longitude={booking.longitude}
      />

      <Link
        href="/mis-reservas"
        className="mt-7 inline-flex h-12 items-center rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-7 text-sm font-bold text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_8px_30px_rgba(16,185,129,0.3)] transition-all duration-200 hover:brightness-105 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_12px_36px_rgba(16,185,129,0.4)] active:scale-[0.97] whitespace-nowrap"
      >
        Ver mis reservas
      </Link>
      <Link
        href="/explorar"
        className="mt-3 inline-flex h-11 items-center rounded-full px-6 text-sm font-semibold text-emerald-700 transition-colors hover:bg-primary/10 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-white/5 dark:hover:text-emerald-300"
      >
        Seguir explorando
      </Link>
    </div>
  )
}

/** Sin reserva encontrada (inexistente, purgada, o de otro jugador via RLS). */
export function BookingSuccessNotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
      <p className="text-sm text-muted-foreground">No encontramos tu reserva.</p>
      <Link
        href="/mis-reservas"
        className="mt-8 inline-flex h-12 items-center rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 text-sm font-bold text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_8px_30px_rgba(16,185,129,0.3)] transition-all duration-200 hover:brightness-105 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_12px_36px_rgba(16,185,129,0.4)] active:scale-[0.97] whitespace-nowrap"
      >
        Ver mis reservas
      </Link>
    </div>
  )
}
