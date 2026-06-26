import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { capitalizeFirst } from '@/lib/format'
import { getBookingDetail, getBookingCharges } from '../queries'
import BookingActions from './BookingActions'
import BookingCharges from './BookingCharges'
import AbonadoCharges from './AbonadoCharges'

const CHARGEABLE_STATUSES = new Set(['confirmed', 'completed', 'no_show'])

const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Pago pendiente', confirmed: 'Confirmada', completed: 'Completada',
  no_show: 'Ausente', canceled_refunded: 'Cancelada (con reembolso)',
  canceled_no_refund: 'Cancelada (sin reembolso)', expired: 'Expirada',
}

function formatARS(cents: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(cents / 100)
}
function formatDate(dateStr: string): string {
  return capitalizeFirst(
    new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }),
  )
}

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

  const rows: Array<[string, string]> = [
    ['Fecha', `${formatDate(booking.date)} · ${booking.timeStart.slice(0, 5)}–${booking.timeEnd.slice(0, 5)}`],
    ['Cancha', booking.courtName],
    ['Cliente', booking.playerName ?? booking.guestName ?? '—'],
    ['Teléfono', booking.playerPhone ?? booking.guestPhone ?? '—'],
    ['Estado', STATUS_LABELS[booking.status] ?? booking.status],
    ['Precio', formatARS(booking.priceSnapshot)],
    ['Seña', booking.depositAmount > 0 ? `${formatARS(booking.depositAmount)} (${booking.depositStatus})` : 'Sin seña'],
    ['Método de pago', booking.paymentMethod ?? '—'],
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
          <div className="mt-4 border-t border-slate-100 pt-4">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Nota del jugador</dt>
            <dd className="mt-1 text-sm text-foreground">{booking.notesPlayer}</dd>
          </div>
        )}
        {booking.canceledReason && (
          <div className="mt-4 border-t border-slate-100 pt-4">
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
