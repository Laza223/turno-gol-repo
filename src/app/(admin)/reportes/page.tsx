import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { BarChart3, CalendarCheck, Download, SlidersHorizontal, TrendingUp, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { StatCard } from '@/components/admin/StatCard'
import { ResponsiveList } from '@/components/ui/responsive-list'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getRevenueReport } from '@/modules/reports/report.service'
import {
  computeDelta,
  formatMethodLabel,
  getMonthBounds,
  prevMonthStr,
  nextMonthStr,
  formatMonthLabel,
  isReportEmpty,
} from '@/modules/reports/report.utils'
import { formatArsContable } from '@/lib/format'
import { GhostKpis } from './GhostKpis'
import { OccupancyChart, TrendChart } from './ReportCharts'

/** Formato contable con signo (§2.5/§8.2): negativos en `−$ X,00` + `text-destructive`. */
function signedArsContable(cents: number): ReactNode {
  if (cents < 0) {
    return <span className="text-destructive">{'−'}{formatArsContable(-cents)}</span>
  }
  return formatArsContable(cents)
}

function currentMonthStr(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

function isValidMonth(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export default async function ReportesPage(
  props: {
    searchParams: Promise<{ month?: string | string[] }>
  }
) {
  const searchParams = await props.searchParams;
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

  const incomeDelta = report.prevPeriod ? computeDelta(report.income, report.prevPeriod.income) : null
  const balanceDelta = report.prevPeriod ? computeDelta(report.balance, report.prevPeriod.balance) : null

  return (
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

            <span className="min-w-44 text-center text-sm font-medium text-foreground">
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
        <GhostKpis />
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="Ingresos"
              value={formatArsContable(report.income)}
              icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
              accent="emerald"
              delta={incomeDelta ?? undefined}
            />
            <StatCard
              label="Ajustes"
              value={signedArsContable(report.adjustment)}
              icon={<SlidersHorizontal className="h-4 w-4" aria-hidden="true" />}
              accent="slate"
            />
            <StatCard
              label="Saldo"
              value={signedArsContable(report.balance)}
              icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
              accent={report.balance >= 0 ? 'emerald' : 'red'}
              delta={balanceDelta ?? undefined}
              className={report.balance >= 0 ? 'ring-1 ring-emerald-600/20' : undefined}
            />
            <StatCard
              label="Reservas"
              value={report.bookingCount.toLocaleString('es-AR')}
              icon={<CalendarCheck className="h-4 w-4" aria-hidden="true" />}
              accent="slate"
            />
          </div>

          {/* Tendencia mensual */}
          {report.prevPeriod && (
            <TrendChart current={{ income: report.income, balance: report.balance }} prev={report.prevPeriod} />
          )}

          {/* Ocupación por cancha */}
          {report.byCourt.length > 0 && <OccupancyChart byCourt={report.byCourt} />}

          {/* By court */}
          {report.byCourt.length > 0 && (
            <ResponsiveList
              className="overflow-hidden shadow-xs"
              header={
                <div className="border-b border-border px-6 py-4">
                  <h2 className="text-sm font-semibold text-foreground">Por cancha</h2>
                </div>
              }
              cards={
                <ul className="divide-y divide-border">
                  {report.byCourt.map((c) => (
                    <li key={c.courtId} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{c.courtName}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.bookingCount} reservas · {c.occupancyPct}% ocupación
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                        {formatArsContable(c.income)}
                      </p>
                    </li>
                  ))}
                </ul>
              }
              table={
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <th className="px-6 py-3 text-left">Cancha</th>
                      <th className="px-6 py-3 text-right">Ingresos</th>
                      <th className="px-6 py-3 text-right">Reservas</th>
                      <th className="px-6 py-3 text-right">Ocupación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.byCourt.map((c) => (
                      <tr key={c.courtId}>
                        <td className="px-6 py-3 text-foreground">{c.courtName}</td>
                        <td className="px-6 py-3 text-right tabular-nums text-foreground">
                          {formatArsContable(c.income)}
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
              }
            />
          )}

          {/* By payment method */}
          {report.byMethod.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
              <div className="border-b border-border px-6 py-4">
                <h2 className="text-sm font-semibold text-foreground">Por método de pago</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <th className="px-6 py-3 text-left">Método</th>
                      <th className="px-6 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.byMethod.map((m) => (
                      <tr key={m.method}>
                        <td className="px-6 py-3 text-foreground">{formatMethodLabel(m.method)}</td>
                        <td className="px-6 py-3 text-right tabular-nums text-foreground">
                          {formatArsContable(m.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* CSV export — pointless on an empty month, so hidden with the empty state */}
      {!isEmpty && (
        <div className="flex justify-end">
          <a
            href={`/api/reports/revenue?from=${csvFrom}&to=${csvTo}&format=csv`}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-xs hover:bg-accent"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Exportar CSV
          </a>
        </div>
      )}
    </div>
  )
}
