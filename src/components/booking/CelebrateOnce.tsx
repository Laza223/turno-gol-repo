'use client'

import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { CELEBRATED_COOKIE } from '@/lib/booking/celebrate'

function readCelebrated(): string | undefined {
  const pair = document.cookie.split('; ').find((c) => c.startsWith(`${CELEBRATED_COOKIE}=`))
  return pair?.slice(CELEBRATED_COOKIE.length + 1)
}

/**
 * La reserva confirmada festeja una vez por visita (dirección §4.8). La primera vez deja la marca
 * (`CELEBRATED_COOKIE`) y, en un celular sin "reducir movimiento", vibra corto dos veces (§5.6).
 * Al recargar, el servidor ya la leyó y manda `seen`: `data-seen` sale en el HTML y todo queda en
 * su estado final desde el primer cuadro. Al volver sin recargar (caché del router), el efecto lee
 * la cookie y pone `data-seen` antes de pintar. La coreografía es CSS (`.rv-celebrate` en
 * `reserva.css`): sin JS se ve igual.
 */
export default function CelebrateOnce({
  bookingId,
  seen = false,
  className,
  children,
}: {
  bookingId: string
  /** La cookie ya decía esta reserva cuando el servidor armó la página. */
  seen?: boolean
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  // StrictMode monta dos veces en dev: sin esto, la segunda vuelta leería la marca recién escrita
  // y apagaría el festejo de la primera visita.
  const ran = useRef(false)

  useLayoutEffect(() => {
    if (seen || ran.current) return
    ran.current = true
    if (readCelebrated() === bookingId) {
      ref.current?.setAttribute('data-seen', '')
      return
    }
    document.cookie = `${CELEBRATED_COOKIE}=${bookingId}; path=/reserva; SameSite=Lax`
    const touch = window.matchMedia('(pointer: coarse)').matches
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (touch && !calm) navigator.vibrate?.([12, 70, 12])
  }, [bookingId, seen])

  return (
    <div ref={ref} className={className} data-seen={seen ? '' : undefined}>
      {children}
    </div>
  )
}
