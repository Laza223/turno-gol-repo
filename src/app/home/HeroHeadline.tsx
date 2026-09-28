'use client'

import { useNearby } from './nearby-context'
import { headlineDistance } from './nearby'

/**
 * El titular dice la oferta con un dato real: la distancia a la cancha que
 * muestra la tarjeta de al lado. Sin ubicación (SSR, permiso negado, nada
 * cerca) la última línea es "a un toque.", que habla de reservar y no promete
 * una distancia que no sabemos. Las tres líneas no cambian de forma: el swap
 * no mueve nada de lugar.
 */
export function HeroHeadline() {
  const { state } = useNearby()
  const first = state.status === 'found' ? state.complexes[0] : undefined
  const accent = first ? `${headlineDistance(first.distanceKm)}.` : 'a un toque.'

  return (
    <div>
      <h1 className="font-display text-[clamp(42px,11.5vw,64px)] font-black italic leading-[0.94] tracking-[-0.04em] text-foreground lg:text-[clamp(52px,5.1vw,78px)] dark:[text-shadow:0_12px_60px_rgba(0,0,0,.5)]">
        <span className="block">Tu próxima</span>
        <span className="block">cancha está</span>
        <span
          key={accent}
          className="hero-accent-text block animate-in fade-in-0 duration-300 motion-reduce:animate-none"
        >
          {accent}
        </span>
      </h1>
      <p className="mt-4 max-w-[34rem] text-pretty text-[17px] leading-[1.5] text-muted-foreground lg:mt-5 lg:text-[18px] xl:max-w-none">
        Mirá los turnos libres de hoy y reservá sin llamar a nadie.
      </p>
    </div>
  )
}
