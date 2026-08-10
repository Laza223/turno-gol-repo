'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useMediaQuery } from '@/hooks/use-client-value'
import { cn } from '@/lib/utils'

type Props = {
  children: ReactNode
  className?: string
  /** Retraso en ms para entradas escalonadas en listas/grillas. */
  delay?: number
  /** Estilos inline adicionales (se combinan con `transitionDelay`). */
  style?: CSSProperties
}

/**
 * Revela su contenido con un fade-up sutil cuando entra en viewport.
 * Respeta prefers-reduced-motion: muestra el contenido al instante, sin animar.
 * Sirve como wrapper de Server Components (children se pasan por props).
 */
export default function Reveal({ children, className, delay = 0, style }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [revealed, setRevealed] = useState(false)

  // Con motion reducida el contenido se muestra al instante, sin observer ni
  // listener. Se lee con `useMediaQuery` (useSyncExternalStore) y no con un
  // setState adentro del efecto: así el primer render del cliente ya sabe la
  // respuesta en vez de pintar oculto y corregir en un segundo render.
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)', false)
  const shown = revealed || reducedMotion

  useEffect(() => {
    if (reducedMotion) return
    const el = ref.current
    if (!el) return

    function reveal() {
      setRevealed(true)
      io.disconnect()
      window.removeEventListener('scroll', onScrollPast, { capture: true })
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            reveal()
            break
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)

    // Red de seguridad: un flick de mobile puede mover el scroll de "el
    // elemento está debajo del viewport" a "ya quedó arriba del viewport" en
    // un único frame de composición, sin que el IntersectionObserver llegue a
    // registrar ninguna muestra con overlap ≥ threshold en el medio — la
    // sección queda opacity:0 PARA SIEMPRE (bug real: reportado en producción,
    // landing casi vacía en iPhone; en desktop la rueda del mouse genera
    // muchos más eventos de scroll de menor magnitud y nunca salta el hueco).
    // Si ya pasó de largo sin haber sido revelada, no tiene sentido seguir
    // ocultándola: se muestra igual apenas se detecta el salto.
    //
    // `capture: true` (no solo `passive`): el evento 'scroll' no burbujea, así
    // que un listener en `window` sin capturing solo ve el scroll del propio
    // documento. Si el layout cambia el día de mañana y algún ancestro termina
    // scrolleando su propio contenedor (`overflow-y: auto`), la fase de
    // captura sigue viéndolo igual — se propaga de la raíz hacia el target
    // pase lo que pase con `bubbles`.
    function onScrollPast() {
      if (!el) return
      if (el.getBoundingClientRect().bottom <= 0) reveal()
    }
    window.addEventListener('scroll', onScrollPast, { passive: true, capture: true })

    return () => {
      io.disconnect()
      window.removeEventListener('scroll', onScrollPast, { capture: true })
    }
  }, [reducedMotion])

  return (
    <div
      ref={ref}
      style={delay ? { ...style, transitionDelay: `${delay}ms` } : style}
      className={cn(
        'transition-all duration-700 ease-out motion-reduce:translate-y-0! motion-reduce:opacity-100! motion-reduce:transition-none',
        shown ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        className,
      )}
    >
      {children}
    </div>
  )
}
