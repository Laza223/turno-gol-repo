'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useChartTheme } from '@/components/admin/useChartTheme'
import { formatArs } from '@/lib/format'
import type { CourtReport, PeriodTotals } from '@/modules/reports/report.types'

/** Barra horizontal de ocupación por cancha. Dato ya presente en `RevenueReport.byCourt`. */
export function OccupancyChart({
  byCourt,
  isAnimationActive = true,
}: {
  byCourt: CourtReport[]
  /** recharts anima en JS (prefers-reduced-motion no lo frena). Default true: no cambia el comportamiento de la app. */
  isAnimationActive?: boolean
}) {
  const chart = useChartTheme()
  const height = Math.max(120, byCourt.length * 44)

  return (
    <div className="card-premium rounded-lg p-4">
      <h2 className="text-sm font-semibold text-foreground">Ocupación de canchas</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Horas reservadas sobre horas disponibles del mes.
      </p>
      <div className="mt-3" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={byCourt}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: chart.axis }}
              tickFormatter={(v: number) => `${v}%`}
            />
            <YAxis
              type="category"
              dataKey="courtName"
              tick={{ fontSize: 11, fill: chart.axis }}
              width={90}
            />
            <Tooltip
              formatter={(value) => [`${value}%`, 'Ocupación']}
              labelStyle={chart.tooltip.labelStyle}
              contentStyle={chart.tooltip.contentStyle}
              itemStyle={chart.tooltip.itemStyle}
              cursor={chart.tooltip.cursor}
            />
            <Bar
              dataKey="occupancyPct"
              fill={chart.primary}
              radius={[0, 4, 4, 0]}
              isAnimationActive={isAnimationActive}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/**
 * Comparativa mes actual vs mes anterior (Ingresos/Saldo). Se omite por completo
 * cuando no hay `prevPeriod` (tenant sin actividad el mes pasado) — no se fabrica
 * una comparativa contra cero.
 */
export function TrendChart({
  current,
  prev,
  isAnimationActive = true,
}: {
  current: { income: number; balance: number }
  prev: PeriodTotals
  /** recharts anima en JS (prefers-reduced-motion no lo frena). Default true: no cambia el comportamiento de la app. */
  isAnimationActive?: boolean
}) {
  const chart = useChartTheme()
  const data = [
    { name: 'Ingresos', actual: current.income, anterior: prev.income },
    { name: 'Saldo', actual: current.balance, anterior: prev.balance },
  ]

  return (
    <div className="card-premium rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Tendencia mensual</h2>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: chart.series[0] }}
              aria-hidden="true"
            />
            Este mes
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: chart.series[1] }}
              aria-hidden="true"
            />
            Mes anterior
          </span>
        </div>
      </div>
      <div className="mt-3 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: chart.axis }} />
            <YAxis
              tick={{ fontSize: 11, fill: chart.axis }}
              tickFormatter={(v: number) => formatArs(v)}
              width={80}
            />
            <Tooltip
              formatter={(value) => [formatArs(Number(value)), '']}
              labelStyle={chart.tooltip.labelStyle}
              contentStyle={chart.tooltip.contentStyle}
              itemStyle={chart.tooltip.itemStyle}
              cursor={chart.tooltip.cursor}
            />
            <Bar
              dataKey="actual"
              name="Este mes"
              fill={chart.series[0]}
              radius={[3, 3, 0, 0]}
              isAnimationActive={isAnimationActive}
            />
            <Bar
              dataKey="anterior"
              name="Mes anterior"
              fill={chart.series[1]}
              radius={[3, 3, 0, 0]}
              isAnimationActive={isAnimationActive}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
