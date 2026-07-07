'use client'

import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import type { ArtNow } from '@/hooks/use-art-now'

type Params = {
  artNow: ArtNow
  date: string
  visibleSlots: string[]
  hasBand: boolean
  rowHeightRem: number
}

/**
 * Línea de "ahora" de la grilla + scroll-to-now al cargar (pages/grilla.md §6).
 * `nowTopRem` es el offset vertical (en rem) de la línea roja, o null si el día
 * mostrado no es hoy / la hora quedó fuera del rango visible. El efecto de
 * auto-scroll corre una vez por fecha (el componente se remonta con key={date})
 * y deja la línea al ~30% del alto del scroller.
 */
export function useNowLine({ artNow, date, visibleSlots, hasBand, rowHeightRem }: Params): {
  nowTopRem: number | null
  gridScrollRef: MutableRefObject<HTMLDivElement | null>
} {
  // Filas de 60 min (fix del bug ÷30 que la dibujaba al doble de distancia) +
  // offset de header y banda de colapso.
  const nowTopRem = useMemo(() => {
    if (!artNow.date || artNow.date !== date) return null
    const first = visibleSlots[0]
    if (!first) return null
    const [nH, nM] = artNow.time.split(':').map(Number)
    const [fH, fM] = first.split(':').map(Number)
    if (nH === undefined || nM === undefined || fH === undefined || fM === undefined) return null

    const nowMins = nH * 60 + nM
    const firstMins = fH * 60 + fM
    // Antes de la apertura visible (o madrugada operativa) no se dibuja.
    if (nowMins < firstMins) return null

    // Header 2.75rem + banda de madrugada 2.75rem (44px touch — debe coincidir
    // con gridTemplateRows de GridScroller).
    const headerRem = 2.75 + (hasBand ? 2.75 : 0)
    const top = headerRem + ((nowMins - firstMins) / 60) * rowHeightRem
    const maxTop = headerRem + visibleSlots.length * rowHeightRem
    return top <= maxTop ? top : null
  }, [artNow.time, artNow.date, date, visibleSlots, hasBand, rowHeightRem])

  const gridScrollRef = useRef<HTMLDivElement | null>(null)
  const didAutoScrollRef = useRef(false)
  useEffect(() => {
    if (didAutoScrollRef.current || nowTopRem === null) return
    const el = gridScrollRef.current
    if (!el) return
    didAutoScrollRef.current = true
    const remPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    el.scrollTop = Math.max(0, nowTopRem * remPx - el.clientHeight * 0.3)
  }, [nowTopRem])

  return { nowTopRem, gridScrollRef }
}
