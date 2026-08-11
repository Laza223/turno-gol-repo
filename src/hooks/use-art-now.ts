'use client'

import { artNowParts } from '@/shared/dates/art'
import { useNowMsAfterHydration } from './use-now'

export type ArtNow = { date: string; time: string }

/** Fecha/hora actuales en ART (UTC-3) como `{ date: 'YYYY-MM-DD', time: 'HH:MM' }`. */
export function computeArtNow(): ArtNow {
  return artNowParts()
}

/**
 * Hora ART que se auto-refresca cada minuto (#29).
 *
 * Sin el refresco periodico, una grilla abierta sin recargar conserva el
 * `artNow` del primer render: un slot que ya transcurrio seguiria mostrandose
 * como futuro/clickeable y el admin podria intentar crear una reserva en un
 * horario pasado.
 *
 * El tick sale de `useNowMsAfterHydration` (un unico setInterval para toda la
 * app) en vez de un `setInterval` propio dentro de un efecto.
 *
 * Se conserva EXACTAMENTE el comportamiento de arranque: `0` en el servidor y
 * durante la hidratacion se mapea a `{ date: '', time: '' }`, igual que el
 * estado inicial del hook viejo. Adelantar ahi la hora real seria un cambio de
 * comportamiento con riesgo: el servidor la calcularia con SU reloj y el cliente
 * con el suyo, y cruzar un minuto entre los dos renders daria hydration mismatch
 * en cada celda del borde de la grilla.
 */
export function useArtNow(): ArtNow {
  return artPartsFrom(useNowMsAfterHydration())
}

const EMPTY_ART_NOW: ArtNow = { date: '', time: '' }

// Memo de un slot: `nowMs` cambia una vez por minuto, pero el componente se
// re-renderiza muchas mas veces. Sin esto, cada render devolveria un OBJETO
// nuevo con el mismo contenido y romperia las deps de todo consumidor que lo
// use en un useMemo/useEffect (el hook viejo devolvia un valor de estado, o sea
// referencia estable entre ticks).
let memoMs = -1
let memoParts: ArtNow = EMPTY_ART_NOW

/**
 * Mismo calculo que `artNowParts`, pero desde un instante dado: UTC-3 fijo
 * (Argentina no tiene horario de verano). `0` = todavia no hidrato.
 */
function artPartsFrom(ms: number): ArtNow {
  if (ms === 0) return EMPTY_ART_NOW
  if (ms === memoMs) return memoParts
  const iso = new Date(ms - 3 * 60 * 60 * 1000).toISOString()
  memoMs = ms
  memoParts = { date: iso.slice(0, 10), time: iso.slice(11, 16) }
  return memoParts
}
