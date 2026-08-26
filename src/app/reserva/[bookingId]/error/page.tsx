import { redirect } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { isUuid } from '@/shared/validation/primitives'
import { holdExpiresAtMs } from '@/lib/booking/hold'
import { retryDepositPaymentAction } from '@/app/(public)/[slug]/reservar/actions'
import ReservaDarkShell from '@/components/booking/ReservaDarkShell'
import { BookingErrorCard, BookingErrorNotFound } from './BookingErrorCard'

type Props = { params: Promise<{ bookingId: string }> }

export const dynamic = 'force-dynamic'

async function loadBooking(bookingId: string, playerId: string) {
  return withPlayerContext(playerId, async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT b.status, b.created_at AS "createdAt", t.slug AS "tenantSlug"
      FROM bookings b
      JOIN tenants t ON t.id = b.tenant_id
      WHERE b.id = ${bookingId} LIMIT 1
    `)) as unknown as Array<{ status: string; createdAt: string; tenantSlug: string | null }>
    return rows[0] ?? null
  })
}

export default async function ReservaErrorPage(props: Props) {
  const params = await props.params
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') redirect('/ingresar')

  // Guard de formato antes del SQL crudo: un id no-UUID rompía el cast en
  // Postgres y tumbaba la página con "Algo salió mal". Mismo patrón que
  // verificar/page.tsx.
  const booking = isUuid(params.bookingId)
    ? await loadBooking(params.bookingId, user.playerId)
    : null

  // Sin reserva (inexistente, purgada por RGPD, o de otro jugador via RLS): no
  // afirmamos "el pago no se procesó"; mostramos un estado neutro como la página
  // hermana de éxito (#44).
  if (!booking) {
    return (
      <ReservaDarkShell>
        <BookingErrorNotFound />
      </ReservaDarkShell>
    )
  }

  // Server Component: el cuerpo corre UNA vez por request, en el servidor. La
  // regla del React Compiler apunta a renders de CLIENTE, que se pueden
  // re-ejecutar en cualquier momento.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  // caza-bugs #12: con 15 min esta página ofrecía "Reintentar pago" sobre un
  // booking que el worker de expiración ya había liberado, y el retry fallaba
  // confuso.
  const withinWindow =
    booking.status === 'pending_payment' && holdExpiresAtMs(booking.createdAt) > now

  return (
    <ReservaDarkShell>
      <BookingErrorCard
        bookingId={params.bookingId}
        tenantSlug={booking.tenantSlug}
        withinWindow={withinWindow}
        retryAction={retryDepositPaymentAction}
      />
    </ReservaDarkShell>
  )
}
