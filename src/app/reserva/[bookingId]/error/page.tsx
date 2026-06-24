import { redirect } from 'next/navigation'
import Link from 'next/link'
import { sql } from 'drizzle-orm'
import { XCircle } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { retryDepositPaymentAction } from '@/app/(public)/[slug]/reservar/actions'

type Props = { params: { bookingId: string } }

export const dynamic = 'force-dynamic'

async function loadBooking(bookingId: string, playerId: string) {
  return withPlayerContext(playerId, async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT b.status, b.created_at AS "createdAt", t.slug AS "tenantSlug"
      FROM bookings b
      JOIN tenants t ON t.id = b.tenant_id
      WHERE b.id = ${bookingId} LIMIT 1
    `)) as unknown as Array<{ status: string; createdAt: Date; tenantSlug: string | null }>
    return rows[0] ?? null
  })
}

export default async function ReservaErrorPage({ params }: Props) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') redirect('/ingresar')

  const booking = await loadBooking(params.bookingId, user.playerId)

  // Sin reserva (inexistente, purgada por RGPD, o de otro jugador via RLS): no
  // afirmamos "el pago no se procesó"; mostramos un estado neutro como la página
  // hermana de éxito (#44).
  if (!booking) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
        <p className="text-sm text-slate-600">No encontramos tu reserva.</p>
        <Link
          href="/mis-reservas"
          className="mt-8 inline-flex h-11 items-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
        >
          Ver mis reservas
        </Link>
      </div>
    )
  }

  const now = Date.now()
  const withinWindow =
    booking.status === 'pending_payment' &&
    new Date(booking.createdAt).getTime() + 15 * 60 * 1000 > now

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 ring-8 ring-red-50">
        <XCircle className="h-8 w-8 text-red-600" aria-hidden />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">El pago no se procesó.</h1>
      <p className="mt-3 text-sm text-slate-600">
        El pago fue rechazado o cancelado. Podés intentar de nuevo con otro medio.
      </p>
      <span className="sr-only">Reserva {params.bookingId}</span>
      {withinWindow ? (
        <form action={retryDepositPaymentAction} className="mt-8">
          <input type="hidden" name="bookingId" value={params.bookingId} />
          <button
            type="submit"
            className="inline-flex h-11 items-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
          >
            Reintentar pago
          </button>
        </form>
      ) : (
        <Link
          href={booking.tenantSlug ? `/${booking.tenantSlug}` : '/'}
          className="mt-8 inline-flex h-11 items-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
        >
          Reservar de nuevo
        </Link>
      )}
    </div>
  )
}
