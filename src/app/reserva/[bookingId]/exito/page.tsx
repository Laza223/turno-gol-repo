import { redirect } from 'next/navigation'
import Link from 'next/link'
import { sql } from 'drizzle-orm'
import { CheckCircle2 } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import PaymentStatusWatcher from '@/components/booking/PaymentStatusWatcher'

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
             t.name AS "tenantName"
      FROM bookings b
      JOIN courts c ON c.id = b.court_id
      JOIN tenants t ON t.id = b.tenant_id
      WHERE b.id = ${bookingId} LIMIT 1
    `)) as unknown as BookingRow[]
    return rows[0] ?? null
  })
}

function fmtArs(cents: number): string {
  return (Math.round(cents) / 100).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default async function ReservaExitoPage({ params }: Props) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') redirect('/login')

  const booking = await loadBooking(params.bookingId, user.playerId)

  if (!booking) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 py-12 text-center">
        <p className="text-sm text-slate-600">No encontramos tu reserva.</p>
        <Link href="/mis-reservas" className="mt-8 inline-flex h-11 items-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors">
          Ver mis reservas
        </Link>
      </div>
    )
  }

  // Player returned from MP before webhook landed — hand off to watcher
  if (booking.status !== 'confirmed') {
    const expiresAt = new Date(new Date(booking.createdAt).getTime() + 15 * 60 * 1000).toISOString()
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 py-12 text-center">
        <PaymentStatusWatcher
          bookingId={params.bookingId}
          initialStatus={booking.status}
          expiresAt={expiresAt}
        />
      </div>
    )
  }

  const remainingAmount = booking.priceSnapshot - booking.depositAmount

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
        <CheckCircle2 className="h-8 w-8 text-emerald-700" aria-hidden />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">¡Reserva confirmada!</h1>
      <p className="mt-3 text-sm text-slate-600">
        {booking.tenantName} · {booking.courtName}<br />
        {booking.date} · {booking.timeStart.slice(0, 5)}–{booking.timeEnd.slice(0, 5)}
      </p>
      {booking.depositStatus === 'not_required' ? (
        <p className="mt-4 text-sm text-slate-600">
          Pagás ${fmtArs(booking.priceSnapshot)} al llegar al complejo.
        </p>
      ) : (
        <div className="mt-4 space-y-1 text-sm text-slate-600">
          <p>Seña pagada: ${fmtArs(booking.depositAmount)}</p>
          <p>Resta abonar en el complejo: ${fmtArs(remainingAmount)}</p>
        </div>
      )}
      <Link
        href="/mis-reservas"
        className="mt-8 inline-flex h-11 items-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
      >
        Ver mis reservas
      </Link>
    </div>
  )
}
