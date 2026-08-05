import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { getBookingDetail, getBookingCharges } from '../queries'
import {
  addBookingChargeAction,
  cancelBookingAction,
  completeAndChargeBookingAction,
  markNoShowAction,
  revertNoShowAction,
} from '../actions'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import { BookingDetailCard } from './BookingDetailCard'
import BookingActions from './BookingActions'
import BookingCharges from './BookingCharges'

const CHARGEABLE_STATUSES = new Set(['confirmed', 'completed', 'no_show'])

type Props = { params: Promise<{ id: string }> }

export default async function ReservaDetailPage(props: Props) {
  const params = await props.params;
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')
  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

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
    <div className="max-w-2xl space-y-6">
      <Link href="/reservas" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Reservas
      </Link>
      <h1 className="text-2xl font-semibold text-foreground">Detalle de la reserva</h1>

      {/*
        Cero queries nuevas: `charges` ya vino del withTenantContext de arriba.
        Sin esto el detalle se contradecía a sí mismo — badge "Jugada" verde
        arriba y "Saldo pendiente: $X" en Cobros, veinte centímetros más abajo.
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
      />

      {charges && (
        <BookingCharges
          bookingId={booking.id}
          priceSnapshot={booking.priceSnapshot}
          depositAmount={booking.depositAmount}
          depositStatus={booking.depositStatus}
          charges={charges.charges}
          chargesTotal={charges.chargesTotal}
          addBookingChargeAction={addBookingChargeAction}
        />
      )}

      <BookingActions
        bookingId={booking.id}
        status={booking.status}
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
      />
    </div>
  )
}
