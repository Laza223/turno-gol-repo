'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true)
            io.disconnect()
            break
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

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
