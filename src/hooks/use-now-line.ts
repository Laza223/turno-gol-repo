'use client'

import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import type { ArtNow } from '@/hooks/use-art-now'

type Params = {
  artNow: ArtNow
  date: string
  visibleSlots: string[]
}

/**
 * Línea de "ahora" de la grilla + scroll-to-now al cargar (pages/grilla.md §6).
 *
 * Con filas fluidas (`minmax(3.5rem, 1fr)`, variante "Entra entera") ya no hay
 * un alto de fila fijo en rem para calcular un `top` global: en su lugar la
 * línea es un ítem MÁS de la fila de la hora actual (`nowRowIndex`, índice en
 * `visibleSlots`) con un `top` en PORCENTAJE de esa fila (`nowFraction`). El
 * auto-scroll ya no puede estimarse en rem tampoco — mide el DOM real
 * (`nowLineRef` contra `gridScrollRef`) y deja la línea al ~30% del alto del
 * scroller. Corre una vez por fecha (el componente se remonta con key={date}).
 */
export function useNowLine({ artNow, date, visibleSlots }: Params): {
  nowRowIndex: number | null
  nowFraction: number
  gridScrollRef: MutableRefObject<HTMLDivElement | null>
  nowLineRef: MutableRefObject<HTMLDivElement | null>
} {
  const { nowRowIndex, nowFraction } = useMemo(() => {
    const miss = { nowRowIndex: null, nowFraction: 0 } as const
    if (!artNow.date || artNow.date !== date) return miss
    const first = visibleSlots[0]
    if (!first) return miss
    const [nH, nM] = artNow.time.split(':').map(Number)
    const [fH, fM] = first.split(':').map(Number)
    if (nH === undefined || nM === undefined || fH === undefined || fM === undefined) return miss

    const nowMins = nH * 60 + nM
    const firstMins = fH * 60 + fM
    // Antes de la apertura visible (o madrugada operativa) no se dibuja.
    if (nowMins < firstMins) return miss

    const elapsed = nowMins - firstMins
    const idx = Math.floor(elapsed / 60)
    // Pasó la última fila visible: tampoco se dibuja.
    if (idx >= visibleSlots.length) return miss

    return { nowRowIndex: idx, nowFraction: (elapsed % 60) / 60 }
  }, [artNow.time, artNow.date, date, visibleSlots])

  const gridScrollRef = useRef<HTMLDivElement | null>(null)
  const nowLineRef = useRef<HTMLDivElement | null>(null)
  const didAutoScrollRef = useRef(false)
  useEffect(() => {
    if (didAutoScrollRef.current || nowRowIndex === null) return
    const container = gridScrollRef.current
    const marker = nowLineRef.current
    if (!container || !marker) return
    didAutoScrollRef.current = true
    // Medido, no estimado: con filas `1fr` el alto real solo se sabe después
    // del layout. La distancia del marcador al techo del scroller es la misma
    // cuenta con la que `scrollIntoView` centraría, pero fijando el 30% (y no
    // el 50%) que pide pages/grilla.md §6.
    const containerRect = container.getBoundingClientRect()
    const markerRect = marker.getBoundingClientRect()
    const offset = markerRect.top - containerRect.top + container.scrollTop
    container.scrollTop = Math.max(0, offset - container.clientHeight * 0.3)
  }, [nowRowIndex])

  return { nowRowIndex, nowFraction, gridScrollRef, nowLineRef }
}
