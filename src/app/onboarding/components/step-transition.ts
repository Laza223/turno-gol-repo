/**
 * Transición entre pantallas del alta. `direction` > 0 = avanzando (entra desde la
 * derecha); < 0 = volviendo (entra desde la izquierda). La usan `WizardChrome` (entre
 * rutas) y `SignupFlow` (entre pantallas de /register).
 */
export const STEP_VARIANTS = {
  enter: (direction: number) => ({ x: direction > 0 ? 28 : -28, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -28 : 28, opacity: 0 }),
}

export const STEP_TRANSITION = { type: 'tween', duration: 0.25, ease: 'easeOut' } as const
