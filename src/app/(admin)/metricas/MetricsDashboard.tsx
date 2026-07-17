'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowDownRight, ArrowUpRight, RefreshCw } from 'lucide-react'
import type { TenantMetrics } from '@/modules/metrics/metrics.service'
import type { SystemStatus } from '@/app/api/admin/system-status/route'
import { useChartTheme } from '@/components/admin/useChartTheme'
import {
  dayLabel,
  formatARS,
  groupRevenue,
  noShowTrend,
  relativeTimeEs,
  type RevenueGranularity,
} from './dashboard-helpers'

const REFRESH_INTERVAL_MS = 60_000

const GRANULARITY_LABELS: Record<RevenueGranularity, string> = {
  day: 'Día',
  week: 'Semana',
  month: 'Mes',
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-premium rounded-lg p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  )
}

/** Card "Tasa de ausencias": tasa actual + tendencia vs los 30 días previos. */
function NoShowCard({ metrics }: { metrics: TenantMetrics }) {
  const trend = noShowTrend(metrics.noShow, metrics.noShowPrev)
  const ratePct = (metrics.noShow.rate * 100).toFixed(1).replace('.', ',')

  return (
    <Card title="Tasa de ausencias">
      <p className="text-3xl font-semibold tabular-nums text-foreground">{ratePct}%</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {metrics.noShow.noShow} ausencias sobre {metrics.noShow.finished} turnos terminados
      </p>
      <div className="mt-2 text-xs">
        {trend.kind === 'no_prev' && <span className="text-muted-foreground">sin datos previos</span>}
        {trend.kind === 'flat' && <span className="text-muted-foreground">sin cambios vs período anterior</span>}
        {trend.kind === 'up' && (
          <span className="inline-flex items-center gap-1 font-medium text-red-600 dark:text-red-400">
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            +{String(trend.deltaPts).replace('.', ',')} pts vs período anterior
          </span>
        )}
        {trend.kind === 'down' && (
          <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
            <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
            {String(trend.deltaPts).replace('.', ',')} pts vs período anterior
          </span>
        )}
      </div>
    </Card>
  )
}

