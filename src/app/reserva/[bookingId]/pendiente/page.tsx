import { redirect, RedirectType } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { isUuid } from '@/shared/validation/primitives'
import {
  depositPayState,
  holdExpiresAtIso,
  holdPayUntilLabel,
  holdRetryDeadlineMs,
} from '@/lib/booking/hold'
import {
  buildBookingContact,
  buildIngresarForReservaHref,
  buildReservaHref,
} from '@/lib/booking/reserve-url'
import PaymentStatusWatcher from '@/components/booking/PaymentStatusWatcher'
import { retryDepositPaymentAction } from '@/app/(public)/[slug]/reservar/actions'
import { ReservaNotFound } from '../ReservaNotFound'

type Props = {
  params: Promise<{ bookingId: string }>
  searchParams?: Promise<{ payment_id?: string | string[] }>
}

export const dynamic = 'force-dynamic'

async function loadBooking(bookingId: string, playerId: string) {
  return withPlayerContext(playerId, async (tx) => {
    // `mpReady` y `inProcess` salen como booleanos: el token del complejo no viaja nunca.
    const rows = (await tx.execute(sql`
      SELECT b.status, b.created_at AS "createdAt", b.date::text AS date,
             (b.starts_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text AS "startsOn",
             b.time_start::text AS "timeStart", b.time_end::text AS "timeEnd",
             b.deposit_amount AS "depositAmount",
             c.name AS "courtName",
             t.slug AS "tenantSlug", t.name AS "tenantName",
             t.phone AS "tenantPhone", t.whatsapp AS "tenantWhatsapp",
             (t.mp_access_token IS NOT NULL AND t.mp_disconnected_at IS NULL) AS "mpReady",
             EXISTS (
               SELECT 1 FROM payments p WHERE p.booking_id = b.id AND p.status = 'in_process'
             ) AS "inProcess"
      FROM bookings b
      JOIN courts c ON c.id = b.court_id
      JOIN tenants t ON t.id = b.tenant_id
      WHERE b.id = ${bookingId} LIMIT 1
    `)) as unknown as Array<{
      status: string
      createdAt: string
      date: string
      startsOn: string
      timeStart: string
      timeEnd: string
      depositAmount: number
      courtName: string
      tenantSlug: string | null
      tenantName: string
      tenantPhone: string
      tenantWhatsapp: string | null
      mpReady: boolean
      inProcess: boolean
    }>
    return rows[0] ?? null
  })
}

export default async function ReservaPendientePage(props: Props) {
  const params = await props.params
  const searchParams = (await props.searchParams) ?? {}
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

  // Server Component: el cuerpo corre UNA vez por request, en el servidor (igual que error/page).
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  // MercadoPago trae acá (back_url `pending`) a quien pagó y quedó en revisión, con `payment_id` en
  // la URL. Hasta que llega el webhook la fila del pago no dice `in_process`, así que la base sola
  // no lo ve: si MercadoPago dice que hay un pago, no se ofrece otro (sería doble cobro, y TurnoGol
  // no devuelve por API). Sin pago, MercadoPago manda `payment_id=null`.
  const mpPaymentId = [searchParams.payment_id].flat()[0]
  const paidAtMp = mpPaymentId != null && mpPaymentId !== '' && mpPaymentId !== 'null'
  // "Pagar la seña" para quien cortó el pago (cerró MercadoPago, volvió atrás, recargó): solo si la
  // acción lo va a poder cobrar (`depositPayState`, la misma regla que Mis reservas).
  const canPayDeposit = !paidAtMp && depositPayState(booking, now) === 'open'

  // El vencimiento del hold se calcula en un solo lugar (`lib/booking/hold`): el watcher lo usa
  // para cortar la espera y esconder "Pagar la seña" a tiempo, no para mostrar cuánto queda.
  return (
    <PaymentStatusWatcher
      bookingId={params.bookingId}
      initialStatus={booking.status}
      expiresAt={holdExpiresAtIso(booking.createdAt)}
      tenantSlug={booking.tenantSlug}
      date={booking.date}
      turn={{
        startsOn: booking.startsOn,
        timeStart: booking.timeStart,
        timeEnd: booking.timeEnd,
        courtName: booking.courtName,
        tenantName: booking.tenantName,
      }}
      pay={
        canPayDeposit
          ? {
              until: holdPayUntilLabel(booking.createdAt),
              deadline: new Date(holdRetryDeadlineMs(booking.createdAt)).toISOString(),
              action: retryDepositPaymentAction,
            }
          : null
      }
      contact={buildBookingContact(
        { name: booking.tenantName, phone: booking.tenantPhone, whatsapp: booking.tenantWhatsapp },
        {
          id: params.bookingId,
          startsOn: booking.startsOn,
          timeStart: booking.timeStart,
          courtName: booking.courtName,
        },
      )}
    />
  )
}
