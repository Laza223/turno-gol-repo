import { Ban, CheckCircle2 } from 'lucide-react'
import { StatusBadge, type StatusBadgeVisual } from '@/components/ui/status-badge'
import type { CourtRow } from '@/modules/courts/court.types'

type CourtStatus = CourtRow['status']

export type CourtStatusVisual = StatusBadgeVisual

/** Vocabulario §8.5: court `offline` se dice "Pausada" (MASTER.md:513-514) —
 * el mismo término que ya usa la Grilla para la misma cancha
 * (`GridScroller.tsx`, "(pausada)"). "Activa" es la contraparte natural, y el
 * botón que cambia entre las dos dice "Pausar" / "Reactivar". */
const STATUS_VISUALS: Record<CourtStatus, CourtStatusVisual> = {
  online: {
    icon: CheckCircle2,
    label: 'Activa',
    tone: 'success',
  },
  offline: {
    // Ban: mismo ícono que MASTER §2.6 asigna a "Bloqueado / cancha offline".
    icon: Ban,
    label: 'Pausada',
    tone: 'neutral',
  },
}

function courtStatusVisual(status: CourtStatus): CourtStatusVisual {
  return STATUS_VISUALS[status]
}

/**
 * Qué ve el jugador, al lado de la pastilla. Una cancha pausada no sale en el
 * perfil ni en las búsquedas (`status = 'online'` en public.service) y tampoco
 * acepta turnos nuevos, ni del jugador ni del staff (`lockCourtOrThrow`).
 */
export const COURT_STATUS_HINT: Record<CourtStatus, string> = {
  online: 'Los jugadores la ven y la reservan',
  offline: 'Los jugadores no la ven',
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
