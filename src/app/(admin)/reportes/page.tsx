import { redirect } from 'next/navigation'
import { Download } from 'lucide-react'
import { PinGate } from '@/components/pin-gate'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getRevenueReport } from '@/modules/reports/report.service'
import {
  getMonthBounds,
  prevMonthStr,
  nextMonthStr,
  formatMonthLabel,
} from '@/modules/reports/report.utils'

function formatARS(cents: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(cents / 100)
}

function pctBadge(current: number, prev: number): string | null {
  if (prev === 0) return null
  const delta = Math.round(((current - prev) / prev) * 100)
  return delta >= 0 ? `↑ ${delta}%` : `↓ ${Math.abs(delta)}%`
}

function currentMonthStr(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

function isValidMonth(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s)
}

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: { month?: string | string[] }
}) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const rawMonth = typeof searchParams.month === 'string' ? searchParams.month : ''
  const month = isValidMonth(rawMonth) ? rawMonth : currentMonthStr()
  const prev = prevMonthStr(month)
  const next = nextMonthStr(month)
  const { from, to } = getMonthBounds(month)
  const { from: prevFrom, to: prevTo } = getMonthBounds(prev)

  const report = await getRevenueReport(
    tenant.id,
    from,
    to,
    tenant.openingHours,
    prevFrom,
    prevTo,
    tenant.closedDates,
  )

  const isEmpty = report.income === 0 && report.bookingCount === 0

  // CSV covers [from, last day of month] inclusive
  const csvFrom = from.toISOString().split('T')[0]
  const csvTo = new Date(to.getTime() - 86400000).toISOString().split('T')[0]

  const kpis = [
    {
      label: 'Ingresos',
      value: formatARS(report.income),
      change: report.prevPeriod ? pctBadge(report.income, report.prevPeriod.income) : null,
    },
    { label: 'Ajustes', value: formatARS(report.adjustment), change: null },
    {
      label: 'Balance',
      value: formatARS(report.balance),
      change: report.prevPeriod ? pctBadge(report.balance, report.prevPeriod.balance) : null,
    },
    { label: 'Reservas', value: String(report.bookingCount), change: null },
  ]

  const hasPin = !!tenant.settings.staff_pin_hash

  const content = (
    <div className="space-y-6">
      {/* Header + month navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Reportes</h1>

        <div className="flex items-center gap-2">
          <form method="get" action="/reportes">
            <input type="hidden" name="month" value={prev} />
            <button
              type="submit"
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              aria-label="Mes anterior"
            >
              ←
            </button>
          </form>

          <span className="min-w-[11rem] text-center text-sm font-medium capitalize text-slate-700">
            {formatMonthLabel(month)}
          </span>

          <form method="get" action="/reportes">
            <input type="hidden" name="month" value={next} />
            <button
              type="submit"
              disabled={next > currentMonthStr()}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Mes siguiente"
            >
              →
            </button>
          </form>
        </div>
      </div>

      {isEmpty ? (
        <p className="text-sm text-slate-500">Sin movimientos en este período.</p>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {kpis.map(({ label, value, change }) => (
              <div
                key={label}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {label}
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</p>
                {change && (
                  <p
                    className={
                      'mt-0.5 text-xs ' +
                      (change.startsWith('↑') ? 'text-emerald-600' : 'text-red-600')
                    }
                  >
                    {change} vs mes ant.
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* By court */}
          {report.byCourt.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-4">
                <h2 className="text-sm font-semibold text-slate-900">Por cancha</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="px-6 py-3 text-left">Cancha</th>
                    <th className="px-6 py-3 text-right">Ingresos</th>
                    <th className="px-6 py-3 text-right">Reservas</th>
                    <th className="px-6 py-3 text-right">Ocupación</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byCourt.map((c) => (
                    <tr key={c.courtId} className="border-b border-slate-50 last:border-0">
                      <td className="px-6 py-3 text-slate-700">{c.courtName}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-slate-700">
                        {formatARS(c.income)}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-slate-700">
                        {c.bookingCount}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-slate-700">
                        {c.occupancyPct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* By payment method */}
          {report.byMethod.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-4">
                <h2 className="text-sm font-semibold text-slate-900">Por método de pago</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="px-6 py-3 text-left">Método</th>
                    <th className="px-6 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byMethod.map((m) => (
                    <tr key={m.method} className="border-b border-slate-50 last:border-0">
                      <td className="px-6 py-3 capitalize text-slate-700">{m.method}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-slate-700">
                        {formatARS(m.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* CSV export */}
      <div className="flex justify-end">
        <a
          href={`/api/reports/revenue?from=${csvFrom}&to=${csvTo}&format=csv`}
          className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Exportar CSV
        </a>
      </div>
    </div>
  )

  return <PinGate pinRequired={hasPin}>{content}</PinGate>
}
