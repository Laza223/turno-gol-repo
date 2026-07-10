import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { sql } from 'drizzle-orm'
import { CheckCircle2 } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { DEFAULT_EXPIRY_SECONDS } from '@/shared/jobs/definitions'
import { formatArs, formatDateLong } from '@/lib/format'
import PaymentStatusWatcher from '@/components/booking/PaymentStatusWatcher'
import BookingSuccessExtras from '@/components/booking/BookingSuccessExtras'
import BookingQR from '@/components/booking/BookingQR'
import BookingReceipt from '@/components/booking/BookingReceipt'
import DownloadReceiptButton from '@/components/booking/DownloadReceiptButton'
import ReservaDarkShell from '@/components/booking/ReservaDarkShell'

type Props = { params: { bookingId: string } }

export const dynamic = 'force-dynamic'

type BookingRow = {
  status: string
  createdAt: Date
  depositAmount: number
  depositStatus: string
  priceSnapshot: number
  courtName: string
  tenantName: string
  tenantSlug: string
  address: string
  city: string
  latitude: string | null
  longitude: string | null
  timeStart: string
  timeEnd: string
  date: string
}

async function loadBooking(bookingId: string, playerId: string): Promise<BookingRow | null> {
  return withPlayerContext(playerId, async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT b.status, b.created_at AS "createdAt",
             b.deposit_amount AS "depositAmount",
             b.deposit_status AS "depositStatus",
             b.price_snapshot AS "priceSnapshot",
             b.date::text AS date,
             b.time_start::text AS "timeStart",
             b.time_end::text AS "timeEnd",
             c.name AS "courtName",
             t.name AS "tenantName",
             t.slug AS "tenantSlug",
             t.address AS "address",
             t.city AS "city",
             t.latitude AS "latitude",
             t.longitude AS "longitude"
      FROM bookings b
      JOIN courts c ON c.id = b.court_id
      JOIN tenants t ON t.id = b.tenant_id
      WHERE b.id = ${bookingId} LIMIT 1
    `)) as unknown as BookingRow[]
    return rows[0] ?? null
  })
}

export default async function ReservaExitoPage({ params }: Props) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') redirect('/ingresar')

  const booking = await loadBooking(params.bookingId, user.playerId)

  if (!booking) {
    return (
      <ReservaDarkShell>
        <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">No encontramos tu reserva.</p>
          <Link href="/mis-reservas" className="mt-8 inline-flex h-12 items-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 active:scale-[0.98] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 dark:shadow-emerald-500/25">
            Ver mis reservas
          </Link>
        </div>
      </ReservaDarkShell>
    )
  }

  // Player returned from MP before webhook landed — hand off to watcher
  if (booking.status !== 'confirmed') {
    // caza-bugs #12: el hold real vence a DEFAULT_EXPIRY_SECONDS (6 min), no 15.
    const expiresAt = new Date(
      new Date(booking.createdAt).getTime() + DEFAULT_EXPIRY_SECONDS * 1000,
    ).toISOString()
    return (
      <ReservaDarkShell>
        <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
          <PaymentStatusWatcher
            bookingId={params.bookingId}
            initialStatus={booking.status}
            expiresAt={expiresAt}
          />
        </div>
      </ReservaDarkShell>
    )
  }

  const remainingAmount = booking.priceSnapshot - booking.depositAmount

  // URL pública de verificación que codifica el QR: el complejo la escanea y
  // ve el estado real del turno (sin datos del jugador). Base desde env con
  // fallback al host del request (dev / previews).
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? `https://${headers().get('host') ?? 'turnogol.app'}`
  const verifyUrl = `${appUrl}/reserva/${params.bookingId}/verificar`

  return (
    <ReservaDarkShell>
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
      {/* Celebración peak-end §5.3: un solo ring que se disipa (600ms, una vez)
          — sin loops. El glow estático lo pone .reserva-success-badge. */}
      <div className="relative mb-6 flex h-20 w-20 items-center justify-center">
        <span className="reserva-success-badge relative flex h-20 w-20 animate-slot-pulse items-center justify-center rounded-full text-emerald-600 dark:text-emerald-400 motion-reduce:animate-none">
          <CheckCircle2 className="h-10 w-10" aria-hidden />
        </span>
      </div>
      <h1 className="font-display text-3xl font-black italic tracking-tight text-foreground">
        ¡Reserva <span className="hero-accent-text">confirmada!</span>
      </h1>
      <p className="mt-3 text-sm text-muted-foreground tabular-nums">
        <span className="font-semibold text-foreground">{booking.tenantName}</span> · {booking.courtName}<br />
        {formatDateLong(booking.date)} · {booking.timeStart.slice(0, 5)}–{booking.timeEnd.slice(0, 5)}
      </p>
      {booking.depositStatus === 'not_required' ? (
        <p className="mt-4 text-sm text-muted-foreground tabular-nums">
          Pagás <span className="font-semibold text-foreground">{formatArs(booking.priceSnapshot)}</span> al llegar al complejo.
        </p>
      ) : (
        <div className="mt-4 space-y-1 text-sm text-muted-foreground tabular-nums">
          <p>Seña pagada: <span className="font-semibold text-emerald-700 dark:text-emerald-400">{formatArs(booking.depositAmount)}</span></p>
          <p>Resta abonar en el complejo: <span className="text-foreground">{formatArs(remainingAmount)}</span></p>
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
        <DownloadReceiptButton
          fileName={`comprobante-${booking.tenantSlug}-${booking.date}`}
        />
      </section>

      <BookingReceipt
        bookingId={params.bookingId}
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
        latitude={booking.latitude == null ? null : Number(booking.latitude)}
        longitude={booking.longitude == null ? null : Number(booking.longitude)}
      />

      <Link
        href="/mis-reservas"
        className="mt-7 inline-flex h-12 items-center rounded-xl bg-primary px-7 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl hover:shadow-emerald-600/30 active:scale-[0.98] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 dark:shadow-emerald-500/25"
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
    </ReservaDarkShell>
  )
}
