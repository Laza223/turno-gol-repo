import type { ReactNode } from 'react'
import { StatCard } from '@/components/admin/StatCard'

interface MetricCardProps {
  label: string
  value: string
  icon: ReactNode
  sub?: string
}

/**
 * Card de métrica del dashboard admin. Delega en la primitiva premium
 * `StatCard` (theme-adaptive, icon-halo emerald, hover-lift).
 */
export function MetricCard({ label, value, icon, sub }: MetricCardProps) {
  return <StatCard label={label} value={value} icon={icon} sub={sub} accent="emerald" />
}
