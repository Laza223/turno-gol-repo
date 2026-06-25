import { redirect } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import PaymentStatusWatcher from '@/components/booking/PaymentStatusWatcher'
import ReservaDarkShell from '@/components/booking/ReservaDarkShell'

type Props = { params: { bookingId: string } }

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

export default async function ReservaPendientePage({ params }: Props) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') redirect('/ingresar')

  const booking = await loadBooking(params.bookingId, user.playerId)

  if (!booking) {
    return (
      <ReservaDarkShell>
        <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
          <p className="text-sm text-slate-400">No encontramos tu reserva. Revisá tus reservas en el panel.</p>
        </div>
      </ReservaDarkShell>
    )
  }

  const expiresAt = new Date(new Date(booking.createdAt).getTime() + 15 * 60 * 1000).toISOString()

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
