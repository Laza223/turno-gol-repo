import { redirect } from 'next/navigation'
import Link from 'next/link'
import { sql } from 'drizzle-orm'
import { XCircle } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { retryDepositPaymentAction } from '@/app/(public)/[slug]/reservar/actions'
import ReservaDarkShell from '@/components/booking/ReservaDarkShell'

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
  const ctaClass =
    'inline-flex h-12 items-center rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/35 motion-reduce:hover:translate-y-0'

  if (!booking) {
    return (
      <ReservaDarkShell>
        <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400">No encontramos tu reserva.</p>
          <Link href="/mis-reservas" className={`mt-8 ${ctaClass}`}>
            Ver mis reservas
          </Link>
        </div>
      </ReservaDarkShell>
    )
  }

  const now = Date.now()
  const withinWindow =
    booking.status === 'pending_payment' &&
    new Date(booking.createdAt).getTime() + 15 * 60 * 1000 > now

  return (
    <ReservaDarkShell>
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 ring-8 ring-red-100 dark:bg-red-500/15 dark:ring-red-500/10">
          <XCircle className="h-8 w-8 text-red-700 dark:text-red-300" aria-hidden />
        </div>
        <h1 className="font-display text-2xl font-black italic tracking-tight text-slate-900 dark:text-white">El pago no se procesó.</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          El pago fue rechazado o cancelado. Podés intentar de nuevo con otro medio.
        </p>
        <span className="sr-only">Reserva {params.bookingId}</span>
        {withinWindow ? (
          <form action={retryDepositPaymentAction} className="mt-8">
            <input type="hidden" name="bookingId" value={params.bookingId} />
            <button type="submit" className={ctaClass}>
              Reintentar pago
            </button>
          </form>
        ) : (
          <Link href={booking.tenantSlug ? `/${booking.tenantSlug}` : '/'} className={`mt-8 ${ctaClass}`}>
            Reservar de nuevo
          </Link>
        )}
      </div>
    </ReservaDarkShell>
  )
}
