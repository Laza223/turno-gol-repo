import { redirect, RedirectType } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { isUuid } from '@/shared/validation/primitives'
import { holdExpiresAtIso } from '@/lib/booking/hold'
import { buildIngresarForReservaHref, buildReservaHref } from '@/lib/booking/reserve-url'
import PaymentStatusWatcher from '@/components/booking/PaymentStatusWatcher'
import { ReservaNotFound } from '../ReservaNotFound'

type Props = { params: Promise<{ bookingId: string }> }

export const dynamic = 'force-dynamic'

async function loadBooking(bookingId: string, playerId: string) {
  return withPlayerContext(playerId, async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT b.status, b.created_at AS "createdAt", b.date::text AS date, t.slug AS "tenantSlug"
      FROM bookings b
      JOIN tenants t ON t.id = b.tenant_id
      WHERE b.id = ${bookingId} LIMIT 1
    `)) as unknown as Array<{
      status: string
      createdAt: string
      date: string
      tenantSlug: string | null
    }>
    return rows[0] ?? null
  })
}

export default async function ReservaPendientePage(props: Props) {
  const params = await props.params
  const user = await extractAuthUser()
  // Sin sesión (MercadoPago puede devolver al jugador en otro navegador): ingresar y volver acá.
  // Con un id que no es UUID no hay a dónde volver: ingresar a secas.
  if (!user || user.type !== 'player') {
    redirect(
      isUuid(params.bookingId)
        ? buildIngresarForReservaHref(params.bookingId, 'pendiente')
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

  // Ya confirmada (el webhook llegó antes de abrir esta pantalla): no hay nada que esperar.
  if (booking.status === 'confirmed') {
    redirect(buildReservaHref(params.bookingId, 'exito'), RedirectType.replace)
  }

  // El vencimiento del hold se calcula en un solo lugar (`lib/booking/hold`): el watcher lo usa
  // para cortar la espera, no para mostrar cuánto queda.
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
