'use client'

import { LazyMotion, MotionConfig, domAnimation } from 'motion/react'

/**
 * Habilita `motion` para el wizard, y solo para el wizard.
 *
 * MASTER §5.1 prohíbe librerías de animación en el stack; el onboarding es la
 * excepción escrita en esa enmienda, porque se recorre una vez en la vida del
 * complejo y no es una superficie de tarea repetida. Vive fuera de `(admin)`, así
 * que estos KB no entran al bundle del panel que se usa 8 horas por día.
 *
 * `domAnimation` en vez del bundle completo: ~15 KB contra ~34 KB. Alcanza para
 * todo lo que hace el wizard (opacity, transform, layout, AnimatePresence); lo que
 * quedaría afuera es `domMax` (drag y path drawing), que acá no se usa.
 *
 * `reducedMotion="user"` NO es opcional: sin esa línea, `motion` ignora el
 * `prefers-reduced-motion` que el resto del producto respeta en tres capas
 * (globals.css, la utility `motion-reduce:` y el `useMediaQuery` de Reveal).
 */
export function WizardMotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}
