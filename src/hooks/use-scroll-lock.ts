'use client'

import { useEffect } from 'react'

/**
 * Bloquea el scroll de la página mientras un overlay está abierto.
 *
 * `document.body.style.overflow = 'hidden'` —el patrón habitual— **no funciona
 * en iOS Safari**: el body deja de scrollear pero el gesto se propaga al
 * documento y el fondo se mueve igual detrás del overlay. La única forma
 * confiable es sacar el body del flujo con `position: fixed` compensando el
 * scroll actual con un `top` negativo, y restaurar la posición al soltar.
 *
 * Sin la restauración explícita, cerrar el overlay devuelve al usuario al tope
 * de la página — que en un perfil de complejo largo es peor que el bug original.
 *
 * Los overlays de Radix (Dialog, Sheet, DropdownMenu) traen su propio
 * scroll-lock vía `react-remove-scroll` y no necesitan este hook. Es para los
 * overlays montados a mano, como el lightbox de la galería.
 */
export function useScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return

    const { body } = document
    const scrollY = window.scrollY
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    }

    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    body.style.overflow = 'hidden'

    return () => {
      body.style.position = previous.position
      body.style.top = previous.top
      body.style.left = previous.left
      body.style.right = previous.right
      body.style.width = previous.width
      body.style.overflow = previous.overflow
      // `position: fixed` descarta el scroll: hay que devolverlo a mano.
      window.scrollTo(0, scrollY)
    }
  }, [locked])
}
