import { CircleCheck, Clock } from 'lucide-react'
import {
  LANDING_STATUS_LABEL,
  RIVAL_LANDING_STATUS,
  type LandingPiece,
} from '@/modules/rival/rival-landing-status'
import s from './landing.module.css'

interface StatusChipProps {
  piece: LandingPiece
  /** Texto antes del estado, ej. "Compartir: ". */
  prefix?: string
  className?: string
}

/** Chip de estado ("Ya disponible" / "Próximamente"): color, ícono y texto, leído del mapa de estados. */
export function StatusChip({ piece, prefix = '', className }: StatusChipProps) {
  const status = RIVAL_LANDING_STATUS[piece]
  const Icon = status === 'available' ? CircleCheck : Clock
  return (
    <span
      className={[s.chip, status === 'available' ? s.ok : s.soon, className]
        .filter(Boolean)
        .join(' ')}
    >
      <Icon aria-hidden="true" strokeWidth={2.4} />
      {prefix}
      {LANDING_STATUS_LABEL[status]}
    </span>
  )
}
