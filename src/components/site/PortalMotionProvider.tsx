'use client'

import { LazyMotion, MotionConfig } from 'motion/react'

/** El paquete de animaciones va en un chunk aparte: el HTML del portal no espera por él. */
const loadDomAnimation = () => import('./portal-motion-features').then((m) => m.default)

/**
 * Habilita `motion` en el portal del jugador, y solo ahí (decisión 2026-11-13, portal de vidrio).
 * Hermano de `src/app/onboarding/motion-provider.tsx`: lo montan `PortalFrame` y la home, nunca
 * `(admin)`, así que el panel no suma ni un KB.
 *
 * `domAnimation` (animaciones, salidas y gestos de toque) y cargado en diferido. El arrastre y las
 * animaciones de layout piden `domMax`, que carga la hoja de abajo (`GlassSheetContent`) recién
 * cuando se monta (dirección §4.2).
 *
 * `reducedMotion="user"` NO es opcional: sin esa línea `motion` ignora el `prefers-reduced-motion`
 * que el resto del producto respeta.
 */
export function PortalMotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadDomAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}
