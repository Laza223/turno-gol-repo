import { redirect } from 'next/navigation'
import Link from 'next/link'
import { sql } from 'drizzle-orm'
import { CheckCircle2 } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'

type Props = { params: { bookingId: string } }

export const dynamic = 'force-dynamic'

async function loadBooking(bookingId: string, playerId: string) {
  return withPlayerContext(playerId, async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT b.status, b.date::text AS date, b.time_start::text AS time_start, b.time_end::text AS time_end,
             c.name AS court_name, t.name AS tenant_name
      FROM bookings b JOIN courts c ON c.id = b.court_id JOIN tenants t ON t.id = b.tenant_id
      WHERE b.id = ${bookingId} LIMIT 1
    `)) as unknown as Array<{ status: string; date: string; time_start: string; time_end: string; court_name: string; tenant_name: string }>
    return rows[0] ?? null
  })
}

export default async function ReservaExitoPage({ params }: Props) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') redirect(`/login`)
  const booking = await loadBooking(params.bookingId, user.playerId)

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
        <CheckCircle2 className="h-8 w-8 text-emerald-700" aria-hidden />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">¡Reserva confirmada!</h1>
      {booking ? (
        <p className="mt-3 text-sm text-slate-600">
          {booking.tenant_name} · {booking.court_name}<br />
          {booking.date} · {booking.time_start.slice(0, 5)}–{booking.time_end.slice(0, 5)}
        </p>
      ) : (
        <p className="mt-3 text-sm text-slate-600">Tu pago fue procesado.</p>
      )}
      <Link href="/mis-reservas" className="mt-8 inline-flex h-11 items-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors">
        Ver mis reservas
      </Link>
    </div>
  )
}
