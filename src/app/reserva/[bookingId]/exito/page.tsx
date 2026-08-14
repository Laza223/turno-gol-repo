import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { sql } from 'drizzle-orm'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { isUuid } from '@/shared/validation/primitives'
import { holdExpiresAtIso } from '@/lib/booking/hold'
import PaymentStatusWatcher from '@/components/booking/PaymentStatusWatcher'
import ReservaDarkShell from '@/components/booking/ReservaDarkShell'
import { BookingSuccessCard, BookingSuccessNotFound } from './BookingSuccessCard'

type Props = { params: Promise<{ bookingId: string }> }

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

export default async function ReservaExitoPage(props: Props) {
  const params = await props.params
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') redirect('/ingresar')

  // Guard de formato antes del SQL crudo: un id no-UUID rompía el cast en
  // Postgres y tumbaba la página con "Algo salió mal" en vez del estado
  // "no encontramos tu reserva". Mismo patrón que verificar/page.tsx.
  const booking = isUuid(params.bookingId)
    ? await loadBooking(params.bookingId, user.playerId)
    : null

  if (!booking) {
    return (
      <ReservaDarkShell>
        <BookingSuccessNotFound />
      </ReservaDarkShell>
    )
  }

  // Player returned from MP before webhook landed — hand off to watcher
  if (booking.status !== 'confirmed') {
    const expiresAt = holdExpiresAtIso(booking.createdAt)
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

  // URL pública de verificación que codifica el QR: el complejo la escanea y
  // ve el estado real del turno (sin datos del jugador). Base desde env con
  // fallback al host del request (dev / previews).
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? `https://${(await headers()).get('host') ?? 'turnogol.app'}`
  const verifyUrl = `${appUrl}/reserva/${params.bookingId}/verificar`

  return (
    <ReservaDarkShell>
      <BookingSuccessCard
        bookingId={params.bookingId}
        verifyUrl={verifyUrl}
        booking={{
          tenantName: booking.tenantName,
          tenantSlug: booking.tenantSlug,
          courtName: booking.courtName,
          address: booking.address,
          city: booking.city,
          latitude: booking.latitude == null ? null : Number(booking.latitude),
          longitude: booking.longitude == null ? null : Number(booking.longitude),
          date: booking.date,
          timeStart: booking.timeStart,
          timeEnd: booking.timeEnd,
          priceSnapshot: booking.priceSnapshot,
          depositAmount: booking.depositAmount,
          depositStatus: booking.depositStatus,
        }}
      />
    </ReservaDarkShell>
  )
}
