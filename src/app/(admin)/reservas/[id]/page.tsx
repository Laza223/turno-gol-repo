import { notFound, redirect } from 'next/navigation'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { isUuid } from '@/shared/validation/primitives'
import { cn } from '@/lib/utils'
import { getBookingDetail, getBookingCharges } from '../queries'
import {
  addBookingChargeAction,
  cancelBookingAction,
  completeAndChargeBookingAction,
  markNoShowAction,
  releaseBlockAction,
  revertNoShowAction,
} from '../actions'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import { BookingDetailCard } from './BookingDetailCard'
import BookingActions from './BookingActions'
import BookingCharges from './BookingCharges'
import { BackLink } from './BackLink'

// H103: 'no_show' AFUERA a propósito — veto de producto "No-show NO es
// deuda" (CLAUDE.md). La Grilla ya no ofrece cobro sobre un ausente
// (slot-visual.ts); este set duplicado dejaba entrar por acá a la única
// puerta que sí lo permitía. El guard homólogo de `addBookingChargeAction`
// (src/app/(admin)/reservas/actions.ts) queda pendiente de alinear — ese
// archivo no es de este paquete.
const CHARGEABLE_STATUSES = new Set(['confirmed', 'completed'])

type Props = { params: Promise<{ id: string }> }

export default async function ReservaDetailPage(props: Props) {
  const params = await props.params
  const auth = await requireOperatorStaff()
  if (!auth.ok) redirect('/login')
  const { tenant } = auth

  // getBookingDetail/getBookingCharges bindean el id a SQL crudo: sin este
  // guard, `/reservas/abc` reventaba el cast en Postgres y mostraba el error
  // boundary de toda la ruta en vez del 404. Mismo patrón que
  // super-admin/tenants/[id]/page.tsx.
  if (!isUuid(params.id)) notFound()

  const { booking, charges } = await withTenantContext(tenant.id, async (tx) => {
    const detail = await getBookingDetail(tenant.id, params.id, tx)
    if (!detail) return { booking: null, charges: null }
    const c = CHARGEABLE_STATUSES.has(detail.status)
      ? await getBookingCharges(tenant.id, params.id, tx)
      : null
    return { booking: detail, charges: c }
  })
  if (!booking) notFound()

  return (
    // 2026-09-17 (pedido del dueño): la página usaba 672px, pegada a la
    // izquierda, y aun así scrolleaba. Con dos columnas en escritorio (la
    // plata a la izquierda, la ficha y las acciones a la derecha) entra entera
    // en una notebook, y ocupa todo el ancho que deja el shell. Sin cobros
    // (turno no cobrable) queda una sola columna: estirar la ficha al ancho
    // completo sería leerla de punta a punta de la pantalla.
    <div className={cn('space-y-6', !charges && 'max-w-3xl')}>
      <div className="space-y-2">
        <BackLink />
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Detalle de la reserva
        </h1>
      </div>

      {/*
        H080: en el teléfono, "Cobros de turno" (con el saldo pendiente y el CTA
        de cobro) va ANTES que la ficha estática — Marcelo entra desde el celu a
        cobrar, no a leer el teléfono. En escritorio es la columna izquierda,
        que es el mismo orden de lectura.
      */}
      <div
        className={cn(
          'grid gap-8',
          charges && 'lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-10',
        )}
      >
        {charges && (
          <div>
            <BookingCharges
              bookingId={booking.id}
              priceSnapshot={booking.priceSnapshot}
              depositAmount={booking.depositAmount}
              depositStatus={booking.depositStatus}
              refundState={booking.refundState}
              charges={charges.charges}
              chargesTotal={charges.chargesTotal}
              addBookingChargeAction={addBookingChargeAction}
            />
          </div>
        )}

        {/*
          Un filete vertical separa las columnas: es la única línea que queda
          de las dos cajas con borde que había (el dueño: "no todo deben ser
          cajas"). En el teléfono, un filete horizontal hace lo mismo.
        */}
        <div
          className={cn(
            'space-y-6',
            charges && 'border-t border-border pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10',
          )}
        >
          {/*
            Cero queries nuevas: `charges` ya vino del withTenantContext de
            arriba. Sin esto el detalle se contradecía a sí mismo — badge
            "Jugada" verde arriba y "Saldo pendiente: $X" en Cobros, veinte
            centímetros más abajo.
          */}
          <BookingDetailCard
            booking={{
              ...booking,
              ...summarizeBookingCharges({
                priceSnapshot: booking.priceSnapshot,
                depositAmount: booking.depositAmount,
                depositStatus: booking.depositStatus,
                chargesTotal: charges?.chargesTotal ?? 0,
              }),
            }}
            // H063: Precio/Seña ya se muestran en "Cobros de turno" (la otra
            // columna) cuando ese bloque existe — no repetir el mismo monto con
            // dos redacciones en dos bloques.
            hideMoneyRows={Boolean(charges)}
          />

          <BookingActions
            bookingId={booking.id}
            status={booking.status}
            type={booking.type}
            depositStatus={booking.depositStatus}
            depositAmount={booking.depositAmount}
            paymentMethod={booking.paymentMethod ?? null}
            bookingDate={booking.date}
            timeStart={booking.timeStart}
            startsAt={booking.startsAt}
            endsAt={booking.endsAt}
            updatedAt={booking.updatedAt}
            cancellationPolicyHours={booking.cancellationPolicyHours}
            guestName={booking.guestName}
            guestPhone={booking.guestPhone}
            playerName={booking.playerName}
            playerPhone={booking.playerPhone}
            priceSnapshot={booking.priceSnapshot}
            chargesTotal={charges?.chargesTotal ?? 0}
            completeAndChargeBookingAction={completeAndChargeBookingAction}
            markNoShowAction={markNoShowAction}
            revertNoShowAction={revertNoShowAction}
            cancelBookingAction={cancelBookingAction}
            releaseBlockAction={releaseBlockAction}
          />
        </div>
      </div>
    </div>
  )
}
