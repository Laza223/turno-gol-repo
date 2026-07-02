import type { ReactNode } from 'react'
import Link from 'next/link'
import { StatCard } from '@/components/admin/StatCard'

interface MetricCardProps {
  label: string
  value: ReactNode
  icon: ReactNode
  sub?: string
  /** Semáforo financiero §2.5: emerald=entra, amber=pendiente, red=deuda, slate=neutro. */
  accent?: 'emerald' | 'amber' | 'red' | 'slate'
  /** La card entera es el blanco (Fitts) — navega a la vista con el detalle. */
  href?: string
  /** aria-label del link (ej. "Caja de hoy: $ 45.000 — ver caja"). */
  ariaLabel?: string
}

/**
 * KPI del dashboard admin. Delega en la primitiva premium `StatCard`
 * (theme-adaptive, icon-halo, hover-lift) y, con `href`, envuelve la card en
 * un Link block (pages/dashboard.md §2).
 */
export function MetricCard({ label, value, icon, sub, accent = 'emerald', href, ariaLabel }: MetricCardProps) {
  const card = <StatCard label={label} value={value} icon={icon} sub={sub} accent={accent} className="h-full" />
  if (!href) return card
  return (
    <Link
      href={href}
      aria-label={ariaLabel ?? label}
      className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {card}
    </Link>
  )
}
