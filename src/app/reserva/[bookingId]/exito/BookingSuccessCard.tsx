import type { CSSProperties } from 'react'
import Link from 'next/link'
import { MessageCircle, Swords } from 'lucide-react'
import { RESULT_ALT, RESULT_GO } from '@/components/world/PortalResult'
import { isInRivalStartWindow } from '@/modules/rival/rival-window'
import { bookingCode } from '@/lib/booking-code'
import { buildGroupShareHref, buildGroupShareText } from '@/lib/booking/group-share'
import { SummaryHead, SummaryRows } from '@/app/(public)/[slug]/reservar/components/BookingSummary'
import ReservaShell from '@/components/booking/ReservaDarkShell'
import BookingReceipt from '@/components/booking/BookingReceipt'
import BookingSuccessExtras from '@/components/booking/BookingSuccessExtras'
import CelebrateOnce from '@/components/booking/CelebrateOnce'
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
  /** La portada del complejo, o su logo: la miniatura del ticket. `null` = el nombre solo. */
  imageUrl?: string | null
}

/**
 * La reserva confirmada, en vidrio (`reserva.html`, portal de vidrio F5): la insignia verde, el
 * título y el ticket con el turno y el código, cortado como un pase. Una sola acción principal,
 * "Avisarle al grupo" (un link a WhatsApp con el turno escrito, sin montos); debajo, las
 * secundarias en la fila de enlaces y el mini mapa. Con los precios ocultos no hay ningún monto en
 * el DOM, tampoco en el link de WhatsApp ni en el comprobante.
 *
 * Es el momento de la app: la coreografía de la dirección §4.5 (insignia, tilde, título, ticket que
 * se imprime, código letra por letra y botones) es CSS y corre una vez por visita (`CelebrateOnce`).
 *
 * El caso `status !== 'confirmed'` (jugador vuelto de MP antes del webhook) lo maneja
 * `PaymentStatusWatcher`. `complexUrl` lo arma la page con el origen de la app.
 */
export function BookingSuccessCard({
  bookingId,
  booking,
  complexUrl,
  rivalEnabled = false,
  celebrated = false,
}: {
  bookingId: string
  booking: ConfirmedBooking
  /** El link absoluto del complejo, para el mensaje al grupo. */
  complexUrl: string
  /** Flag global de RIVAL: suma "Armar el partido" como acción secundaria. Apagado, nada. */
  rivalEnabled?: boolean
  /** Esta reserva ya festejó en esta sesión del navegador (cookie): se muestra quieta. */
  celebrated?: boolean
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

  const code = bookingCode(bookingId)
  const summary = {
    tenantName: booking.tenantName,
    address: booking.address,
    city: booking.city,
    imageUrl: booking.imageUrl,
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
  }

  return (
    <ReservaShell>
      <CelebrateOnce
        bookingId={bookingId}
        seen={celebrated}
        className="rv-done rv-celebrate pt-6 md:pt-10"
      >
        <span className="rv-badge">
          {/* El tilde se traza (`pathLength` = 1): es el `Check` de lucide dibujado a mano. */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path className="rv-tick" d="M20 6 9 17l-5-5" pathLength={1} />
          </svg>
        </span>
        <h1 className="rv-h1 rv-at-title">¡Reserva confirmada!</h1>

        {/* El ticket se imprime: sale de la ranura de arriba hacia abajo (`.rv-slot` recorta). */}
        <div className="rv-slot">
          <section aria-label="Tu turno" className="rv-ticket glass-painted">
            <SummaryHead data={summary} />
            <SummaryRows data={summary} />
            <div className="rv-cut" aria-hidden />
            <section aria-label="Código de la reserva" className="grid gap-1">
              <div className="rv-code">
                <span>Código de reserva</span>
                {/* Letra por letra a la vista; el lector de pantalla lee el código entero. */}
                <b>
                  <span className="sr-only">{code}</span>
                  {Array.from(code).map((ch, i) => (
                    <span key={i} aria-hidden style={{ '--n': i } as CSSProperties}>
                      {ch}
                    </span>
                  ))}
                </b>
              </div>
              <p className="rv-small">
                Si el complejo te lo pide, con este código encuentra tu reserva.
              </p>
              <div className="mt-2">
                <DownloadReceiptButton
                  fileName={`comprobante-${booking.tenantSlug}-${booking.startsOn}`}
                />
              </div>
            </section>
          </section>
        </div>

        <div className="rv-acts rv-at-acts">
          <a
            href={shareHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-describedby="share-hint"
            className={RESULT_GO}
          >
            <MessageCircle className="size-5 shrink-0" aria-hidden />
            Avisarle al grupo
          </a>
          <p id="share-hint" className="rv-small">
            Se abre WhatsApp con el turno escrito, para que lo mandes a tu grupo.
          </p>
          {rivalEnabled && isInRivalStartWindow(booking.startsOn) && (
            <Link href={`/rival/nuevo?reserva=${bookingId}`} className={RESULT_ALT}>
              <Swords className="size-5 shrink-0" aria-hidden />
              Armar el partido
            </Link>
          )}
        </div>

        <div className="rv-at-acts w-full">
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
      </CelebrateOnce>

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
    </ReservaShell>
  )
}
