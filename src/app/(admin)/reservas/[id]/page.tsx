import type { ReactNode } from 'react'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { formatArs, formatDateLong, formatTime } from '@/lib/format'
import { getBookingDetail, getBookingCharges } from '../queries'
import { reservaStatusVisual, ReservaStatusBadge } from '../status-visual'
import BookingActions from './BookingActions'
import BookingCharges from './BookingCharges'
import AbonadoCharges from './AbonadoCharges'

const CHARGEABLE_STATUSES = new Set(['confirmed', 'completed', 'no_show'])

type Props = { params: { id: string } }

export default async function ReservaDetailPage({ params }: Props) {
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

  const visual = reservaStatusVisual(booking)
  const depositLabel: Record<string, string> = {
    paid: 'pagada',
    captured: 'pagada',
    pending: 'pendiente',
    refunded: 'reembolsada',
  }
  const methodLabel: Record<string, string> = {
    cash: 'Efectivo',
    transfer: 'Transferencia',
    mercadopago: 'MercadoPago',
    other: 'Otro',
  }

  const rows: Array<[string, ReactNode]> = [
    ['Fecha', `${formatDateLong(booking.date)} · ${formatTime(booking.timeStart)}–${formatTime(booking.timeEnd)}`],
    ['Cancha', booking.courtName],
    ['Cliente', booking.playerName ?? booking.guestName ?? '—'],
    ['Teléfono', booking.playerPhone ?? booking.guestPhone ?? '—'],
    ['Estado', <ReservaStatusBadge key="estado" visual={visual} />],
    ['Precio', formatArs(booking.priceSnapshot)],
    [
      'Seña',
      booking.depositAmount > 0
        ? `${formatArs(booking.depositAmount)} (${depositLabel[booking.depositStatus] ?? booking.depositStatus})`
        : 'Sin seña',
    ],
    ['Método de pago', booking.paymentMethod ? (methodLabel[booking.paymentMethod] ?? booking.paymentMethod) : '—'],
  ]

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/reservas" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Reservas
      </Link>
      <h1 className="text-2xl font-semibold text-foreground">Detalle de la reserva</h1>

      <div className="card-premium rounded-xl p-6">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
              <dd className="text-sm font-medium text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
        {booking.notesPlayer && (
          <div className="mt-4 border-t border-border pt-4">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Nota del jugador</dt>
            <dd className="mt-1 text-sm text-foreground">{booking.notesPlayer}</dd>
          </div>
        )}
        {booking.canceledReason && (
          <div className="mt-4 border-t border-border pt-4">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Motivo de cancelación</dt>
            <dd className="mt-1 text-sm text-foreground">{booking.canceledReason}</dd>
          </div>
        )}
      </div>

      {booking.type === 'fixed' && booking.abonadoId && (
        <AbonadoCharges
          bookingId={booking.id}
          priceSnapshot={booking.priceSnapshot}
          creditApplied={booking.creditApplied}
          abonadoCreditBalance={booking.abonadoCreditBalance ?? 0}
          status={booking.status}
        />
      )}

      {charges && (
        <BookingCharges
          bookingId={booking.id}
          priceSnapshot={booking.priceSnapshot}
          depositAmount={booking.depositAmount}
          depositStatus={booking.depositStatus}
          charges={charges.charges}
          chargesTotal={charges.chargesTotal}
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
        cancellationPolicyHours={booking.cancellationPolicyHours}
      />
    </div>
  )
}
