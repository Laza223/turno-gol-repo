import { redirect } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { isUuid } from '@/shared/validation/primitives'
import { holdExpiresAtIso } from '@/lib/booking/hold'
import PaymentStatusWatcher from '@/components/booking/PaymentStatusWatcher'
import ReservaDarkShell from '@/components/booking/ReservaDarkShell'

type Props = { params: Promise<{ bookingId: string }> }

export const dynamic = 'force-dynamic'

async function loadBooking(bookingId: string, playerId: string) {
  return withPlayerContext(playerId, async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT b.status, b.created_at AS "createdAt"
      FROM bookings b
      WHERE b.id = ${bookingId} LIMIT 1
    `)) as unknown as Array<{ status: string; createdAt: Date }>
    return rows[0] ?? null
  })
}

export default async function ReservaPendientePage(props: Props) {
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
        <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No encontramos tu reserva. Revisá tus reservas en el panel.
          </p>
        </div>
      </ReservaDarkShell>
    )
  }

  // caza-bugs #12: el hold real vence a los 6 min, no a los 15 que este
  // contador mostraba antes — el jugador confiaba en un margen que ya no
  // existía y perdía el slot sin darse cuenta. La cuenta vive en un solo lugar
  // (`modules/bookings/hold`) justamente para que no vuelva a divergir.
  const expiresAt = holdExpiresAtIso(booking.createdAt)

  return (
    <ReservaDarkShell>
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
        <span className="sr-only">Reserva {params.bookingId}</span>
        <PaymentStatusWatcher
          bookingId={params.bookingId}
          initialStatus={booking.status}
          expiresAt={expiresAt}
        />
      </div>
    </ReservaDarkShell>
  )
}
