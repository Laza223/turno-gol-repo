import type { WizardStep } from './onboarding.types'

/**
 * Los 5 pasos persistidos del wizard "por toques". Cada paso es una RUTA que agrupa
 * una o más pantallas que el cliente muestra de a una (una pregunta por pantalla);
 * el server guarda al final de la ruta. El orden no es arbitrario:
 *
 * - `canchas` va antes que `horarios` porque con el alta asistida
 *   (`onboarding_step: 1`) el dueño tiene que aterrizar en `canchas` con el
 *   complejo ya creado.
 * - `precios` va después de `horarios`: las reglas de precio se calculan sobre los
 *   horarios ya confirmados (`validatePricingRulesCoverage`). Recién ahí se crean
 *   las canchas.
 *
 * `/onboarding/resumen` y `/onboarding/listo` NO están acá: son el cierre, no pasos
 * que se completen.
 *
 * El `slug` es la URL: el botón atrás del navegador funciona porque cada paso tiene
 * la suya.
 */
export const WIZARD_STEPS = [
  { n: 1, slug: 'complejo', label: 'Tu complejo', hint: 'Nombre y dirección' },
  { n: 2, slug: 'canchas', label: 'Canchas', hint: 'Cuántas y de qué tipo' },
  { n: 3, slug: 'horarios', label: 'Horarios', hint: 'Cuándo abrís' },
  { n: 4, slug: 'precios', label: 'Precios', hint: 'Cuánto cobrás' },
  { n: 5, slug: 'tu-complejo', label: 'Tu día a día', hint: 'Cómo trabajás' },
] as const

/** Número de paso a partir del slug de la URL. `null` si el slug no existe. */
export function stepFromSlug(slug: string): WizardStep | null {
  const found = WIZARD_STEPS.find((s) => s.slug === slug)
  return found ? (found.n as WizardStep) : null
}

/** Ruta completa de un paso. Fuente única: nadie arma la URL a mano. */
export function stepPath(n: number): string {
  const step = WIZARD_STEPS.find((s) => s.n === n)
  return step ? `/onboarding/${step.slug}` : '/onboarding'
}

/** Resumen "¿Está todo bien?": solo se llega con los 5 pasos hechos. */
export const SUMMARY_PATH = '/onboarding/resumen'

/**
 * Paso visible a partir de la URL completa (`WizardChrome`): a diferencia de
 * `stepFromSlug`, nunca devuelve `null` — el chrome necesita SIEMPRE un paso para
 * dibujarse, incluso en `/onboarding` (bare, redirige antes de pintar nada),
 * `/onboarding/resumen` o `/onboarding/listo` (ambos 6: el cierre).
 */
export function stepFromPathname(pathname: string): WizardStep {
  if (pathname.startsWith('/onboarding/listo') || pathname.startsWith(SUMMARY_PATH)) return 6
  const slug = pathname.split('/').filter(Boolean).pop() ?? ''
  return stepFromSlug(slug) ?? 1
}

/**
 * A dónde va el dueño al terminar el paso `n`. Normalmente al siguiente; el último
 * paso va al resumen. Si ya había terminado los 5 (volvió con "Cambiar" desde el
 * resumen) y edita Complejo, Precios o Tu complejo, vuelve directo al resumen.
 * Canchas y Horarios NO acortan: cambiar la cantidad o el horario invalida los
 * precios ya cargados, así que el dueño pasa de nuevo por Precios (guardarlos
 * baja `onboarding_step` a ese paso, ver `stepToStore`).
 */
export function pathAfterStep(n: number, completedBefore: number): string {
  if (n >= 5) return SUMMARY_PATH
  if ((n === 1 || n === 4) && completedBefore >= 5) return SUMMARY_PATH
  return stepPath(n + 1)
}
