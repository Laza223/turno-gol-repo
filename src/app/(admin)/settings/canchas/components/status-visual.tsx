import { Ban, CheckCircle2 } from 'lucide-react'
import { StatusBadge, type StatusBadgeVisual } from '@/components/ui/status-badge'
import type { CourtRow } from '@/modules/courts/court.types'

type CourtStatus = CourtRow['status']

export type CourtStatusVisual = StatusBadgeVisual

/** Vocabulario §8.5: "Online"/"Offline" son el vocabulario ya establecido del
 * producto (court_status enum + fixture de e2e canchas-crud), no una etiqueta
 * es-AR alternativa. */
const STATUS_VISUALS: Record<CourtStatus, CourtStatusVisual> = {
  online: {
    icon: CheckCircle2,
    label: 'Online',
    tone: 'success',
  },
  offline: {
    // Ban: mismo ícono que MASTER §2.6 asigna a "Bloqueado / cancha offline".
    icon: Ban,
    label: 'Offline',
    tone: 'neutral',
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
  return <StatusBadge visual={courtStatusVisual(status)} className={className} />
}
