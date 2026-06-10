import { useEffect, useState } from 'react'

export type ArtNow = { date: string; time: string }

/** Fecha/hora actuales en ART (UTC-3) como `{ date: 'YYYY-MM-DD', time: 'HH:MM' }`. */
function computeArtNow(): ArtNow {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000)
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) }
}

/**
 * Hora ART que se auto-refresca cada minuto (#29).
 *
 * Sin el refresco periodico, una grilla abierta sin recargar conserva el
 * `artNow` del primer render: un slot que ya transcurrio seguiria mostrandose
 * como futuro/clickeable y el admin podria intentar crear una reserva en un
 * horario pasado. Arranca con strings vacios para no romper la hidratacion SSR
 * (el efecto solo corre en cliente).
 */
export function useArtNow(): ArtNow {
  const [artNow, setArtNow] = useState<ArtNow>({ date: '', time: '' })

  useEffect(() => {
    setArtNow(computeArtNow())
    const id = setInterval(() => setArtNow(computeArtNow()), 60_000)
    return () => clearInterval(id)
  }, [])

  return artNow
}
