import { Ban, CheckCircle2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CourtRow } from '@/modules/courts/court.types'

type CourtStatus = CourtRow['status']

export type CourtStatusVisual = {
  icon: LucideIcon
  label: string
  badge: string
}

/** Vocabulario §8.5: "Online"/"Offline" son el vocabulario ya establecido del
 * producto (court_status enum + fixture de e2e canchas-crud), no una etiqueta
 * es-AR alternativa. */
const STATUS_VISUALS: Record<CourtStatus, CourtStatusVisual> = {
  online: {
    icon: CheckCircle2,
    label: 'Online',
    badge:
      'bg-success/10 text-emerald-800 ring-1 ring-inset ring-success/25 dark:bg-success/15 dark:text-emerald-300 dark:ring-success/40',
  },
  offline: {
    // Ban: mismo ícono que MASTER §2.6 asigna a "Bloqueado / cancha offline".
    icon: Ban,
    label: 'Offline',
    badge: 'bg-muted text-muted-foreground ring-1 ring-inset ring-border',
  },
}

function courtStatusVisual(status: CourtStatus): CourtStatusVisual {
  return STATUS_VISUALS[status]
}

/** Badge de estado (§6.5): ícono + texto, nunca color solo. */
export function CourtStatusBadge({
  status,
  className,
}: {
  status: CourtStatus
  className?: string
}) {
  const visual = courtStatusVisual(status)
  const Icon = visual.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        visual.badge,
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {visual.label}
    </span>
  )
}
