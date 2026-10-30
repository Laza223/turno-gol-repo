import { Check } from 'lucide-react'
import { cssVars } from './css-vars'
import s from './landing.module.css'
import type { PitchPlayer } from './pitch-players'

interface PlayerDotProps {
  player: PitchPlayer
  index: number
  /** Lo marca el motor de escenas (la escena Hoy los prende de a uno). */
  scene?: boolean
}

export function PlayerDot({ player, index, scene }: PlayerDotProps) {
  return (
    <span
      className={`${s.pl} ${player.team === 'pe' ? s.pe : s.sp}`}
      style={cssVars({ left: `${player.left}%`, top: `${player.top}%`, '--i': index })}
      data-hoy-player={scene ? '' : undefined}
      aria-hidden="true"
    >
      {player.initial}
    </span>
  )
}

/** Chip "Se juega" (tono success, con tilde) del contador "¡Estamos los 10!". */
export function SeJuegaChip() {
  return (
    <span className={s.sj}>
      <Check aria-hidden="true" strokeWidth={2.6} />
      Se juega
    </span>
  )
}
