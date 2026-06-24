import Link from 'next/link'
import { redirect } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { CalendarX, RotateCcw } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { CancelBookingButton } from './CancelBookingButton'
import { LeaveReviewButton } from './LeaveReviewButton'

type BookingRow = {
  id: string
  date: string
  time_start: string
  time_end: string
  type: string
  status: string
  price_snapshot: number
  court_name: string
  tenant_name: string
  tenant_slug: string
  has_review: boolean
}

function artToday(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
}

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

function formatARS(centavos: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(
    centavos / 100,
  )
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Confirmado',
  pending_payment: 'Pago pendiente',
  completed: 'Completado',
  canceled_refunded: 'Cancelado',
  canceled_no_refund: 'Cancelado',
  no_show: 'Ausente',
}

const STATUS_CLASSES: Record<string, string> = {
  confirmed: 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20',
  pending_payment: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20',
  completed: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/20',
  canceled_refunded: 'bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-500/20',
  canceled_no_refund: 'bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-500/20',
  no_show: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20',
}

export default async function MisReservasPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') redirect('/ingresar')

  const today = artToday()
  const tab = searchParams.tab === 'historial' ? 'historial' : 'proximos'

  const rows = await withPlayerContext(user.playerId, (tx) =>
    tx.execute(sql`
      SELECT b.id, b.date::text, b.time_start::text, b.time_end::text,
             b.type, b.status, b.price_snapshot,
             c.name AS court_name, t.name AS tenant_name, t.slug AS tenant_slug,
             EXISTS (SELECT 1 FROM reviews r WHERE r.booking_id = b.id) AS has_review
      FROM bookings b
      JOIN courts c ON c.id = b.court_id
      JOIN tenants t ON t.id = b.tenant_id
      WHERE b.player_id = ${user.playerId}
      ORDER BY b.date DESC, b.time_start DESC
      LIMIT 200
    `),
  )

  const allBookings = rows as unknown as BookingRow[]
  const bookings = allBookings.filter((b) =>
    tab === 'proximos' ? b.date >= today : b.date < today,
  )

  return (
    <div className="px-4 py-5 space-y-4 max-w-lg mx-auto">
      <h1 className="text-xl font-semibold text-slate-900">Mis Reservas</h1>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <a
          href="/mis-reservas?tab=proximos"
          className={`flex-1 text-center py-2 text-sm font-medium transition-colors duration-150 ${
            tab === 'proximos'
              ? 'border-b-2 border-emerald-600 text-emerald-700'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          Próximos
        </a>
        <a
          href="/mis-reservas?tab=historial"
          className={`flex-1 text-center py-2 text-sm font-medium transition-colors duration-150 ${
            tab === 'historial'
              ? 'border-b-2 border-emerald-600 text-emerald-700'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          Historial
        </a>
      </div>

      {/* Booking list */}
      {bookings.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-slate-400">
          <CalendarX className="h-10 w-10" />
          <p className="text-sm text-center">
            {tab === 'proximos'
              ? 'No tenés reservas próximas.'
              : 'No tenés reservas en el historial.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {bookings.map((b) => (
            <li
              key={b.id}
              className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{b.court_name}</p>
                  <p className="text-xs text-slate-500">{b.tenant_name}</p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${
                    STATUS_CLASSES[b.status] ?? STATUS_CLASSES.completed
                  }`}
                >
                  {STATUS_LABELS[b.status] ?? b.status}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm text-slate-700 tabular-nums">
                    {formatDate(b.date)} · {b.time_start.slice(0, 5)}–{b.time_end.slice(0, 5)}
                  </p>
                  <p className="text-xs text-slate-500 tabular-nums">{formatARS(b.price_snapshot)}</p>
                </div>

                <div className="flex items-center gap-2">
                  {b.type === 'fixed' && (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/20">
                      Turno fijo
                    </span>
                  )}
                  {b.status === 'confirmed' && (
                    <CancelBookingButton
                      bookingId={b.id}
                      courtName={b.court_name}
                      dateLabel={formatDate(b.date)}
                      timeLabel={`${b.time_start.slice(0, 5)}–${b.time_end.slice(0, 5)}`}
                    />
                  )}
                </div>
              </div>

              {b.status === 'completed' && (
                <div className="flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2">
                  {!b.has_review && (
                    <LeaveReviewButton bookingId={b.id} tenantName={b.tenant_name} />
                  )}
                  <Link
                    href={`/${b.tenant_slug}`}
                    className="inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    Reservar de nuevo
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
