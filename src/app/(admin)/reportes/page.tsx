import { redirect } from 'next/navigation'
import { Download, BarChart3 } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { EmptyState } from '@/components/ui/empty-state'
import { PinGate } from '@/components/pin-gate'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getRevenueReport } from '@/modules/reports/report.service'
import {
  getMonthBounds,
  prevMonthStr,
  nextMonthStr,
  formatMonthLabel,
  isReportEmpty,
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

function EmptyReportIllustration() {
  return (
    <svg width="160" height="100" viewBox="0 0 160 100" fill="none" aria-hidden="true">
      <rect x="8" y="8" width="144" height="84" rx="8" className="fill-slate-50 dark:fill-slate-800" />
      <line
        x1="24"
        y1="76"
        x2="136"
        y2="76"
        className="stroke-slate-200 dark:stroke-slate-700"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="32" y="52" width="14" height="24" rx="2" className="fill-emerald-200 dark:fill-emerald-700" />
      <rect x="56" y="40" width="14" height="36" rx="2" className="fill-emerald-300 dark:fill-emerald-600" />
      <rect x="80" y="58" width="14" height="18" rx="2" className="fill-emerald-200 dark:fill-emerald-700" />
      <rect x="104" y="30" width="14" height="46" rx="2" className="fill-emerald-400 dark:fill-emerald-500" />
      <path
        d="M32 46 C 56 28, 84 42, 126 20"
        className="stroke-emerald-500 dark:stroke-emerald-400"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="4 5"
        fill="none"
      />
    </svg>
  )
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

  const isEmpty = isReportEmpty(report)

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
      <PageHeader
        title="Reportes"
        icon={<BarChart3 className="h-6 w-6" aria-hidden="true" />}
        actions={
          <div className="flex items-center gap-2">
          <form method="get" action="/reportes">
            <input type="hidden" name="month" value={prev} />
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
              aria-label="Mes anterior"
            >
              ←
            </button>
          </form>

          <span className="min-w-[11rem] text-center text-sm font-medium text-foreground">
            {formatMonthLabel(month)}
          </span>

          <form method="get" action="/reportes">
            <input type="hidden" name="month" value={next} />
            <button
              type="submit"
              disabled={next > currentMonthStr()}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Mes siguiente"
            >
              →
            </button>
          </form>
          </div>
        }
      />

      {isEmpty ? (
        <EmptyState
          illustration={<EmptyReportIllustration />}
          title="Sin movimientos en este período"
          description="Cuando tu complejo registre reservas y cobros, acá vas a ver los ingresos del mes, el balance, la ocupación de cada cancha y los métodos de pago más usados."
        />
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {kpis.map(({ label, value, change }) => (
              <div
                key={label}
                className="card-premium rounded-lg p-4"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</p>
                {change && (
                  <p
                    className={
                      'mt-0.5 text-xs ' +
                      (change.startsWith('↑') ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')
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
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <div className="border-b border-border px-6 py-4">
                <h2 className="text-sm font-semibold text-foreground">Por cancha</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="px-6 py-3 text-left">Cancha</th>
                    <th className="px-6 py-3 text-right">Ingresos</th>
                    <th className="px-6 py-3 text-right">Reservas</th>
                    <th className="px-6 py-3 text-right">Ocupación</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byCourt.map((c) => (
                    <tr key={c.courtId} className="border-b border-slate-50 last:border-0">
                      <td className="px-6 py-3 text-foreground">{c.courtName}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-foreground">
                        {formatARS(c.income)}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-foreground">
                        {c.bookingCount}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-foreground">
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
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <div className="border-b border-border px-6 py-4">
                <h2 className="text-sm font-semibold text-foreground">Por método de pago</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="px-6 py-3 text-left">Método</th>
                    <th className="px-6 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byMethod.map((m) => (
                    <tr key={m.method} className="border-b border-slate-50 last:border-0">
                      <td className="px-6 py-3 capitalize text-foreground">{m.method}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-foreground">
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

      {/* CSV export — pointless on an empty month, so hidden with the empty state */}
      {!isEmpty && (
        <div className="flex justify-end">
          <a
            href={`/api/reports/revenue?from=${csvFrom}&to=${csvTo}&format=csv`}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-accent"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Exportar CSV
          </a>
        </div>
      )}
    </div>
  )

  return <PinGate pinRequired={hasPin}>{content}</PinGate>
}
