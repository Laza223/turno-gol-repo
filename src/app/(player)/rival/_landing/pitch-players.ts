// Los jugadores de ejemplo de la pizarra (hero y escena Hoy). Van aparte de `pitch.tsx` para que ese
// archivo exporte solo componentes (Fast Refresh).

export interface PitchPlayer {
  initial: string
  /** pe = con pechera (esmeralda 700), sp = sin pechera (contorno de tiza). */
  team: 'pe' | 'sp'
  /** Posición en % sobre la cancha de 600×380. */
  left: number
  top: number
}

const M: PitchPlayer = { initial: 'M', team: 'pe', left: 10, top: 50 }
const J: PitchPlayer = { initial: 'J', team: 'pe', left: 25, top: 28.9 }
const L: PitchPlayer = { initial: 'L', team: 'pe', left: 25, top: 71.1 }
const F: PitchPlayer = { initial: 'F', team: 'pe', left: 33.3, top: 36.8 }
const N: PitchPlayer = { initial: 'N', team: 'pe', left: 33.3, top: 63.2 }
const T: PitchPlayer = { initial: 'T', team: 'sp', left: 90, top: 50 }
const R: PitchPlayer = { initial: 'R', team: 'sp', left: 77, top: 26.3 }
const G: PitchPlayer = { initial: 'G', team: 'sp', left: 77, top: 73.7 }
const S: PitchPlayer = { initial: 'S', team: 'sp', left: 66.7, top: 63.2 }

/** Los nueve confirmados del hero, en el orden en que caen. */
export const HERO_PLAYERS: readonly PitchPlayer[] = [M, J, L, F, N, T, R, G, S]
/** Los mismos nueve, en el orden en que "tocan Voy" durante la escena Hoy. */
export const HOY_PLAYERS: readonly PitchPlayer[] = [M, T, J, R, L, G, F, S, N]

/** El hueco "Falta 1" / "+1": va donde faltaba el décimo. */
export const HOLE_POSITION = { left: '66.7%', top: '36.8%' } as const
