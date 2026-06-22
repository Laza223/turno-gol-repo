import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { capitalizeFirst } from '@/lib/format'
import {
  getPlayerProfile,
  getPlayerStats,
  getPlayerAbonados,
  getPlayerBookingHistory,
} from '../queries'
import DebtPayment from './DebtPayment'
import AbonadoCreditLoader from './AbonadoCreditLoader'

const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Pago pendiente',
  confirmed: 'Confirmada',
  completed: 'Completada',
  no_show: 'Ausente',
  canceled_refunded: 'Cancelada (con reembolso)',
  canceled_no_refund: 'Cancelada (sin reembolso)',
  expired: 'Expirada',
}

const TYPE_LABELS: Record<string, string> = {
  spontaneous: 'Online',
  fixed: 'Abonado',
  block: 'Bloqueo',
}

function formatARS(cents: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(cents / 100)
}

function formatDate(dateStr: string): string {
  return capitalizeFirst(
    new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }),
  )
}

type Props = { params: { playerId: string } }

export default async function JugadorProfilePage({ params }: Props) {
  const auth = await requireOperatorStaff()
  if (!auth.ok) redirect('/dashboard')
  const { tenant } = auth

  const data = await withTenantContext(tenant.id, async (tx) => {
    const profile = await getPlayerProfile(tenant.id, params.playerId, tx)
    if (!profile) return null
    const [stats, abonados, history] = await Promise.all([
      getPlayerStats(tenant.id, params.playerId, tx),
      getPlayerAbonados(tenant.id, params.playerId, tx),
      getPlayerBookingHistory(tenant.id, params.playerId, tx),
    ])
    return { profile, stats, abonados, history }
  })

  if (!data) notFound()
  const { profile, stats, abonados, history } = data

  const statCards: Array<[string, string]> = [
    ['Reservas totales', String(stats.total)],
    ['Completadas', String(stats.completed)],
    ['Ausencias', String(stats.noShow)],
    ['Tasa de ausencia', `${stats.noShowRate}%`],
  ]

  return (
    <div className="max-w-3xl space-y-6 p-6">
      <Link
        href="/jugadores"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden /> Jugadores
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">{profile.name}</h1>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Email</dt>
            <dd className="text-slate-800">{profile.email}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Teléfono</dt>
            <dd className="text-slate-800">{profile.phone ?? '—'}</dd>
          </div>
          {profile.firstSeenAt && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Cliente desde</dt>
              <dd className="text-slate-800">{formatDate(profile.firstSeenAt.slice(0, 10))}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statCards.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <DebtPayment playerId={profile.playerId} balance={profile.balance} />

      <AbonadoCreditLoader playerId={profile.playerId} abonados={abonados} />

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Historial de reservas</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Sin reservas registradas.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {history.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="font-medium text-slate-800">
                    {formatDate(b.date)} · {b.timeStart.slice(0, 5)}–{b.timeEnd.slice(0, 5)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {b.courtName} · {TYPE_LABELS[b.type] ?? b.type}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-slate-700">{formatARS(b.priceSnapshot)}</p>
                  <p className="text-xs text-slate-500">{STATUS_LABELS[b.status] ?? b.status}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
