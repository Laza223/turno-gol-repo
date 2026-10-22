import { redirect } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { isUuid } from '@/shared/validation/primitives'
import { holdExpiresAtIso } from '@/lib/booking/hold'
import { buildIngresarForReservaHref } from '@/lib/booking/reserve-url'
import { absoluteUrl } from '@/lib/seo/metadata'
import { isRivalEnabled } from '@/modules/rival/rival.flags'
import PaymentStatusWatcher from '@/components/booking/PaymentStatusWatcher'
import { ReservaNotFound } from '../ReservaNotFound'
import { BookingSuccessCard } from './BookingSuccessCard'

type Props = { params: Promise<{ bookingId: string }> }

export const dynamic = 'force-dynamic'

type BookingRow = {
  status: string
  createdAt: Date
  depositAmount: number
  depositStatus: string
  priceSnapshot: number
  hidePrices: boolean
  courtName: string
  courtFormat: number
  tenantName: string
  tenantSlug: string
  address: string
  city: string
  latitude: string | null
  longitude: string | null
  timeStart: string
  timeEnd: string
  date: string
  startsOn: string
}

async function loadBooking(bookingId: string, playerId: string): Promise<BookingRow | null> {
  return withPlayerContext(playerId, async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT b.status, b.created_at AS "createdAt",
             b.deposit_amount AS "depositAmount",
             b.deposit_status AS "depositStatus",
             b.price_snapshot AS "priceSnapshot",
             b.date::text AS date,
             (b.starts_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text AS "startsOn",
             b.time_start::text AS "timeStart",
             b.time_end::text AS "timeEnd",
             c.name AS "courtName",
             c.format AS "courtFormat",
             t.name AS "tenantName",
             t.slug AS "tenantSlug",
             t.address AS "address",
             t.city AS "city",
             t.latitude AS "latitude",
             t.longitude AS "longitude",
             COALESCE((t.settings ->> 'hide_public_prices')::boolean, false) AS "hidePrices"
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
  // Sin sesión (MercadoPago puede devolver al jugador en otro navegador): ingresar y volver acá.
  // Con un id que no es UUID no hay a dónde volver: ingresar a secas.
  if (!user || user.type !== 'player') {
    redirect(
      isUuid(params.bookingId)
        ? buildIngresarForReservaHref(params.bookingId, 'exito')
        : '/ingresar',
    )
  }

  // Guard de formato antes del SQL crudo: un id no-UUID rompía el cast en
  // Postgres y tumbaba la página con "Algo salió mal" en vez del estado
  // "no encontramos tu reserva". Mismo patrón que verificar/page.tsx.
  const booking = isUuid(params.bookingId)
    ? await loadBooking(params.bookingId, user.playerId)
    : null

  if (!booking) return <ReservaNotFound />

  // Player returned from MP before webhook landed — hand off to watcher
  if (booking.status !== 'confirmed') {
    return (
      <PaymentStatusWatcher
        bookingId={params.bookingId}
        initialStatus={booking.status}
        expiresAt={holdExpiresAtIso(booking.createdAt)}
        tenantSlug={booking.tenantSlug}
        date={booking.date}
      />
    )
  }

  const rivalEnabled = await isRivalEnabled().catch(() => false)

  return (
    <BookingSuccessCard
      bookingId={params.bookingId}
      complexUrl={absoluteUrl(`/${booking.tenantSlug}`)}
      rivalEnabled={rivalEnabled}
      booking={{
        tenantName: booking.tenantName,
        tenantSlug: booking.tenantSlug,
        courtName: booking.courtName,
        courtFormat: booking.courtFormat,
        address: booking.address,
        city: booking.city,
        latitude: booking.latitude == null ? null : Number(booking.latitude),
        longitude: booking.longitude == null ? null : Number(booking.longitude),
        startsOn: booking.startsOn,
        timeStart: booking.timeStart,
        timeEnd: booking.timeEnd,
        priceSnapshot: booking.priceSnapshot,
        depositAmount: booking.depositAmount,
        depositStatus: booking.depositStatus,
        hidePrices: booking.hidePrices,
      }}
    />
  )
}
