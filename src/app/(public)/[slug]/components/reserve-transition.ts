import { flushSync } from 'react-dom'

/** Hacia dónde se mueve el paso: adelante entra desde la derecha, atrás desde la izquierda. */
export type StepDirection = 'forward' | 'back'

/**
 * Cambia de paso con una View Transition (sin librería: el CSS vive en `reserve-step.css`). La
 * dirección se marca en `<html>` mientras dura. `update` corre con `flushSync` porque la
 * transición saca la foto del DOM nuevo apenas vuelve el callback.
 *
 * Sin soporte (jsdom, navegadores viejos) o con "reducir movimiento" cambia al instante. Resuelve
 * cuando el paso nuevo ya está en pantalla y la animación terminó.
 */
export async function runStepTransition(
  direction: StepDirection,
  update: () => void,
): Promise<void> {
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (typeof document.startViewTransition !== 'function' || calm) {
    update()
    return
  }
  const root = document.documentElement
  root.dataset.reserveStep = direction
  try {
    await document.startViewTransition(() => flushSync(update)).finished
  } catch {
    // Una transición saltada (pestaña oculta, otra en curso) igual dejó el paso aplicado.
  } finally {
    delete root.dataset.reserveStep
  }
}
