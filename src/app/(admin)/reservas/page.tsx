import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarX } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { listTenantBookings } from './queries'
import { EmptyState } from '@/components/ui/empty-state'

const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Pago pendiente',
  confirmed: 'Confirmada',
  completed: 'Completada',
  no_show: 'Ausente',
  canceled_refunded: 'Cancelada',
  canceled_no_refund: 'Cancelada',
  expired: 'Expirada',
}
const STATUS_CLASSES: Record<string, string> = {
  pending_payment: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  confirmed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  completed: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  no_show: 'bg-red-50 text-red-700 ring-red-600/20',
  canceled_refunded: 'bg-slate-100 text-slate-500 ring-slate-500/20',
  canceled_no_refund: 'bg-slate-100 text-slate-500 ring-slate-500/20',
  expired: 'bg-slate-100 text-slate-500 ring-slate-500/20',
}
const FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'confirmed', label: 'Confirmadas' },
  { value: 'pending_payment', label: 'Pago pendiente' },
  { value: 'completed', label: 'Completadas' },
  { value: 'no_show', label: 'Ausentes' },
]
// #30: allowlist de estados filtrables. Un ?status fuera de este set (texto
// basura o un enum no listado) reventaba el cast `${status}::booking_status`
// en la query -> 500/error.tsx. Lo degradamos a "sin filtro" (Todas).
const ALLOWED_STATUS = new Set(FILTERS.map((f) => f.value).filter(Boolean))

function formatARS(cents: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(cents / 100)
}
function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

type Props = { searchParams: { status?: string } }

export default async function ReservasPage({ searchParams }: Props) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')
  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const requested = searchParams.status ?? ''
  const status = ALLOWED_STATUS.has(requested) ? requested : ''
  const rows = await withTenantContext(tenant.id, (tx) =>
    listTenantBookings(tenant.id, status ? { status } : {}, tx),
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">Reservas</h1>
        <Link href="/grilla" className="inline-flex h-9 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors">
          Ir a la grilla
        </Link>
      </div>

      <nav className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = status === f.value
          const href = f.value ? `/reservas?status=${f.value}` : '/reservas'
          return (
            <Link key={f.label} href={href}
              className={'rounded-full px-3 py-1.5 text-xs font-medium transition-colors ' +
                (active ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50')}>
              {f.label}
            </Link>
          )
        })}
      </nav>

      {rows.length === 0 ? (
        <EmptyState icon={CalendarX} title="Sin reservas" description="No hay reservas para los filtros seleccionados." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Cancha</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Precio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/reservas/${r.id}`} className="font-medium text-emerald-700 hover:underline tabular-nums">
                      {formatDate(r.date)} · {r.timeStart.slice(0, 5)}–{r.timeEnd.slice(0, 5)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{r.courtName}</td>
                  <td className="px-4 py-3 text-slate-700">{r.playerName ?? r.guestName ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ' + (STATUS_CLASSES[r.status] ?? STATUS_CLASSES.completed)}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatARS(r.priceSnapshot)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
