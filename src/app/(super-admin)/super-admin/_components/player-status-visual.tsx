import { Ban, CheckCircle2, EyeOff } from 'lucide-react'
import { StatusBadge, type StatusBadgeVisual } from '@/components/ui/status-badge'
import type { PlayerStatus } from '@/modules/super-admin/players.service'

/**
 * Estado global del jugador → visual (color + ícono + texto). `banned` es el
 * bloqueo de TODA la plataforma; el de un complejo va aparte, en su relación.
 */
const PLAYER_STATUS_VISUALS: Record<PlayerStatus, StatusBadgeVisual> = {
  active: { icon: CheckCircle2, label: 'Activo', tone: 'success' },
  banned: { icon: Ban, label: 'Bloqueado', tone: 'destructive' },
  anonymized: { icon: EyeOff, label: 'Anonimizado', tone: 'neutral' },
}

export function PlayerStatusBadge({
  status,
  className,
}: {
  status: PlayerStatus
  className?: string
}) {
  return <StatusBadge visual={PLAYER_STATUS_VISUALS[status]} className={className} />
}
