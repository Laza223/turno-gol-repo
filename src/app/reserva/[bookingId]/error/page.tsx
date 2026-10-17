import { redirect, RedirectType } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { isUuid } from '@/shared/validation/primitives'
import { holdAllowsRetry } from '@/lib/booking/hold'
import { buildIngresarForReservaHref, buildReservaHref } from '@/lib/booking/reserve-url'
import { retryDepositPaymentAction } from '@/app/(public)/[slug]/reservar/actions'
import { ReservaNotFound } from '../ReservaNotFound'
import { BookingErrorCard, errorViewFor } from './BookingErrorCard'

type Props = { params: Promise<{ bookingId: string }> }

export const dynamic = 'force-dynamic'

async function loadBooking(bookingId: string, playerId: string) {
  return withPlayerContext(playerId, async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT b.status, b.created_at AS "createdAt", b.date::text AS date,
             b.time_start::text AS "timeStart", b.time_end::text AS "timeEnd",
             c.name AS "courtName", t.slug AS "tenantSlug"
      FROM bookings b
      JOIN courts c ON c.id = b.court_id
      JOIN tenants t ON t.id = b.tenant_id
      WHERE b.id = ${bookingId} LIMIT 1
    `)) as unknown as Array<{
      status: string
      createdAt: string
      date: string
      timeStart: string
      timeEnd: string
      courtName: string
      tenantSlug: string | null
    }>
    return rows[0] ?? null
  })
}

export default async function ReservaErrorPage(props: Props) {
  const params = await props.params
  const user = await extractAuthUser()
  // Sin sesión (MercadoPago puede devolver al jugador en otro navegador): ingresar y volver acá.
  // Con un id que no es UUID no hay a dónde volver: ingresar a secas.
  if (!user || user.type !== 'player') {
    redirect(
      isUuid(params.bookingId)
        ? buildIngresarForReservaHref(params.bookingId, 'error')
        : '/ingresar',
    )
  }

  // Guard de formato antes del SQL crudo: un id no-UUID rompía el cast en
  // Postgres y tumbaba la página con "Algo salió mal". Mismo patrón que
  // exito/page.tsx.
  const booking = isUuid(params.bookingId)
    ? await loadBooking(params.bookingId, user.playerId)
    : null

  // Sin reserva (inexistente, purgada por RGPD, o de otro jugador via RLS): no
  // afirmamos "el pago no se procesó"; mostramos un estado neutro como la página
  // hermana de éxito (#44).
  if (!booking) return <ReservaNotFound />

  // El webhook llegó mientras el jugador miraba el error: la reserva está confirmada, no hay
  // error que mostrar.
  if (booking.status === 'confirmed') {
    redirect(buildReservaHref(params.bookingId, 'exito'), RedirectType.replace)
  }

  // Server Component: el cuerpo corre UNA vez por request, en el servidor. La
  // regla del React Compiler apunta a renders de CLIENTE, que se pueden
  // re-ejecutar en cualquier momento.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  // caza-bugs #12: con 15 min esta página ofrecía "Reintentar pago" sobre un
  // booking que el worker de expiración ya había liberado, y el retry fallaba
  // confuso. Y con el hold a punto de vencer, la preferencia nueva se comería el margen
  // del webhook (`holdAllowsRetry`): un pago que entra tarde no confirma la reserva.
  const withinWindow =
    booking.status === 'pending_payment' && holdAllowsRetry(booking.createdAt, now)

  return (
    <BookingErrorCard
      bookingId={params.bookingId}
      tenantSlug={booking.tenantSlug}
      date={booking.date}
      turn={{
        courtName: booking.courtName,
        timeStart: booking.timeStart,
        timeEnd: booking.timeEnd,
      }}
      view={errorViewFor(booking.status, withinWindow)}
      retryAction={retryDepositPaymentAction}
    />
  )
}
