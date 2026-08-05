import { CheckCircle2, PauseCircle, XCircle } from 'lucide-react'
import { StatusBadge, type StatusBadgeVisual } from '@/components/ui/status-badge'
import type { AbonadoStatus } from '@/modules/abonados/abonado.types'

export type AbonadoStatusVisual = StatusBadgeVisual

const STATUS_VISUALS: Record<AbonadoStatus, AbonadoStatusVisual> = {
  active: { icon: CheckCircle2, label: 'Activo', tone: 'success' },
  paused: { icon: PauseCircle, label: 'Pausado', tone: 'warning' },
  canceled: { icon: XCircle, label: 'Cancelado', tone: 'neutral' },
}

/** Estado visual del abonado: color + ícono + texto siempre juntos (MASTER §2.6). */
function abonadoStatusVisual(status: AbonadoStatus): AbonadoStatusVisual {
  return STATUS_VISUALS[status]
}

/** Badge de estado (§6.5): ícono + texto, nunca color solo. */
export function AbonadoStatusBadge({
  status,
  className,
}: {
  status: AbonadoStatus
  className?: string
}) {
  return <StatusBadge visual={abonadoStatusVisual(status)} className={className} />
}
