'use client'

import { useState, type CSSProperties } from 'react'
import HeroSearch, { type SearchZona } from '@/components/site/HeroSearch'
import type { CityCount } from '@/modules/tenants/search.service'
import { ComplexWindow } from './ComplexWindow'

/**
 * El buscador del hero y, debajo, la ventana con los complejos de la localidad que muestra el
 * buscador. Los dos leen la misma localidad: la ventana cambia cuando el jugador elige otra.
 */
export function HomeSearch({ cities }: { cities: CityCount[] }) {
  const [zona, setZona] = useState<SearchZona | null>(null)
  return (
    <>
      <div className="home-search home-rise" style={{ '--i': 2 } as CSSProperties}>
        <HeroSearch cities={cities} onZonaChange={setZona} reflejo />
      </div>
      <ComplexWindow zona={zona} />
    </>
  )
}
