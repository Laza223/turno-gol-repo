import type { ReactNode } from 'react'

interface SaMetricCardProps {
  label: string
  value: string
  icon: ReactNode
  sub?: string
}

/**
 * Card de métrica del panel SuperAdmin — mismo molde que
 * `components/dashboard/metric-card` pero con el acento violeta del panel.
 */
export function SaMetricCard({ label, value, icon, sub }: SaMetricCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-100">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight text-slate-900">
        {value}
      </p>
      {sub && <p className="mt-1.5 text-xs text-slate-500">{sub}</p>}
    </div>
  )
}
