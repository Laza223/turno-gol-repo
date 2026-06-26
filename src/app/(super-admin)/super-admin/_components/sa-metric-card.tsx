import type { ReactNode } from 'react'
import { StatCard } from '@/components/admin/StatCard'

interface SaMetricCardProps {
  label: string
  value: string
  icon: ReactNode
  sub?: string
}

/**
 * Card de métrica del panel SuperAdmin — misma primitiva premium `StatCard`
 * que el dashboard pero con el acento violeta del panel.
 */
export function SaMetricCard({ label, value, icon, sub }: SaMetricCardProps) {
  return <StatCard label={label} value={value} icon={icon} sub={sub} accent="violet" />
}
