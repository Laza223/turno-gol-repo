'use client'

import { m } from 'motion/react'

/**
 * Cierre peak-end del wizard (plan de refactor §F, "check grande + stagger de
 * las acciones", ~500ms total): el ícono de éxito entra primero y más grande,
 * y el resto —título, texto, reconocimiento de la primera reserva, acciones
 * de compartir, link al panel— entra en cascada detrás.
 *
 * `motion` autorizado solo para el onboarding (MASTER §5.1); este componente
 * es exclusivo de `/onboarding/listo`.
 */
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
}

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
} as const

/** Contenedor: orquesta el stagger de sus `ListoRevealItem` hijos. */
export function ListoReveal({ children }: { children: React.ReactNode }) {
  return (
    <m.div initial="hidden" animate="show" variants={container}>
      {children}
    </m.div>
  )
}

/** Un tramo de la cascada. `big` es solo para el ícono: entra con más scale, es el "check grande". */
export function ListoRevealItem({
  children,
  big,
  className,
}: {
  children: React.ReactNode
  big?: boolean
  className?: string
}) {
  return (
    <m.div
      variants={
        big
          ? {
              hidden: { opacity: 0, scale: 0.5 },
              show: {
                opacity: 1,
                scale: 1,
                transition: { type: 'spring', stiffness: 350, damping: 20 },
              },
            }
          : item
      }
      className={className}
    >
      {children}
    </m.div>
  )
}