/** BarChart de ingresos con toggle día/semana/mes (agregación client-side). */
function RevenueChart({
  metrics,
  isAnimationActive,
}: {
  metrics: TenantMetrics
  isAnimationActive: boolean
}) {
  const [granularity, setGranularity] = useState<RevenueGranularity>('day')
  const data = groupRevenue(metrics.revenuePerDay, granularity)
  const chart = useChartTheme()

  return (
    <div className="card-premium rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Ingresos</h2>
        <div className="flex gap-1" role="group" aria-label="Agrupar ingresos por">
          {(Object.keys(GRANULARITY_LABELS) as RevenueGranularity[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGranularity(g)}
              aria-pressed={granularity === g}
              className={
                'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ' +
                (granularity === g
                  ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'border-border text-muted-foreground hover:bg-accent')
              }
            >
              {GRANULARITY_LABELS[g]}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Total del período: {formatARS(metrics.revenue.totalCents)}
      </p>
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: chart.axis }} interval="preserveStartEnd" />
            <YAxis
              tick={{ fontSize: 11, fill: chart.axis }}
              tickFormatter={(v: number) => formatARS(v)}
              width={90}
            />
            <Tooltip
              formatter={(value) => [formatARS(Number(value)), 'Ingresos']}
              labelStyle={chart.tooltip.labelStyle}
              contentStyle={chart.tooltip.contentStyle} itemStyle={chart.tooltip.itemStyle}
            />
            <Bar dataKey="amountCents" fill={chart.primary} radius={[3, 3, 0, 0]} isAnimationActive={isAnimationActive} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/**
 * "Primera-vez espectral" (§7.2 MASTER) del ranking de horarios: mismo espíritu
 * que GhostKpis en reportes/page.tsx (barras/valores fantasma + aria-hidden,
 * con el CTA real debajo), replicado acá en chico en vez de extraído a
 * compartido — el pedido explícitamente evita ese refactor.
 *
 * Diferencia deliberada con GhostKpis: acá NO se usa `opacity-50` sobre el
 * texto. `text-foreground` (slate-950) al 50% de opacidad compone ~3.79:1
 * contra el fondo blanco — bajo el mínimo AA 4.5:1 (axe lo marca real
 * violation, no "incomplete"). El look "fantasma" sale de usar colores
 * naturalmente atenuados (`text-muted-foreground`, ya AA en el resto de la
 * app) y opacidad solo en el relleno de la barra (decorativo, sin texto).
 */
function GhostTopSlots() {
  const ghosts = [
    { time: '20:00', pct: 100 },
    { time: '19:00', pct: 82 },
    { time: '21:00', pct: 68 },
    { time: '18:00', pct: 45 },
    { time: '22:00', pct: 30 },
  ]
  return (
    <div>
      <ul className="space-y-2 select-none" aria-hidden="true">
        {ghosts.map((g) => (
          <li key={g.time} className="flex items-center gap-3 text-sm">
            <span className="w-12 shrink-0 font-medium tabular-nums text-muted-foreground">{g.time}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-emerald-500 opacity-40"
                style={{ width: `${g.pct}%` }}
              />
            </span>
            <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">-</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted-foreground">
        Así se van a ver tus horarios más reservados.
      </p>
      <Link
        href="/grilla"
        className="mt-1 inline-block text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
      >
        Cargá tu primera reserva desde la grilla
      </Link>
    </div>
  )
}

/** Top 5 horarios de inicio más reservados, como barras horizontales simples. */
function TopSlots({ metrics }: { metrics: TenantMetrics }) {
  const max = Math.max(1, ...metrics.topSlots.map((s) => s.count))
  return (
    <Card title="Top 5 horarios más reservados">
      {metrics.topSlots.length === 0 ? (
        <GhostTopSlots />
      ) : (
        <ul className="space-y-2">
          {metrics.topSlots.map((slot) => (
            <li key={slot.time} className="flex items-center gap-3 text-sm">
              <span className="w-12 shrink-0 font-medium tabular-nums text-foreground">
                {slot.time}
              </span>
              <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.round((slot.count / max) * 100)}%` }}
                />
              </span>
              <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">
                {slot.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** Panel de observabilidad: DB, colas pg-boss y último health ping. */
function SystemPanel({ status, nowMs }: { status: SystemStatus | null; nowMs: number }) {
  const totalDepth = status
    ? status.pgboss.queues.reduce<number | null>(
        (acc, q) => (acc === null || q.depth === null ? null : acc + q.depth),
        0,
      )
    : null

  return (
    <Card title="Estado del sistema">
      {!status ? (
        <p className="text-sm text-muted-foreground">No se pudo consultar el estado del sistema.</p>
      ) : (
        <>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Base de datos</dt>
              <dd>
                {status.db.status === 'ok' ? (
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    Operativa{status.db.latencyMs !== null ? ` · ${status.db.latencyMs} ms` : ''}
                  </span>
                ) : (
                  <span className="font-medium text-red-600 dark:text-red-400">Caída</span>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Trabajos en cola</dt>
              <dd className="font-medium tabular-nums text-foreground">
                {totalDepth === null ? '—' : totalDepth}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Último chequeo de salud</dt>
              <dd className="font-medium text-foreground">
                {status.lastHealthPing ? relativeTimeEs(status.lastHealthPing, nowMs) : '—'}
              </dd>
            </div>
          </dl>
          {/* axe (definition-list): <details> no es un hijo válido de <dl>, tiene que ir afuera. */}
          <details className="pt-1 text-sm">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Detalle por cola
            </summary>
            <ul className="mt-2 space-y-1">
              {status.pgboss.queues.map((q) => (
                <li key={q.queue} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{q.queue}</span>
                  <span className="tabular-nums text-foreground">
                    {q.depth === null ? '—' : q.depth}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </Card>
  )
}

export default function MetricsDashboard({
  canSeeSystem,
  isAnimationActive = true,
}: {
  canSeeSystem: boolean
  /** recharts anima en JS (prefers-reduced-motion no lo frena). Default true: no cambia el comportamiento de la app. */
  isAnimationActive?: boolean
}) {
  const [metrics, setMetrics] = useState<TenantMetrics | null>(null)
  const [system, setSystem] = useState<SystemStatus | null>(null)
  const [error, setError] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const chart = useChartTheme()

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/metrics', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { data: TenantMetrics }
      setMetrics(json.data)
      setError(false)
    } catch {
      // Conservamos los últimos datos buenos; el banner avisa solo si nunca cargó.
      setError(true)
    }
    if (canSeeSystem) {
      try {
        const res = await fetch('/api/admin/system-status', { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as { data: SystemStatus }
        setSystem(json.data)
      } catch {
        setSystem(null)
      }
    }
    setNowMs(Date.now())
  }, [canSeeSystem])

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [load])

  if (!metrics && error) {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-400">
        No pudimos cargar las métricas. Probá de nuevo en unos segundos.
      </div>
    )
  }

  if (!metrics) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Cargando métricas">
        <RefreshCw className="h-6 w-6 animate-spin text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      </div>
    )
  }

  const bookingsData = metrics.bookingsPerDay.map((d) => ({
    label: dayLabel(d.date),
    count: d.count,
  }))

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-300">
          La última actualización falló; estás viendo datos anteriores.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="card-premium rounded-lg p-4">
            <h2 className="text-sm font-semibold text-foreground">Reservas por día</h2>
            <p className="mt-1 text-xs text-muted-foreground">Últimos {metrics.windowDays} días</p>
            <div className="mt-3 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={bookingsData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: chart.axis }}
                    interval="preserveStartEnd"
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: chart.axis }} width={32} />
                  <Tooltip
                    formatter={(value) => [String(value), 'Reservas']}
                    labelStyle={chart.tooltip.labelStyle}
                    contentStyle={chart.tooltip.contentStyle} itemStyle={chart.tooltip.itemStyle}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke={chart.primary}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={isAnimationActive}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        <NoShowCard metrics={metrics} />
      </div>

      <RevenueChart metrics={metrics} isAnimationActive={isAnimationActive} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopSlots metrics={metrics} />
        {canSeeSystem && <SystemPanel status={system} nowMs={nowMs} />}
      </div>
    </div>
  )
}
