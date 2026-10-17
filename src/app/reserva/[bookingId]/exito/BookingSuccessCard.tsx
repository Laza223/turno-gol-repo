import { CheckCircle2, MessageCircle } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { PORTAL_BUTTON, PORTAL_COLUMN, PORTAL_TITLE } from '@/components/world/PortalAuthFrame'
import { bookingCode } from '@/lib/booking-code'
import { buildGroupShareHref, buildGroupShareText } from '@/lib/booking/group-share'
import { TONE_TEXT } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import BookingSummary from '@/app/(public)/[slug]/reservar/components/BookingSummary'
import BookingReceipt from '@/components/booking/BookingReceipt'
import BookingSuccessExtras from '@/components/booking/BookingSuccessExtras'
import DownloadReceiptButton from '@/components/booking/DownloadReceiptButton'

export type ConfirmedBooking = {
  tenantName: string
  tenantSlug: string
  courtName: string
  /** Jugadores por lado de la cancha (`courts.format`). */
  courtFormat: number
  address: string
  city: string
  latitude: number | null
  longitude: number | null
  /** "YYYY-MM-DD": día CALENDARIO en que se juega (de `starts_at`, ART), no el operativo. */
  startsOn: string
  /** "HH:MM:SS" o "HH:MM" */
  timeStart: string
  timeEnd: string
  priceSnapshot: number
  depositAmount: number
  depositStatus: string
  /** El complejo oculta sus precios (`settings.hide_public_prices`): sin montos. */
  hidePrices: boolean
}

/**
 * La reserva confirmada, en La Reserva. Una sola acción principal, "Avisarle al grupo" (un link a
 * WhatsApp con el turno escrito, sin montos); debajo, las secundarias en una lista plana y, al
 * pie y más chicos, el código y el comprobante. Con los precios ocultos no hay ningún monto en el
 * DOM, tampoco en el link de WhatsApp ni en el comprobante.
 *
 * El caso `status !== 'confirmed'` (jugador vuelto de MP antes del webhook) lo maneja
 * `PaymentStatusWatcher`. `complexUrl` lo arma la page con el origen de la app.
 */
export function BookingSuccessCard({
  bookingId,
  booking,
  complexUrl,
}: {
  bookingId: string
  booking: ConfirmedBooking
  /** El link absoluto del complejo, para el mensaje al grupo. */
  complexUrl: string
}) {
  const timeStart = booking.timeStart.slice(0, 5)
  const timeEnd = booking.timeEnd.slice(0, 5)
  const withDeposit = booking.depositStatus !== 'not_required'
  // Con los precios a la vista, la seña y el resto ya los dice el resumen; la fila de "cómo se
  // paga" solo hace falta cuando no hay montos que lo digan.
  const payNote = !withDeposit
    ? 'Pagás en el complejo'
    : booking.hidePrices
      ? 'Seña pagada, el resto en el complejo'
      : undefined
  const shareHref = buildGroupShareHref(
    buildGroupShareText({
      tenantName: booking.tenantName,
      courtName: booking.courtName,
      courtFormat: booking.courtFormat,
      date: booking.startsOn,
      timeStart,
      timeEnd,
      address: booking.address,
      city: booking.city,
      complexUrl,
    }),
  )

  return (
    <div className={cn(PORTAL_COLUMN, 'pb-12 pt-6 sm:pt-12')}>
      <CheckCircle2 className={cn('size-8', TONE_TEXT.success)} aria-hidden />
      <h1 className={cn(PORTAL_TITLE, 'mt-4 text-balance')}>¡Reserva confirmada!</h1>

      <div className="mt-6">
        <BookingSummary
          data={{
            tenantName: booking.tenantName,
            address: booking.address,
            city: booking.city,
            courtName: booking.courtName,
            courtFormat: booking.courtFormat,
            date: booking.startsOn,
            timeStart,
            timeEnd,
            price: booking.priceSnapshot,
            depositAmount: booking.depositAmount,
            hidePrices: booking.hidePrices,
            depositPaid: true,
            payNote,
          }}
        />
      </div>

      <div className="mt-8">
        <a
          href={shareHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-describedby="share-hint"
          className={cn(buttonVariants(), PORTAL_BUTTON, 'gap-2')}
        >
          <MessageCircle className="size-5 shrink-0" aria-hidden />
          Avisarle al grupo
        </a>
        <p id="share-hint" className="mt-2 text-sm text-muted-foreground">
          Se abre WhatsApp con el turno escrito, para que lo mandes a tu grupo.
        </p>
      </div>

      <div className="mt-8">
        <BookingSuccessExtras
          tenantName={booking.tenantName}
          courtName={booking.courtName}
          slug={booking.tenantSlug}
          startsOn={booking.startsOn}
          timeStart={booking.timeStart}
          timeEnd={booking.timeEnd}
          address={booking.address}
          city={booking.city}
          latitude={booking.latitude}
          longitude={booking.longitude}
        />
      </div>

      <section aria-label="Código de la reserva" className="mt-8 border-t border-border pt-6">
        <p className="text-sm text-muted-foreground">Código de reserva</p>
        <p className="mt-1 font-mono text-xl font-semibold tracking-widest text-foreground">
          {bookingCode(bookingId)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Si el complejo te lo pide, con este código encuentra tu reserva.
        </p>
        <DownloadReceiptButton fileName={`comprobante-${booking.tenantSlug}-${booking.startsOn}`} />
      </section>

      <BookingReceipt
        bookingId={bookingId}
        tenantName={booking.tenantName}
        address={booking.address}
        city={booking.city}
        courtName={booking.courtName}
        date={booking.startsOn}
        timeStart={booking.timeStart}
        timeEnd={booking.timeEnd}
        priceSnapshot={booking.priceSnapshot}
        depositAmount={booking.depositAmount}
        depositStatus={booking.depositStatus}
        hidePrices={booking.hidePrices}
      />
    </div>
  )
}
