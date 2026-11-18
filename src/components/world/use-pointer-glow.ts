'use client'

import { useCallback } from 'react'

/**
 * Brillo que sigue al puntero (dirección §5.3): un punto de luz tenue en el borde, donde está el
 * cursor. Solo en la compu (mouse) y solo en la tarjeta del buscador de la home y en las de planes.
 * Escribe `--mx` y `--my` en el elemento una vez por cuadro; el dibujo es de `.glow-follow`
 * (globals.css), que no se pinta con "reducir movimiento" ni en pantallas táctiles.
 */
export function usePointerGlow<T extends HTMLElement>() {
  return useCallback((el: T | null) => {
    if (!el) return
    let frame = 0
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect()
        el.style.setProperty('--mx', `${e.clientX - r.left}px`)
        el.style.setProperty('--my', `${e.clientY - r.top}px`)
        el.dataset.glow = ''
      })
    }
    const leave = () => {
      cancelAnimationFrame(frame)
      delete el.dataset.glow
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
    }
  }, [])
}
